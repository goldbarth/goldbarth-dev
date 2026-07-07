---
title: "Semantic Ticket Search - RAG as a Tool of the Model"
description: "The intake assistant creates tickets without knowing the ones that already exist - the same printer outage five times, five tickets. The fix is retrieval. The interesting questions are where the vectors live and who decides when to search."
date: 2026-07-03T21:30:00
readMin: 5
draft: false
---

The intake assistant in ServiceDeskLite had a gap you only notice in use: it doesn't know the tickets that already exist. When a second colleague reports the same printer outage, a second ticket appears - the model has no way of knowing better. The fix is obvious: search before creating. Except keyword search won't do. "Drucker reagiert nicht" and "printout fails" share not a single word and describe the same problem. The search has to work by meaning - embeddings, vector comparison, retrieval-augmented generation.

The acronym suggests more machinery than the decision actually contains. Four questions matter: Where do the embeddings come from? Where do the vectors live? When does embedding happen? And - the least obvious one - who decides when to search at all?

## A second provider, reluctantly

The first answer is a disappointment with an announcement: Anthropic has no embeddings API. If you build with Claude and need vectors, you need a second vendor - Anthropic itself points to Voyage AI. That's a second API key, a second failure mode, a second quota. The client for it is deliberately small: a typed HttpClient, a request record, a response record - no SDK wrapper around an endpoint the project calls in exactly two places.

Because the second key should stay optional, it follows a different rule than the Anthropic key. The assistant is a core feature; its key is enforced at startup. Semantic search is an enhancement - its key has a placeholder default, and without a real key the feature disables itself cleanly instead of blocking the boot.

## Vectors live in the existing Postgres

The second question has an answer that consists mostly of a no: no vector database. Qdrant, Weaviate, Pinecone - for a few hundred tickets, each of them is operational overhead without payoff. pgvector turns the PostgreSQL that's already running into a sufficient vector store: one extension, one column type, cosine distance as an operator.

The vectors don't live on the ticket, though. An embedding is derived infrastructure state - it belongs in the aggregate about as much as a database index does. So: a separate table, foreign key with cascade delete, mapped exclusively in the infrastructure layer. The domain still compiles without knowing that vectors exist - the same line that already kept the LLM outside.

The table also does without a vector index (HNSW, IVFFlat). At this data size an exact sequential scan is faster than any index discussion - and it returns exact rather than approximate results. The index would be tuning surface for a problem that doesn't exist.

## The write path stays offline

When does embedding happen? The tempting answer - on create, synchronously - has a price that only shows later: the ticket write path would gain a network dependency. Creating a ticket works today without a single external call; the LLM sits at the edge, not inside the command handler. An embedding call in the middle of a write would give that up - and raise the question of what happens to the ticket when Voyage happens not to answer.

Instead: a poll-based background worker. It looks for tickets whose embedding is missing or stale - staleness detected by a content hash over title and description - embeds them in batches, and writes the vectors back. The one mechanism covers everything: new tickets, edited tickets, seed data, backfill after a model change. No event handler, no hook in the create path, no special case for the initial import.

The price is eventual consistency: a freshly created ticket is unfindable for a few seconds. For a duplicate check that's the right trade-off - the duplicate worth catching has typically existed for hours, not milliseconds.

## RAG as a tool, not a pipeline

The fourth question is the architecturally interesting one. The classic RAG pattern hard-wires retrieval in front of the model call: search first, put the hits into the prompt, then generate. Here it runs the other way around - the search is a tool named `find_similar_tickets`, a peer of `create_ticket` and `update_ticket`, and the model decides for itself when to search.

That fits the task: not every message needs retrieval. A follow-up question about a time, a priority correction - hard-wired search would incur embedding cost on every turn, producing results the model would have to ignore. The system prompt states the rule: check for duplicates before creating, and on a clear match ask the user instead of silently producing a second ticket. The hits come back as a tool result - ticket id, title, status, similarity - and the model visibly grounds what it does in them.

One detail emerged on its own during the first live test: the search works across languages. A German problem description finds English tickets - the meanings sit close together in vector space even when not a single word matches. Exactly the case where keyword search would have failed.

And when search isn't available - InMemory provider, missing key? Then the tool tells the model so, honestly: "not available in this deployment," rather than returning an empty result list. The difference isn't cosmetic. An empty list means "there are no duplicates" - a claim the model would pass on to the user even though nobody actually looked.

## What's deliberately missing

No chunking - tickets are short; one vector per ticket is enough. No hybrid search combining full-text and vectors, no re-ranking - both are tools for recall problems that aren't measurable on this corpus. No embedding of comments. Each of these extensions could be added behind the same search interface without the tool or the model noticing.

## When to reconsider

Three triggers are recorded in the ADR. Beyond roughly a hundred thousand tickets the sequential scan tips over - then an HNSW index, and the worker needs keyset paging instead of "load everything." When users start searching for exact terms - error codes, hostnames - hybrid search becomes interesting, because embeddings are weakest exactly where strings must match exactly. And should Anthropic ever ship an embeddings API, the second provider disappears behind the interface it stood behind from the start.

Until then, the project's line applies here too: as much machinery as necessary, with documentation for why it isn't more. RAG doesn't make the assistant smarter - but it gives it something it lacked: a memory for what has already been reported.
