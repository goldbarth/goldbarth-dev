---
title: "Strongly-Typed Domain Identifiers"
description: "Why ServiceDeskLite wraps Guid in a TicketId record struct - what the compiler catches, what the mapping overhead costs, and how UUIDv7 makes it better."
date: "2026-05-04"
readMin: 3
draft: false
---

Every aggregate needs an identifier. The simplest choice is `Guid` - one type, no ceremony, works everywhere. The problem becomes visible the moment you have two aggregates.

With raw `Guid`, a method that expects a ticket ID will silently accept any other `Guid` in scope - an audit event ID, a comment ID, a future user ID. The compiler sees `Guid`, the method expects `Guid`, everything compiles. The mistake surfaces at runtime, usually as a confusing 404 or a silent data association across the wrong records. The compiler could have caught it before the code ran, but there was nothing for it to catch.

ServiceDeskLite uses a distinct `readonly record struct` for each aggregate identity.

## The Type

```csharp
public readonly record struct TicketId(Guid Value)
{
    public static TicketId New() => new(Guid.CreateVersion7());
}
```

That's the entire implementation. `readonly record struct` gives structural equality, immutability, stack allocation, and a clean `ToString()` for free. `TicketId.New()` encapsulates the ID generation strategy - callers never call `Guid.NewGuid()` or `Guid.CreateVersion7()` directly.

Passing a `CommentId` where a `TicketId` is expected is now a compile error. Not a test failure - a compile error. The distinction matters.

## The UUIDv7 Choice

The original implementation used `Guid.NewGuid()`, which produces random (version 4) UUIDs. Random UUIDs are problematic for B-tree indexes: each new insert lands at a random position in the index, causing page splits and fragmentation over time.

`Guid.CreateVersion7()` - available since .NET 9 - generates time-ordered UUIDs. The most significant bits encode a millisecond timestamp, so new IDs are always appended near the end of the index rather than inserted at arbitrary positions. For PostgreSQL with a UUID primary key, time-ordered IDs improve insert performance under load and make index locality predictable.

The change was one line in `TicketId.New()`. No consumers changed. That's the value of encapsulating the creation strategy.

## Layer Boundaries for ID Types

Not every layer uses `TicketId`. The HTTP boundary and the JSON contract use raw `Guid`:

| Layer          | Type used   | Note                                               |
|----------------|-------------|----------------------------------------------------|
| Domain         | `TicketId`  | Authoritative type                                 |
| Application    | `TicketId`  | Handlers and use-case DTOs use the domain type     |
| Infrastructure | `TicketId`  | Mapped to `Guid` column via `TicketIdConverter`    |
| API (HTTP)     | `Guid`      | Route constraint `{id:guid}`, converted at entry  |
| Contracts      | `Guid`      | Response DTOs use `Guid` for clean JSON output    |

The API endpoint receives a `Guid` from the route and converts it to `new TicketId(id)` at the boundary. Inside the application and domain layers, only `TicketId` appears. `Guid` never leaks inward.

The Contracts layer uses `Guid` in response DTOs because `TicketId` would serialise as `{ "value": "..." }` rather than a plain string. Using `Guid` there means a simple `Guid` field in JSON - no custom converter needed on the client side.

## The Cost

Each new aggregate requires a new ID type, a new EF Core value converter, and a `ValueGeneratedNever()` call in the entity configuration. The value converter bridges the type to the database column and back:

```csharp
public class TicketIdConverter : ValueConverter<TicketId, Guid>
{
    public TicketIdConverter()
        : base(id => id.Value, value => new TicketId(value)) { }
}
```

For a single aggregate, this is a one-time setup cost. For five aggregates, it's five converters. The converter code is mechanical and short, but it must be remembered when a new aggregate is introduced.

The mapping step at the HTTP boundary - `new TicketId(id)` in the endpoint - is also something that must be done intentionally. It's a good reminder that the boundary is real, but it's friction nonetheless.

Whether the tradeoff is worth it depends on how many aggregates exist and how important cross-aggregate ID confusion is in the specific domain. For a codebase with one aggregate, the benefit is modest. For a codebase with ten, catching an ID confusion at compile time rather than at runtime pays for itself immediately.
