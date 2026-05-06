---
title: "Ingestor"
description: "A .NET 10 import pipeline built around reliability: outbox pattern, strict domain state machine, idempotent processing, and a config-switchable dispatch strategy — every design decision focused on correctness and auditability."
date: "2026-05-02"
readMin: 6
draft: false
---

## What it is

Ingestor is a production-grade import pipeline for the fictional Fleetholm Logistics domain. It ingests delivery advice files — CSV or JSON — validates them, processes them in configurable chunks, and tracks every operation with a full audit trail. Three independently deployable services: an API for uploads and status queries, a background worker for processing, and a Blazor Server dashboard for operations. Built on .NET 10 with PostgreSQL, optionally extended with RabbitMQ.

## Problem / Motivation

I wanted a project that forced me to think through distributed systems problems at a realistic scale — not toy examples, but something with actual failure modes: concurrent workers racing for jobs, files too large to process atomically, infrastructure errors that deserve a retry versus those that should fail immediately, and the question of how to publish to a message broker without creating a race condition with your own database.

Every production system I've read about eventually adds an outbox, a state machine, and some form of idempotency. I wanted to build those things from scratch and understand *why* each pattern exists — not just how to copy it.

## Architecture / Key Decisions

The core is a database-backed outbox. Jobs and their dispatch signals are committed in the same transaction — no distributed transactions, no "did the message actually get sent?" ambiguity. Workers poll with `FOR UPDATE SKIP LOCKED` to claim jobs without thundering herd. The tradeoff: more database load than a dedicated broker, but a far simpler operational story.

State is managed by an explicit domain state machine with nine named states. Every allowed transition is enumerated in a `HashSet`; anything not in that set throws a `DomainException` immediately. No silent state corruption, no implicit fallback paths.

Idempotency keys are computed as `SHA256(fileBytes + supplierCode)` — deterministic, safe for client retries, enforced by a unique index. Duplicate submissions return HTTP 200 with the existing job — no questions asked.

Error handling uses a `Result<T>` type instead of exceptions across the application boundary. Every outcome is explicit. Infrastructure exceptions are classified as `Transient` or `Permanent`: transient errors retry with exponential backoff, permanent ones dead-letter immediately.

Batch processing splits large files into 500-line chunks, each committed atomically. If chunk 16 of 20 fails, chunks 1–15 stay committed and the job transitions to `PartiallySucceeded` rather than rolling everything back. Operationally more useful than all-or-nothing for large imports.

RabbitMQ dispatch — when configured — publishes only *after* the database commit via a post-commit callback registry. This eliminates the classic race where a consumer processes a message before the producing transaction is visible to the database.

→ [Outbox vs. Message Broker](/decisions/outbox-vs-message-broker)
→ [State Machine with Explicit Transitions](/decisions/state-machine-explicit-transitions)
→ [Idempotency Key Strategy](/decisions/idempotency-key-strategy)
→ [Result Pattern over Exceptions](/decisions/result-pattern-over-exceptions)
→ [Chunk-based Batch Processing](/decisions/chunk-based-batch-processing)

## Challenges

The hardest problem was one the test suite couldn't find.

The `RabbitMqJobDispatcher` originally called `BasicPublishAsync` inside `DispatchAsync` — eagerly, before the database transaction committed. The handler called them in this order:

```csharp
await jobRepository.AddAsync(job, payload, ct);
await jobDispatcher.DispatchAsync(job, ct);   // publishes immediately
await unitOfWork.SaveChangesAsync(ct);         // job written after message already sent
```

In unit tests: green. In integration tests: green. The race window — between the message arriving in the queue and the database commit completing — is microseconds wide under normal conditions. Every test passed.

The benchmarks exposed it. Under load, with the RabbitMQ worker running in the same process, the worker consumed the message before `SaveChangesAsync` finished. `GetByIdAsync` returned `null`. The message was nacked, routed to the dead-letter exchange, and the job was permanently stuck in `Received`. Reproducible, but only at benchmark throughput.

The root cause wasn't a call-site ordering bug — it was a design-level defect. The `IJobDispatcher` abstraction said nothing about *when* dispatch takes effect relative to the database commit. `DatabaseJobDispatcher` was lazy (writes into the EF change tracker, commits with the job). `RabbitMqJobDispatcher` was eager (fires immediately). Two implementations, same interface, opposite timing semantics. Reordering the handler calls would have fixed the symptom but broken `DatabaseJobDispatcher`, whose `OutboxEntry` write must be committed atomically with the job.

The fix was an `IAfterSaveCallbackRegistry` — an internal infrastructure interface that `EfUnitOfWork` implements alongside `IUnitOfWork`. `RabbitMqJobDispatcher` registers the publish as a callback; it fires after `SaveChangesAsync` completes, never before. The handler needed no changes.

The lesson wasn't about RabbitMQ. It was about what tests can and can't find. All the unit and integration tests were written for correctness under normal conditions. None of them exercised the timing relationship between dispatch and commit at real concurrency. The benchmarks weren't written to find bugs — but they did.

The partial batch failure case was the other significant friction point. The outbox and idempotency systems were designed independently; making requeue idempotent *across partially succeeded jobs* required revisiting both. The `PartiallySucceeded` state ended up needing its own transition rules in the state machine — and its own dead-letter snapshot format.

## Takeaways

The patterns here — outbox, state machine, result type, idempotency — are individually well-known. The value of the project was understanding how they interact. The state machine made the outbox recovery logic obvious. The result type kept error classification clean. The idempotency key made the chunk retry problem tractable.

If I built it again, I'd design the `PartiallySucceeded` state earlier. Treating it as an afterthought created ripple effects through the state machine, the retry logic, and the dead-letter schema. And I'd write the benchmark suite before the production code; the `BenchmarkDotNet` benchmarks I added late revealed chunk-size sensitivity I wouldn't have caught otherwise.
