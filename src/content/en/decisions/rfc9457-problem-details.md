---
title: "RFC 9457 as the Unified Error Contract"
description: "Why ServiceDeskLite uses ProblemDetails with custom extension fields as its single error format - and how the contract is shared without coupling the Web to the API."
date: "2026-05-04"
readMin: 3
draft: false
---

An API that returns different error shapes for different status codes forces every client to maintain separate parsing logic per error case. A 400 looks one way, a 404 looks another, an unhandled exception looks a third. Clients accumulate branching logic, and any inconsistency in the server-side format becomes a client-side bug.

ServiceDeskLite commits to one error format across the entire surface: RFC 9457 `application/problem+json`, extended with four additional fields.

## The Shape

Every error response - whether it originates from a handler result or an unhandled exception - has the same structure:

```json
{
  "status": 400,
  "title": "Validation failed",
  "instance": "/api/v1/tickets",
  "code": "create_ticket.title.required",
  "errorType": "validation",
  "traceId": "00-a1b2c3d4e5f6...-01"
}
```

`status`, `title`, and `instance` are standard RFC 9457 fields. The four additions are `code`, `errorType`, `traceId`, and an optional `meta` for structured field-level context (used when returning validation errors with per-field messages).

`code` is the machine-readable discriminator - a stable, parseable string that tells the client exactly what failed without requiring it to parse the human-readable `title`. `traceId` links the response directly to a structured log entry on the server. `detail` is intentionally `null` in production to avoid leaking internal information.

## Unified, Not Split

Both handler errors and unhandled exceptions flow through the same factory. `ResultToProblemDetailsMapper` handles the result path - it reads the `ErrorType` from the handler's `ApplicationError` and delegates to `ApiProblemDetailsFactory`. `ApiExceptionHandler` handles the exception path - it classifies the exception and delegates to the same factory.

There's no secondary error format anywhere in the API surface. A client that can parse one error response can parse all of them.

## Sharing the Contract Without Coupling

The Blazor Web client needs to parse error responses. The obvious approach - reference the `Api` project from `Web` - would break the architecture: `Web` would gain a dependency on `Api`, pulling in ASP.NET Core concerns and collapsing the layer boundary between them.

Instead, the extension field names (`code`, `errorType`, `traceId`, `meta`) are defined as constants in the `Contracts` project, in a `ProblemDetailsContract` class. Both `Api` and `Web` reference `Contracts`. The Web client deserialises the error response using those constants and never needs to know anything about how the API constructs the response internally.

## What the Standard Buys

ASP.NET Core understands `application/problem+json` out of the box. OpenAPI tooling generates correct schema references for it. Test assertion libraries have built-in support for it. Using the standard means less glue code everywhere - the format has already been integrated into the ecosystem.

The `traceId` field is the most operationally useful extension. When a user reports an error, the trace ID in the response maps directly to a Serilog log entry. No guessing, no timestamp correlation, no digging through logs for the right request.

## The Cost

Adding a new error category is a three-file change: `ErrorType` in `Application`, the HTTP mapping switch in `ResultToProblemDetailsMapper`, and the same switch in `ApiExceptionHandler`. For the current set of five error types, that's low maintenance. If the set grows large, the mapping table becomes a coordination point.

The `code` field also demands discipline. It's the stable, client-visible discriminator - changing a code value is a breaking change for any client that branches on it. The naming convention (`handler_name.field.reason`) keeps codes predictable and self-documenting, but enforcing that convention across a larger team would need a linting rule, not just a README section.
