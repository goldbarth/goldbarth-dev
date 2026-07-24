---
title: "Two chunks, two answers, both retrieved"
date: 2026-07-02
teaser: "The corpus contradicts itself more often than expected, and ranking has no opinion about which version is current."
experiment: retrieval-that-cites
---

An internal corpus is not a book. It is a book plus every earlier edition of that
book, and nothing marks which paragraph was superseded in March.

Retrieval finds both. Both are on topic, both score well, and the model picks one
without saying that it picked. The citation trace looks perfect, because the
sentence really is supported by a chunk - just not by the chunk that is still
true.

## What I tried first

Preferring the more recent document by timestamp. It helps on the cases where
recency is the actual signal and hurts on the ones where an old, stable
reference page is correct and a recent meeting note is a passing remark.

Sorting by document age turned out to encode an assumption I cannot defend:
that the newest text is the most authoritative one. In this corpus it often is
the least.

## Where this sits

Currently unresolved, which is why the experiment is still running. The
direction I want to test next is detecting the disagreement rather than
resolving it: if two retrieved chunks make incompatible claims about the same
subject, that fact belongs in the answer instead of being silently collapsed.

It is a worse answer and a more honest one.
