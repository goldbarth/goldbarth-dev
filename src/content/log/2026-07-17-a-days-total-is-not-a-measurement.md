---
title: "A day's total is not a measurement"
date: 2026-07-17
teaser: The first real run against my own release worked, cost money, and left me with a single number I cannot do much with.
experiment: cheap-model-shippable-changelog
draft: true
---

Chartula writes release notes by having a model rephrase facts that are already established.
The text that comes out of that is the product.
Getting it good means generating it, changing the prompt, generating it again.
Every one of those runs costs money, and until today that was an abstract quantity to me.

Today was the first run against my own release.
v0.1.0, 33 changes, no previous tag, against the real repository instead of fixtures.

The run reported success, and the texts were cut off mid-word.
The run metrics showed `3 calls, 3,072 out`, which is exactly three times 1024.
My calls went out without `ChatOptions` and therefore without `MaxOutputTokens`, and in that case the provider quietly substitutes its own default of 1024.
A ceiling that is too low truncates the text instead of failing the run.

The interesting part came afterwards.
The thorough check, which verifies the output against the facts, flagged the severed sentence as an unsupported claim.
It was right about that much: half a sentence claims something the facts do not carry.
The cause sat somewhere else entirely, and I spent a while searching in the direction the message pointed.
56,712 tokens for a hint that pointed at the wrong problem.

By the evening the Console said $1.78.

That is the total for the day, across every run, the broken one included.
What a single run costs is not in there.
How it splits between rephrasing and checking is not in there either.
I read the number off. I did not measure it.

What I do know by now: a cheaper model is a config value for me, not a rebuild.
I checked that with an invented model name, and the API rejected that exact string, so the configuration does reach the provider.
The price list puts Haiku at $1 and $5 per million tokens against Opus 4.8 at $5 and $25.
That is a factor of five on paper, and my hunch is that practice looks different, because different models write different amounts.

What I do not know is quite a bit more.
Whether the cheap path can serve the check at all, given that this one has to return a structured format.
Whether a cheaper model writes a changelog I would send out.
And what a run actually costs, broken down rather than as a day's receipt.

The real gap here is the documentation.
I did not write the steps down while I was taking them: which run on which model, which tokens, which cost, which state of the code.
As long as that is missing I cannot hold two runs against each other, and every number stays an anecdote.

So before I compare anything, I want a record.
Per run: model, date, tokens, cost, written down while it happens instead of reconstructed afterwards.
The comparison I actually want only makes sense after that.
