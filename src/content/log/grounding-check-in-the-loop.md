---
title: "Moving the grounding check out of the prompt"
date: 2026-06-18
teaser: "A sentence in the system prompt asks the model to stay grounded. A step in the loop does not ask."
experiment: grounding-as-mechanism
---

The system prompt had three sentences about only using retrieved context. They
were polite, specific, and ignored often enough to matter.

That is not a prompting failure to be fixed with better wording. A prompt is an
instruction to a system that is allowed to weigh instructions against other
pressures, and one of those pressures is producing a fluent, complete-looking
answer.

## The change

The check now runs after generation and before the answer leaves the loop. If
the grounding score falls below the threshold, the loop does not return the
answer - it retries with the failed sentences marked, and after a second failure
it returns what it can support plus an explicit gap.

The difference is not the score. It is that a failing score now has a
consequence that the model does not get a vote on.

## What is still open

The check compares meaning, not wording, which is the only version worth having:
a correct answer phrased differently must pass, and a fluent paraphrase of
something the sources never said must fail. Those two requirements pull in
opposite directions and the threshold sits between them.

Where exactly it sits is what I am measuring next.
