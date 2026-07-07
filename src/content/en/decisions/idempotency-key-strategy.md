---
title: "Idempotency Key Strategy"
description: "Designing deterministic idempotency keys for an import pipeline - why SHA256 over file content, what the unique index enforces, and how HTTP clients benefit."
date: "2026-05-02"
readMin: 3
draft: false
---

Import pipelines and retries are inseparable. Networks fail. Clients timeout and retry. Ops teams resubmit files. Without idempotency, each retry creates a duplicate job. With it, retries are safe by default.

## The Key Format

Ingestor computes idempotency keys as:

```
"{supplierCode}:{SHA256(fileBytes)}"
```

Example: `"ACME:a3f8c2...d91b"`

Two components, each doing something specific:

**`SHA256(fileBytes)`** identifies the file content. Same bytes, same hash. If a client uploads the same file twice - different connection, different timestamp, different filename - the hash is identical. The database unique index rejects the second insert and returns the existing job.

**`supplierCode`** scopes the hash to a supplier. Two suppliers can legitimately upload identical content (a shared template file, for instance). Without the supplier scope, their jobs would collide. With it, `ACME:a3f8...` and `GLOBEX:a3f8...` are distinct.

## Why Not a Client-Provided Key

The alternative is letting the client provide the idempotency key as a request header. Some APIs do this - Stripe, for example. The advantage is explicit client control: the client decides what counts as "the same request."

For an import pipeline, I wanted the key to be derived from the content, not asserted by the client. A client-provided key can be wrong - same key, different file content. Content-derived keys are always correct: same content means same job, regardless of what the client says.

The tradeoff: clients can't force a re-import of the same file with a new key. If a file's content needs reprocessing (data correction, bug fix), the file itself must change. That's an intentional constraint.

## Enforcing at the Database Level

The idempotency check happens in two places:

1. **Application layer** - the `CreateImportJobHandler` checks for an existing job before inserting. If found, returns HTTP 200 with the existing job's ID and status.

2. **Database unique index** - a unique constraint on `idempotency_key` catches concurrent requests that race past the application check. The second insert fails with a unique constraint violation, which the handler catches and converts to the same HTTP 200 response.

```sql
CREATE UNIQUE INDEX uq_import_jobs_idempotency_key
ON import_jobs (idempotency_key);
```

The double-check matters. Without the database constraint, two concurrent requests for the same file could both pass the application check (before either has committed), creating duplicate jobs. With it, only one wins.

## What the Client Sees

A duplicate submission returns HTTP 200 with the original job's state - not 409 Conflict, not 422. The client gets a valid response with a job ID they can use to check status. From the client's perspective, the upload succeeded; it just happened to be a no-op.

This makes retry logic trivial on the client side: upload, get a job ID, poll for status. Retries on network failure are safe. Accidental double-submissions are safe. The pipeline absorbs them silently.

## Limits

SHA256 over raw file bytes is fast enough for delivery advice files (typically under a few MB). For very large files, you'd want to hash a streaming read rather than loading the entire payload into memory first. Ingestor loads the full payload for validation anyway, so this isn't a practical concern at current scale.

The design also assumes file content is the canonical identity. If the same physical content should be processable multiple times (batch reprocessing, corrections), a different keying strategy is needed - time-scoped keys, explicit version fields, or client-controlled keys with content validation.
