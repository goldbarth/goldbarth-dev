---
title: "Outbox vs. Message Broker"
description: "Why Ingestor starts with a database-backed outbox instead of RabbitMQ — and what the switchable dispatcher pattern makes possible later."
date: "2026-05-02"
readMin: 4
draft: false
---

The question that shapes the entire dispatch layer: when a job is created, how does the worker find out?

The obvious answer is a message broker. Publish a message, worker subscribes, done. But that answer comes with a hidden assumption: the database write and the broker publish happen in two separate operations. If the database commits and the broker publish fails — or worse, the process crashes between the two — you've lost the signal. The job exists in the database in `Received` status, but nothing will ever pick it up.

## The Problem with "Publish Then Commit"

There's a pattern that sounds reasonable: publish to the broker optimistically, and if the broker fails, roll back the database transaction. The problem is that rollback is not guaranteed either. If the broker publish succeeds but the database commit fails, the worker receives a message for a job that doesn't exist. You've now published phantom work.

The dual-write problem has no clean solution without either accepting eventual inconsistency or adding a coordination mechanism. For a pipeline where every job must be processed exactly once, neither is acceptable.

## Why the Outbox

The outbox pattern sidesteps dual-write by making the dispatch signal part of the database transaction itself. When a job is created, an `OutboxEntry` is inserted in the same transaction. If the transaction commits, both the job and its dispatch signal exist atomically. If it rolls back, neither does.

```
BEGIN;
  INSERT INTO import_jobs (...);
  INSERT INTO outbox_entries (job_id, status = 'Pending', ...);
COMMIT;
```

The worker then polls `outbox_entries` with `FOR UPDATE SKIP LOCKED`:

```sql
SELECT * FROM outbox_entries
WHERE status = 'Pending' AND scheduled_for <= NOW()
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

`SKIP LOCKED` is the key detail. If another worker has already claimed an entry, this query skips it rather than blocking. Multiple worker instances can poll simultaneously without thundering herd, and without a distributed lock.

## The Tradeoffs

The outbox costs something. Polling adds database load — every worker instance runs a query on a schedule, even when there's nothing to process. For Ingestor's workload (delivery advice imports, not sub-millisecond event streams), this is fine. For a system processing thousands of events per second, it would not be.

The latency profile is also different. A broker delivers near-immediately. An outbox poll interval introduces a delay — Ingestor polls every two seconds. For an import pipeline, a two-second pickup delay is invisible. For a user-facing notification system, it would be noticeable.

## Making It Switchable

Rather than hard-coding the outbox strategy, Ingestor introduces an `IJobDispatcher` abstraction:

```csharp
public interface IJobDispatcher
{
    Task DispatchAsync(JobId jobId, CancellationToken ct);
}
```

Two implementations: `OutboxJobDispatcher` (writes to the outbox table) and `RabbitMqJobDispatcher` (publishes to an exchange). The active strategy is selected via configuration:

```json
"Dispatch": { "Strategy": "Database" }
```

Swapping to `RabbitMQ` requires no code changes, just a config value and the broker running.

The RabbitMQ dispatcher adds one extra wrinkle: publishing *before* the database commit creates the same race condition we were trying to avoid. The solution is a post-commit callback — the dispatcher registers a publish action that fires after `SaveChangesAsync()` completes, not before. The message cannot be consumed before the job is visible in the database.

## What I'd Change

The outbox works well as a starting point. If I were building for higher throughput, I'd likely add a dedicated outbox relay process — something that tails the database and forwards entries to a broker, rather than having workers poll directly. But for a portfolio project demonstrating the pattern, direct polling is simpler and more transparent.

The `IJobDispatcher` abstraction was worth the effort. Being able to explain "the system works without a broker, add one when you need scale" is a better story than "requires RabbitMQ to run at all."
