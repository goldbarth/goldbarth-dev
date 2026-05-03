---
title: "State Machine with Explicit Transitions"
description: "How an explicit domain state machine with nine states and an enumerated transition table prevents silent state corruption in a long-running pipeline."
date: "2026-05-02"
readMin: 4
draft: false
---

An import job lives for a while. It's created, picked up by a worker, parsed, validated, processed chunk by chunk, and eventually lands in one of several terminal states. Along the way, things can go wrong in different ways — validation can fail, processing can fail, the worker can crash and leave the job stranded.

The naive approach is a `Status` enum and scattered `if` checks. It works until someone adds a new status, or a bug sets `Succeeded` from `Received` without going through processing, or a requeue path accidentally skips `Validating`. The state becomes implicit, spread across handlers.

## Nine States, Enumerated Transitions

Ingestor models job lifecycle with nine explicit states:

```
Received → Parsing → Validating → Processing → Succeeded
                                              → PartiallySucceeded
                   → ValidationFailed (terminal)
                                    → ProcessingFailed (terminal)
                                    → DeadLettered (terminal)
```

The domain layer encodes all allowed transitions in a `HashSet<(JobStatus From, JobStatus To)>`. Any attempt to move to an unlisted transition throws a `DomainException` immediately — no silent corruption, no implicit fallback.

```csharp
private static readonly HashSet<(JobStatus, JobStatus)> AllowedTransitions = new()
{
    (Received,    Parsing),
    (Parsing,     Validating),
    (Parsing,     ValidationFailed),
    (Validating,  Processing),
    (Validating,  ValidationFailed),
    (Processing,  Succeeded),
    (Processing,  PartiallySucceeded),
    (Processing,  ProcessingFailed),
    (Processing,  DeadLettered),
    (ProcessingFailed, Parsing),   // requeue path
    (DeadLettered,     Parsing),   // manual requeue
    // ...
};
```

The transition method validates, then sets the status and appends an `AuditEvent`:

```csharp
public void TransitionTo(JobStatus next, AuditEventTrigger trigger, string? context = null)
{
    if (!AllowedTransitions.Contains((Status, next)))
        throw new DomainException($"Invalid transition: {Status} → {next}");

    Status = next;
    AuditEvents.Add(AuditEvent.Create(Id, Status, next, trigger, context));
}
```

Every status change is recorded. The full history of a job is always reconstructible from `AuditEvents`.

## Why Terminal States Matter

Three terminal states, not one. `ValidationFailed`, `ProcessingFailed`, and `DeadLettered` are all permanent, but they mean different things operationally:

- `ValidationFailed` — bad input, retry won't help. Human intervention required.
- `ProcessingFailed` — infrastructure problem, eligible for automatic retry.
- `DeadLettered` — exhausted retries. Moved to `dead_letter_entries` with a JSON snapshot of job state at the time of death. Requires manual requeue.

Having distinct states makes the dead-letter management UI straightforward. The dashboard filters by state rather than by retry count or error message. A dead-lettered job is unambiguously dead; a processing-failed job is unambiguously retryable.

## The PartiallySucceeded Problem

The `PartiallySucceeded` state was added late and caused the most friction. Batch jobs process in 500-line chunks; a chunk failure mid-way doesn't roll back the chunks already committed. The job can't be `Succeeded` (some lines failed) and can't be `ProcessingFailed` (most lines succeeded).

This required new transitions:

```
Processing → PartiallySucceeded
```

And new questions: is a partially succeeded job retryable? If requeued, do we re-process only the failed chunks? (No — the current design re-processes everything and relies on `DeliveryItem` idempotency.) Can a partially succeeded job be dead-lettered? (Yes, if it fails enough times.)

The lesson: model your terminal and near-terminal states explicitly from the start. Adding them later forces you to revisit the transition table, the dead-letter schema, the requeue logic, and the UI filters simultaneously.

## What This Buys

The explicit state machine made two things dramatically easier:

**Recovery logic is obvious.** When I wrote the stale-lock recovery — reclaiming outbox entries from crashed workers — the state machine told me exactly which job states were eligible for reclaim. I didn't have to reason about it.

**Testing is mechanical.** Each transition is a single assertion. The happy path, the sad path, and the invalid transitions are all just table lookups. The domain tests read like a specification.

The cost is verbosity. Nine states and ~23 transitions is a lot to enumerate. For a simpler pipeline with three states, this would be overkill. For a system where correctness and auditability matter more than brevity, it's worth every line.
