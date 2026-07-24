---
title: "Measuring citations instead of trusting them"
date: 2026-05-16
teaser: "Every sentence gets traced back to a chunk, and the ones that cannot be traced are counted rather than hidden."
experiment: retrieval-that-cites
---

Structure-aware chunking made the retrieved passages readable. It did not answer
the question the experiment is actually about: how much of a generated answer is
carried by the sources, and how much is the model filling gaps.

So the answer is now scored sentence by sentence. Each sentence is matched
against the retrieved chunks, and a sentence that finds no support is not
removed or rewritten - it is counted.

## The scoring pass

The matcher runs on the retrieved set, not on the corpus, which keeps it cheap
enough to run on every answer rather than on a sample.

```csharp
public sealed record Support(
    string Sentence,
    string? ChunkId,
    double Score);

public Support Trace(string sentence, IReadOnlyList<Chunk> pool)
{
    var best = pool
        .Select(c => (c, score: _similarity.Between(sentence, c)))
        .MaxBy(x => x.score);

    return best.score >= SupportThreshold
        ? new Support(sentence, best.c.Id, best.score)
        : new Support(sentence, null, best.score);
}
```

## Where it stands

Over 120 questions against the internal corpus, with the two chunking strategies
run back to back on the same retrieval settings:

<div class="numbers">
sentences traced to a chunk &nbsp;&nbsp;&nbsp; 71% → 89%<br>
answers with an untraced claim &nbsp;&nbsp; 44% → 17%<br>
median chunks retrieved per answer &nbsp; 6 → 4<br>
added latency per answer &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 38 ms
</div>

Broken out by question type, the remaining untraced claims are not spread evenly:

| Question type | Answers | Untraced claim | Note |
|---|---|---|---|
| Single fact lookup | 44 | 5% | mostly numbers restated with different units |
| Procedure | 39 | 13% | model adds a step the document implies |
| Comparison | 24 | 29% | the comparison itself is never in one chunk |
| Open ended | 13 | 38% | arguably the honest answer is a refusal |

The comparison row is the one I keep looking at. Two chunks each support half of
a claim that neither of them makes, and a sentence-level matcher has no way to
express that. That is the next thing to try.
