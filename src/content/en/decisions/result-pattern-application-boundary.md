---
title: "Result Pattern at the Application Boundary"
description: "How ServiceDeskLite uses an explicit Result type to make handler outcomes visible - and where DomainExceptions still belong."
date: "2026-05-04"
readMin: 4
draft: false
---

The default error-handling model in C# is exceptions. A method returns a value on success and throws on failure. The problem is that "failure" covers a lot of ground. A ticket not found is failure. A title field missing is failure. An invalid status transition is failure. So is a database connection dropping.

Those four cases call for four different HTTP status codes. They represent fundamentally different kinds of problems. But from the call site, they all look the same - a thrown exception that the caller either catches specifically or lets propagate.

ServiceDeskLite uses a `Result<T>` type instead. Every handler returns `Result` (for void operations) or `Result<T>` (when there's a value). Success and failure are both explicit in the return type.

## What the Type Carries

```csharp
// void operation
Result result = await handler.HandleAsync(command, ct);

// value operation
Result<TicketResponse> result = await handler.HandleAsync(query, ct);
```

A failure result carries an `ApplicationError` with three fields: a machine-readable `code` (e.g. `"create_ticket.title.required"`), a human-readable `message`, and an `ErrorType` enum that drives HTTP status mapping:

| ErrorType        | HTTP Status |
|------------------|-------------|
| `Validation`     | 400         |
| `DomainViolation`| 400         |
| `NotFound`       | 404         |
| `Conflict`       | 409         |
| `Unexpected`     | 500         |

The API layer has one mapper - `ResultToProblemDetailsMapper` - that reads the `ErrorType` and produces the correct `ProblemDetails` response. There's no exception filter chain, no `catch (SpecificException)` scattered across endpoints. One place, one switch, done.

## The DomainException Boundary

The domain layer still uses exceptions to enforce invariants - that's its job. A ticket in `Closed` state that receives a `Reopen` command throws a `DomainException` immediately, before any persistence is touched.

The application handler catches it, exactly once:

```csharp
try
{
    ticket.Reopen();
}
catch (DomainException ex)
{
    return Result.DomainViolation(DomainExceptionMapper.Map(ex));
}
```

After that catch, no domain exception reaches the HTTP layer. The handler converts it into a `Result.DomainViolation`, which the API maps to HTTP 400. The domain can enforce its rules aggressively using exceptions; the application boundary converts those exceptions into structured outcomes before they leave.

## What Is Never Caught

`OperationCanceledException` is explicitly not caught by handlers. Request cancellation is not a business error - it's infrastructure. If the client disconnects mid-request, the exception propagates to the API's exception handler, which classifies it separately from application errors.

This is an intentional gap in the handler's error handling surface. Catching `OperationCanceledException` in a handler would silently swallow client disconnects, mask them as application errors, and write misleading log entries. The rule is simple: handlers catch `DomainException`, nothing else.

## The Cost

Every error case needs an explicit return. There's no implicit propagation - if a validation check fails, the handler must return `Result.Validation(...)` at that point. For handlers with multiple validation steps, the structure becomes repetitive:

```csharp
var validationResult = Validate(command);
if (!validationResult.IsSuccess) return validationResult;

var ticket = await _repository.FindAsync(id, ct);
if (ticket is null) return Result.NotFound("ticket.not_found", "Ticket not found.");
```

More lines than a version that throws and lets middleware catch. But the failure surface is visible at each step. Reading the handler tells you exactly what can go wrong and where.

## What This Buys in Tests

Handler tests don't need try/catch. They call `HandleAsync` and assert on the result:

```csharp
var result = await handler.HandleAsync(command, ct);

Assert.False(result.IsSuccess);
Assert.Equal(ErrorType.Validation, result.Error.Type);
Assert.Equal("create_ticket.title.required", result.Error.Code);
```

No `Assert.Throws`, no exception inspection, no implicit test behaviour from uncaught exceptions. The test reads like a specification of what the handler returns under each condition.
