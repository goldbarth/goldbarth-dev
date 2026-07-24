---
title: "The eval you skip is worth nothing"
date: 2026-05-21
teaser: "Cutting the suite from nine minutes to forty seconds changed how often it runs, which changed what it catches."
experiment: python-eval-harness
---

The first harness ran 400 cases against the live model and took nine minutes. It
was thorough and I ran it before releases, which means I ran it after the
mistakes were already built on top of each other.

The rewrite optimised for one number that is not accuracy: how long I have to
wait before I see a result.

## What made it fast

Three things, in order of how much they mattered. Responses for unchanged cases
are cached by prompt hash, so a run after a small change only calls the model
for what actually moved. The remaining calls go out concurrently instead of in a
loop. And the case set is tiered, so the fast tier is the 60 cases that have
ever caught something.

<div class="numbers">
full suite &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 9 min 12 s → 1 min 04 s<br>
fast tier &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 41 s<br>
runs per week &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 2 → 30ish<br>
regressions caught before merge &nbsp; 0 → 4
</div>

The last row is the whole point. Nothing about the harness got smarter; it just
started running at the moment where the answer still changes a decision.

## The part that is only half answered

I still cannot say what a meaningful regression threshold is. A two point drop
on 60 cases is well within the noise of a nondeterministic model, so the harness
currently reports movement and lets me judge it.

Turning that judgement into a number that blocks a merge is the rest of this
experiment.
