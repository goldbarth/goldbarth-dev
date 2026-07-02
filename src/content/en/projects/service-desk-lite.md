---
title: "ServiceDeskLite"
description: "A .NET 10 Clean Architecture reference — strict layer boundaries enforced by the compiler, two interchangeable persistence adapters, an AI intake assistant as an edge adapter, and every decision documented as an ADR."
date: "2026-05-04"
readMin: 7
draft: false
---

## What it is

ServiceDeskLite is a ticket workflow backend built on .NET 10. Tickets move through a Kanban-style state machine — open, in progress, resolved, closed — with explicit transition rules enforced at the domain level. Three independently testable layers: a domain that knows nothing about HTTP or databases, an application layer that orchestrates use cases, and two interchangeable persistence adapters behind the same repository interfaces. A Blazor Server frontend consumes the API over HTTP.

Since v1.1.0 it also ships an AI intake assistant: users describe their problem in free text and a Claude model creates the ticket via tool calling — streamed live over SSE, executed exclusively through the existing command handlers.

The goal isn't feature breadth. The goal is structural clarity — every layer boundary visible and compiler-enforced, every decision documented, every tradeoff argued.

Full documentation and all 23 ADRs: [goldbarth.github.io/ServiceDeskLite](https://goldbarth.github.io/ServiceDeskLite/)

## Problem / Motivation

I've seen codebases where Clean Architecture was the stated approach but the dependency rules existed only in diagrams and code reviews. Something always leaked. Infrastructure types appearing in domain methods. HTTP concerns creeping into use cases. Not through carelessness — through the fact that naming conventions and reviewer attention are weak enforcement mechanisms. The compiler enforces nothing.

I wanted to build something where the dependency direction is enforced by project references, not by trust. Where the answer to "can the domain layer see the database?" is "it doesn't have a reference to that project" — not "it shouldn't, and we check in code review."

ServiceDeskLite is that experiment. Small enough to hold entirely in your head, structured strictly enough that the architecture is legible in the `.csproj` files.

## Architecture / Key Decisions

Six projects. Strict inward dependency flow.

```
┌─────────────────────────────────────┐
│              Web (Blazor)           │
├─────────────────────────────────────┤
│           API (Minimal API)         │
├───────────────────┬─────────────────┤
│  Infrastructure   │  Infra.InMemory │
├───────────────────┴─────────────────┤
│           Application               │
├─────────────────────────────────────┤
│              Domain                 │
└─────────────────────────────────────┘
```

The domain knows nothing outside itself. The application knows the domain and defines port interfaces for persistence. Infrastructure implements those ports. The API wires everything together via Minimal API endpoints that inject handlers directly from DI — no mediator, no dispatch layer.

Two persistence implementations live behind the same `ITicketRepository` and `IUnitOfWork` ports: one EF Core backed by PostgreSQL, one hand-rolled `ConcurrentDictionary` store. Both honour the same unit-of-work commit boundary. Switching is one config value. The swap proves the port boundaries hold — not in prose, in running tests.

Every handler returns `Result<T>` — never throws for expected failures. The API layer maps error types to HTTP status codes in one place. RFC 9457 `ProblemDetails` is the error contract across the entire surface.

The AI assistant is the newest stress test for these boundaries: an LLM is an external, non-deterministic service whose tool calls want to mutate domain state. It lives as an edge adapter in the API project — streaming and SSE framing are presentation concerns — and reaches the domain only through the same command handlers the REST endpoints use. Tool inputs are treated as untrusted input: parsed and guarded before they touch a handler; rejected inputs return as error `tool_result`s so the model self-corrects inside a bounded loop. Domain and Application compile without any Anthropic reference.

→ [Architecture Enforced by the Compiler](/decisions/clean-architecture-enforced-by-compiler)
→ [Result Pattern at the Application Boundary](/decisions/result-pattern-application-boundary)
→ [RFC 9457 as the Unified Error Contract](/decisions/rfc9457-problem-details)
→ [Minimal API Without MediatR](/decisions/minimal-api-without-mediatr)
→ [Swappable Persistence as Port Proof](/decisions/swappable-persistence-port-proof)
→ [Strongly-Typed Domain Identifiers](/decisions/strongly-typed-domain-ids)
→ [AI Assistant as an Edge Adapter](/decisions/ai-assistant-edge-adapter)

## Challenges

The InMemory persistence adapter was the sharpest test of the architecture.

EF Core ships its own `InMemory` provider. It's the obvious choice for tests and development — no files, no migration step. I ruled it out early: it doesn't honour transaction semantics. Writes are immediately visible without calling `SaveChanges`. If I'd used it, the InMemory and PostgreSQL paths would behave differently under the same application code, and the architecture's central claim — that adapters are interchangeable above the port boundary — would be untestable.

The alternative was writing a hand-rolled implementation: a singleton `ConcurrentDictionary` store with a scoped `IUnitOfWork` that buffers adds in a `PendingAdds` list and applies them to the store only on `SaveChangesAsync`. More code, but the commit boundary is real. Unit-of-work isolation tests that pass against InMemory are meaningful, because the InMemory provider deliberately withholds uncommitted writes from concurrent reads.

The other persistent friction point was the `Contracts` project. Versioned request and response DTOs live there, shared between the API and the Blazor Web client. That boundary keeps the Web clean — it never references `Application`, `Domain`, or `Infrastructure` directly. But it means every field addition touches one more project, and the mapping layer between domain and contract types adds ongoing overhead. For a reference project, the tradeoff is worth it. For a team moving fast on features, it needs a harder justification.

## Takeaways

The architecture earns its cost immediately in testing. Handlers run under `xUnit` with no web host, no middleware, no database. Inject the handler, call `HandleAsync`, assert the result. The result type makes assertions clean — no try/catch blocks, no exception inspection. The integration suite runs both persistence providers through the same test cases via a `[ProviderMatrix]` attribute.

The persistence swap was the clearest validation. `PERSISTENCE__PROVIDER=InMemory` in development, `Postgres` in CI. Same handler code, same test cases, both green. That's the architecture working. Not described as working — demonstrated.

If I built it again, I'd introduce the `Contracts` project earlier and think harder about what version stability means for a reference project. The versioning ceremony (`V1` namespace, explicit mapping) is correct practice, but it adds noise when the API surface isn't actually evolving. For a second milestone that introduces breaking API changes, it will justify itself completely.
