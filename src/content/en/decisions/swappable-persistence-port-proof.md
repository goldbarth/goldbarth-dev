---
title: "Swappable Persistence as Port Proof"
description: "Why ServiceDeskLite ships two complete persistence implementations - and why EF Core's built-in InMemory provider wasn't one of them."
date: "2026-05-04"
readMin: 4
draft: false
---

Clean Architecture makes a claim: adapters are interchangeable. Swap the persistence layer and nothing above the port boundary changes. The claim is easy to write in a README. The way to verify it is to actually do the swap, run the same tests against both implementations, and see if they pass.

ServiceDeskLite has two complete persistence implementations: one backed by EF Core and PostgreSQL, one hand-rolled against a `ConcurrentDictionary`. Both implement the same `ITicketRepository` and `IUnitOfWork` interfaces. Both run against the same integration test suite. The active implementation is selected at startup by reading a configuration value - no code change, no recompile.

## Why Not EF Core's InMemory Provider

EF Core ships a built-in `InMemory` provider. It's the obvious choice for tests and development: no files, no migration step, fast startup. I ruled it out for one reason - it doesn't honour transaction semantics.

In EF Core's `InMemory` provider, writes are visible immediately without calling `SaveChanges`. Uncommitted adds are readable by the same context and by other operations in the same process. For a codebase where the unit-of-work commit boundary is an explicit architectural decision - where `SaveChangesAsync` is the single point at which pending writes become durable - this behaviour makes the InMemory and PostgreSQL paths fundamentally different. A test that passes against the EF Core InMemory provider is not testing the same commit semantics that PostgreSQL enforces.

If the two providers behave differently, the swap isn't real. It's a different application with a different name.

## The Hand-Rolled Store

The InMemory implementation is intentionally minimal. `InMemoryStore` is a singleton `ConcurrentDictionary` that holds committed tickets. `InMemoryUnitOfWork` is a scoped service that holds a `PendingAdds` list. The commit operation applies pending adds to the store atomically:

```csharp
public Task SaveChangesAsync(CancellationToken ct = default)
{
    foreach (var ticket in _pendingAdds)
        _store.Upsert(ticket);

    _pendingAdds.Clear();
    return Task.CompletedTask;
}
```

Before `SaveChangesAsync` is called, the added ticket is invisible to the repository's read methods. After it's called, it's visible. That's the same contract EF Core enforces with a real database transaction. The commit boundary means the same thing in both implementations.

## DI Lifetimes Matter

Getting the lifetimes right was more subtle than the implementation itself:

| Type                       | Lifetime  | Reason                                          |
|----------------------------|-----------|-------------------------------------------------|
| `InMemoryStore`            | Singleton | Shared in-process state - survives requests     |
| `InMemoryUnitOfWork`       | Scoped    | Per-request pending-add buffer                  |
| `InMemoryTicketRepository` | Scoped    | Reads from singleton store, references scoped UoW |

If `InMemoryStore` were scoped, data would disappear between requests. If `InMemoryUnitOfWork` were singleton, pending adds from one request would bleed into another. The lifetimes encode the same assumptions that a database transaction encodes: shared durable state (singleton), per-request transient buffer (scoped).

## Fail-Fast Configuration

The composition root reads `Persistence:Provider` and registers either the PostgreSQL or InMemory adapter. Any value other than `"Postgres"` or `"InMemory"` throws `InvalidOperationException` at startup:

```csharp
_ => throw new InvalidOperationException(
    $"Unknown persistence provider: '{provider}'. Valid values: 'Postgres', 'InMemory'.")
```

No silent fallback. A misconfigured deployment fails immediately with a clear message rather than starting up in an unintended state and failing later with a confusing error.

## What the Swap Proves

The end-to-end test suite runs both providers via a `[ProviderMatrix]` attribute. Tests that cover the commit boundary - uncommitted writes are not readable, committed writes are - run against both implementations and pass against both.

The swap proves the port boundary is real. Not claimed in documentation - demonstrated in running tests. That's the difference between an architecture that holds and one that's aspirational.
