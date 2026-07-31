---
title: "The comparison was wrong and the numbers were exact"
date: 2026-07-31
teaser: Six runs, every cost confirmed against the invoice, and the first four of them compared nothing.
experiment: cheap-model-shippable-changelog
draft: false
---

Two weeks ago a day of runs cost me $1.78 and I could not say what for.
This time I wrote every run down while it happened: model, date, tokens, cost.
Six runs against the same release, the same 33 changes, the same command.

Every cost came out of the run report first and went against the Console afterwards.
All six agree to the cent.
That is the part I am most relieved about, because it means the number the tool prints stands on its own.

Four models, as they come out of the box:

| Model | Cost |
| --- | --- |
| Haiku 4.5 | $0.12 |
| Sonnet 5 | $0.55 |
| Opus 4.8 | $0.89 |
| Opus 5 | $1.34 |

Opus 5 and Opus 4.8 have the same price per token.
The same release still costs fifty percent more on Opus 5.

I went looking for that gap in the wrong place for a while, because I assumed the newer model simply writes more.
It does write more, but that is the smaller half.

The clean signal sits in the thorough check, the second pass that verifies the generated text against the facts.
Its answer is a short JSON verdict, so its length says something.
On Opus 4.8 it spent 69 output tokens to report that it found nothing.
On Opus 5 it spent 4,967 tokens for the identical verdict.
On Sonnet 5, 6,982.

That is not text coming back.
That is reasoning, and reasoning is billed as output.

Chartula never sends a `thinking` field.
The models read that silence differently: Opus 4.8 and Haiku 4.5 do not think, Opus 5 and Sonnet 5 think adaptively.
So half of my comparison ran with a setting I had not chosen, and the other half ran without it.

The four numbers are exact and they compare nothing.
I had measured two different configurations and lined them up as if they were four models.

The fix was a config switch: `llm.thinking`, with the three states the provider has.
The default keeps the current behaviour, because there was nothing yet to justify changing it.

My first version of that switch was broken.
The Anthropic client lets you hand it a fragment of the raw request, which is where a thinking field has to go.
That fragment has a few required fields, so I filled them with placeholders and assumed the library would overwrite them with the real values.
The unit tests were green.
Then I ran it once against the API with an invalid model id, and the answer came back three times: `model: placeholder`.

The placeholder was the request.
When a raw fragment is present, the library merges the messages into it and takes the rest as given, which is a reasonable contract and the opposite of what I had assumed.

That probe cost nothing, because a rejected request is not billed.
It is the cheapest test I know for this kind of thing and I had not thought of it before this week.

With the switch working, two more runs, thinking turned off:

| Model | as it comes | thinking off |
| --- | --- | --- |
| Sonnet 5 | $0.55 | $0.44 |
| Opus 5 | $1.34 | $1.03 |

Measured the same way, Sonnet 5 undercuts Opus 4.8 by half, $0.44 against $0.89.
In the first table it looked like it sat somewhere between Haiku and Opus 4.8.
That is the comparison I had been trying to make for two weeks, and it only appeared once the setting was the same everywhere.

Thinking costs twenty to twenty-five percent on the same model.

The part I did not expect: with thinking switched off, both models reported more findings, not fewer.
Opus 5 flagged nothing with it and four claims without it.
Sonnet 5 flagged nothing with it and two claims without it.
Same text, same facts.
One release, measured once, so that is a direction and not a result.

What stays open is the half that matters more.
I have read the numbers and only spot-checked the changelogs.
Whether the cheap end writes something I would actually send out is untouched, and no invoice is going to answer it.
