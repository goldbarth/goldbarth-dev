---
title: "Reciprocal rank fusion earned its second index"
date: 2026-03-05
teaser: "Running semantic and keyword search side by side and merging the ranks beat either one alone, by enough to keep both."
experiment: hybrid-search-rrf
---

Semantic search misses exact identifiers. Keyword search misses everything
phrased differently. Both failures were visible in the query log, and they were
visible on different queries, which is the only reason running both is worth
considering.

Reciprocal rank fusion merges the two rankings without needing a calibrated
score from either: each result is scored by its position in each list, and the
positions add up. No weight to tune, which is what made it worth trying first.

<div class="numbers">
recall@5, semantic only &nbsp;&nbsp; 0.71<br>
recall@5, keyword only &nbsp;&nbsp;&nbsp; 0.64<br>
recall@5, fused &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 0.86<br>
added latency, p95 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 24 ms<br>
index size &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; +1, and its own write path
</div>

The cost is real and it is not the latency. It is a second index that has to be
kept in sync with the first, and a corpus update that half fails now leaves two
indexes disagreeing.

Concluded on the question as asked: on this corpus, fusion is worth the second
index. That result does not transfer to a corpus without identifiers in it, and
I would run the same measurement again before assuming it does.
