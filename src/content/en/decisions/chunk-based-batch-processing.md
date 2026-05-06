---
title: "Chunk-based Batch Processing"
description: "Why Ingestor processes large import files in 500-line chunks instead of all-at-once — bounded blast radius, partial success semantics, and the tradeoffs that came with it."
date: "2026-05-02"
readMin: 4
draft: false
---

A delivery advice file can be large. Ten thousand lines is not unrealistic. Processing ten thousand lines in a single database transaction has a specific failure profile: if line 9,847 fails, you lose everything. The transaction rolls back, zero items are imported, and the job has to start over.

That's a bad tradeoff for an import pipeline. Chunk-based processing trades atomicity for bounded blast radius.

## How It Works

The `LineChunker` splits the parsed file into fixed-size chunks before processing begins:

```
10,000 lines ÷ 500 per chunk = 20 chunks
```

Each chunk is processed independently:

```csharp
foreach (var chunk in chunks)
{
    try
    {
        var items = MapToDeliveryItems(chunk);
        await _context.DeliveryItems.AddRangeAsync(items, ct);
        await _context.SaveChangesAsync(ct);
        job.IncrementProcessed(items.Count);
    }
    catch (Exception ex)
    {
        job.IncrementFailed(chunk.Count);
        _logger.LogError(ex, "Chunk {N} failed", chunkIndex);
        // continue — do not rethrow
    }
}
```

The key line is `// continue`. A failed chunk is logged and counted, but doesn't abort the pipeline. Chunks 1–15 stay committed even if chunk 16 fails.

The job tracks three counters independently: `TotalLines`, `ProcessedLines`, `FailedLines`. When the pipeline finishes, the final state is determined by whether any lines failed:

```csharp
job.TransitionTo(job.FailedLines > 0 ? JobStatus.PartiallySucceeded : JobStatus.Succeeded);
```

## Why 500

The chunk size is configurable, but 500 is the default. The benchmarks I ran late in development showed that chunk sizes between 200 and 1,000 have similar throughput for typical delivery advice content — the dominant cost is the round-trip to PostgreSQL per chunk, not the chunk assembly. Below 100, the overhead of many small transactions adds up. Above 2,000, memory pressure from loading a large batch into the EF change tracker becomes noticeable.

500 is a round number in the middle of a flat performance curve. If profiling revealed a real bottleneck here, I'd tune it. In practice, a 10,000-line file takes about two seconds either way on a local Postgres instance.

## PartiallySucceeded — The Complication

`PartiallySucceeded` was added to model the case where some lines succeed and some fail. It seemed straightforward until I considered requeue.

If a job is `PartiallySucceeded` and the user requeues it, what happens? The current design reprocesses the entire file from scratch. The 9,500 lines that already succeeded will attempt to insert again. This requires `DeliveryItem` creation to be idempotent — inserting a `DeliveryItem` that already exists must not fail.

The solution is an upsert on reprocess, keyed on `(job_id, article_number, supplier_ref)`. This keeps requeue simple at the cost of slightly more complex insert logic.

The alternative — tracking which chunks succeeded and only reprocessing failed ones — is more efficient but significantly more complex. Chunk-level state tracking, resumable processing, modified idempotency logic. For the current scale, the simpler approach is the right call.

## The Tradeoff in Plain Terms

Chunk processing gives you:
- **Bounded blast radius** — a failure affects at most one chunk's worth of lines
- **Incremental progress** — large files make observable progress rather than appearing stuck
- **Partial success semantics** — some lines committed is better than none for most import scenarios

It costs you:
- **Non-atomic import** — a job in `PartiallySucceeded` state has some lines in the database and some not
- **Requeue complexity** — reprocessing must be idempotent at the line level, not just the job level
- **Late-stage design changes** — `PartiallySucceeded` forced changes to the state machine, requeue handler, and dead-letter schema simultaneously

Whether the tradeoff is right depends on whether partial success is meaningful in your domain. For delivery advice — where an operator cares about knowing which items arrived — 9,500 of 10,000 successfully imported is genuinely better than 0 of 10,000. For a payment batch, you'd want different semantics entirely.
