---
title: "Minimal API Without MediatR"
description: "Why ServiceDeskLite injects handlers directly into endpoints instead of dispatching through a mediator - and when that decision should be revisited."
date: "2026-05-04"
readMin: 3
draft: false
---

Two questions shape the API host in most .NET projects: which routing model, and whether to use a mediator library. ServiceDeskLite answers both deliberately: Minimal API, and no mediator.

Neither is the default choice in many architectures. MediatR in particular has become something of a convention - added early, used everywhere, regardless of whether the pipeline it enables is actually needed. The question I started with was: what's missing if I don't add it?

## What MediatR Would Add

MediatR's core value is `IPipelineBehavior<,>`. Cross-cutting concerns - logging every handler invocation, running validation before every command, enforcing authentication - can be expressed once as a behaviour and applied to every handler call without touching the call site.

Without MediatR, those concerns live at the middleware level or are handled per-handler. For ServiceDeskLite's current surface - four ticket endpoints, one aggregate - there are no cross-cutting handler concerns that need a pipeline. Logging is handled by Serilog at the middleware level. Validation is per-handler. Authentication isn't in scope.

Adding MediatR before there's something to put in the pipeline is infrastructure debt, not capital. The registration layer, the `ISender` abstraction, the assembly scanning - all of it is overhead for zero current benefit.

## How Handlers Are Wired Instead

Endpoints are defined as static methods on a `RouteGroupBuilder` extension class. Handler types are injected directly as endpoint parameters by the framework's DI-aware parameter binding:

```csharp
group.MapPost("/", async (
    CreateTicketRequest request,
    CreateTicketHandler handler,
    CancellationToken ct) =>
{
    var command = request.ToCommand();
    var result = await handler.HandleAsync(command, ct);
    return result.ToHttpResult();
});
```

`CreateTicketHandler` is registered as a scoped service in DI. The endpoint calls it directly. No `ISender.Send(command)`, no mediator lookup, no dispatch indirection.

The call site is explicit: you can read an endpoint and know exactly which handler it calls. There's no layer of convention-based dispatch to trace through.

## The CQRS Question

ServiceDeskLite separates commands and queries as distinct types with distinct handlers - `CreateTicketHandler`, `GetTicketByIdHandler`, `UpdateTicketStatusHandler`, `GetTicketsHandler`. That's lightweight CQRS: separate read and write models at the application layer, with explicit handler types per use case.

It's not the heavier CQRS variant - no MediatR request pipeline, no separate read database, no event projection. The read/write boundary is visible without the infrastructure. Lightweight CQRS with direct handler injection is a different point on the tradeoff curve than "full CQRS with MediatR", and it's worth keeping them distinct.

## When to Revisit

There are two concrete triggers. First: a cross-cutting concern that needs to apply uniformly to every handler call - authentication enforcement, retry logic, distributed tracing spans. At that point, `IPipelineBehavior<,>` earns its existence and MediatR becomes the right answer. Second: the endpoint surface grows to the point where each endpoint orchestrates multiple handlers, making the parameter list unwieldy. At that point, Controllers or a dispatcher starts to justify the ceremony.

Neither has happened yet. The re-evaluation point is named explicitly, not deferred indefinitely - the ADR for this decision lists the triggers. When the complexity arrives, the migration path is clear: endpoints call `ISender.Send(command)` instead of `handler.HandleAsync(command, ct)`. The handlers themselves don't change.
