---
title: "Architecture Enforced by the Compiler"
description: "Why ServiceDeskLite enforces Clean Architecture dependency rules through project references rather than naming conventions - and what that costs."
date: "2026-05-04"
readMin: 4
draft: false
---

The most common version of Clean Architecture I've encountered uses naming conventions and code review to enforce the dependency rules. Domain types don't reference infrastructure types - by convention. The application layer doesn't import HTTP concerns - by agreement. The structure exists in documentation and in the reviewer's memory.

That's a weak guarantee. The compiler enforces nothing. A developer in a hurry adds a reference, the tests stay green, and the boundary is gone. Three months later, the codebase has a `HttpContext` somewhere in the domain.

ServiceDeskLite takes a different approach. The dependency rules are enforced by project references - the compiler is the gatekeeper, not the reviewer.

## The Enforcement Mechanism

Six projects, each with an explicit `<ProjectReference>` list. `Domain.csproj` has no reference to `Infrastructure.csproj`. It cannot see `DbContext`, `IServiceCollection`, or anything from ASP.NET Core. Adding a reference is a deliberate, visible action - a line in a `.csproj` file, visible in the diff, not an errant `using` statement.

The dependency graph looks like this:

```
Api → Application → Domain
Api → Infrastructure → Application
Api → Infrastructure.InMemory → Application
Web → Contracts
Api → Contracts
```

`Infrastructure` knows about `Application` (it implements its ports). `Application` knows about `Domain`. `Domain` knows nothing outside itself. The direction is strictly inward at every layer. If you try to violate it, the build fails.

## What This Enforces in Practice

Repository and unit-of-work interfaces live in `Application`, not in `Infrastructure`. `ITicketRepository` and `IUnitOfWork` are application-layer types - the concrete EF Core implementations and the hand-rolled InMemory implementations are adapters that implement those interfaces. Swapping the persistence stack requires changing which adapters are registered in the composition root, nothing more. The handlers never need to know.

The HTTP boundary is similarly enforced. API endpoints live in the `Api` project. `Application` has no reference to `Api`. A handler can never accidentally return an `IResult`, reference `HttpContext`, or import from `Microsoft.AspNetCore`. The domain model is clean not because developers remember to keep it clean, but because the project graph makes it structurally impossible to dirty it.

## The Cost

Multi-project ceremony. A typical feature touches `Domain` (entity or invariant change), `Application` (handler, command, query), one or both infrastructure adapters (repository method), `Contracts` (request/response DTO), and `Api` (endpoint). Five projects for one feature. In a flat CRUD project, that's one file.

The mapping overhead is real too. Domain types don't leak into contracts, so there's an explicit conversion at each boundary. A `Ticket` entity becomes a `TicketResponse` DTO in `Contracts` through a mapping step in the `Api` layer. When the entity grows a new field, the mapping must be updated. It's mechanical, it's repetitive, and it must be done every time.

## Why the Tradeoff Makes Sense Here

The project exists to demonstrate that this architecture holds under realistic pressure. A new adapter can be added, a field can be added to the domain model, a persistence provider can be swapped - and the dependency rules remain intact. The way to demonstrate that is to enforce the rules mechanically and then actually do those things.

EF Core and InMemory both implement the same `ITicketRepository` interface. Both run against the same test suite. That isn't possible without real port boundaries. The compiler enforcement is what makes the port boundaries real rather than aspirational.

For a production team working under delivery pressure, the ceremony has to earn its cost every sprint. For a reference project designed to show what strict architecture looks like, it's the point.
