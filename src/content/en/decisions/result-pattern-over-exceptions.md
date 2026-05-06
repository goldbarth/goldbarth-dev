---
title: "Result Pattern over Exceptions"
description: "Why Ingestor uses a Result<T> type instead of exceptions at application boundaries — what it makes explicit, what it costs, and where exceptions still belong."
date: "2026-05-02"
readMin: 3
draft: false
---

Exceptions are a control flow mechanism that C# uses for errors. They're also invisible in method signatures. A method that returns `ImportJob` might throw `ValidationException`, `NotFoundException`, `ConflictException`, or nothing at all — you can't tell from the signature. You find out at runtime, or by reading the implementation, or by looking at the tests if they exist.

For a pipeline where every handler can fail in several distinct ways, this felt like the wrong tradeoff.

## What Result<T> Does

`Result<T>` makes failure explicit in the return type:

```csharp
public sealed class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public ApplicationError? Error { get; }

    public static Result<T> Success(T value) => ...;
    public static Result<T> Conflict(string code, string message) => ...;
    public static Result<T> NotFound(string code, string message) => ...;
    public static Result<T> Validation(string code, string message) => ...;
}
```

A handler that can return a job or fail with a conflict has signature:

```csharp
Task<Result<ImportJobResponse>> Handle(CreateImportJobCommand command, CancellationToken ct);
```

The caller cannot ignore the failure case without explicitly choosing to. No invisible exception path.

`ApplicationError` carries an `ErrorType` enum — `Validation | Conflict | NotFound | Unexpected` — which the API layer maps directly to HTTP status codes. The mapping is centralized in one place, not scattered across exception filters.

```csharp
return result.Error.Type switch
{
    ErrorType.Validation  => Results.UnprocessableEntity(problem),
    ErrorType.Conflict    => Results.Conflict(problem),
    ErrorType.NotFound    => Results.NotFound(problem),
    _                     => Results.Problem(problem)
};
```

## What It Costs

The pattern is deliberately simple — no `Bind`, no `Map`, no monadic chaining. This means handlers have some repetitive structure:

```csharp
var jobResult = await _repository.FindAsync(id, ct);
if (!jobResult.IsSuccess) return jobResult;

var validationResult = Validate(jobResult.Value);
if (!validationResult.IsSuccess) return validationResult;
```

More lines than a fluent chain. More readable to anyone who hasn't used functional-style result types before. I chose readability here.

The other cost: Result<T> is for expected failure modes — the error cases that are part of normal operation. It's not for everything. Database connection failures, unhandled exceptions, bugs — those still throw. The distinction matters: `Result` for business-logic failures, exceptions for infrastructure failures and programmer errors.

## Where Exceptions Still Live

The Infrastructure layer throws. `NpgsqlException` on connection failure, `TimeoutException` on query timeout — these propagate as exceptions and are caught by the Worker's retry orchestrator. The `IExceptionClassifier` service then classifies them as `Transient` or `Permanent`, which determines whether to retry or dead-letter.

This is the right split. Infrastructure failures are truly exceptional — unexpected, not part of the business logic contract. The application layer doesn't need to handle them; the worker orchestration does. Mixing them into `Result<T>` would pollute every handler with infrastructure-awareness.

## The Net Effect

Handlers read like a specification of what can go wrong:

```csharp
// Returns: the created job, or Conflict if duplicate, or Validation if bad input
Task<Result<ImportJobResponse>> Handle(CreateImportJobCommand command, CancellationToken ct);
```

The API layer does one thing: map error types to HTTP codes. No exception filters, no `catch (SpecificException)` in controllers, no surprises from exception hierarchy mismatches.

Whether this is worth it depends on team context. For a solo portfolio project, the explicitness is its own reward — it forced me to think through every failure mode before writing the implementation.
