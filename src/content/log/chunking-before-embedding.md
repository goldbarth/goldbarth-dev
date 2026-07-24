---
title: "Chunking is a retrieval decision, not a preprocessing step"
date: 2026-04-09
teaser: "Splitting documents by token count was fast to write and wrong in a way that only showed up in the answers."
experiment: retrieval-that-cites
---

The first version split every document into fixed windows of 512 tokens with a
small overlap. It was ten lines of code and it embedded the whole corpus in
under a minute, which felt like a good sign at the time.

It was not. The retrieved chunks were mostly correct in topic and mostly useless
as citations. A window that starts mid-sentence and ends mid-table cannot be
shown to anyone as the source of a claim, even when the model happened to use it
well.

## What broke

Two failure shapes kept coming back. A procedure split across two windows got
retrieved as its second half, so the answer described step four onward as though
it were the whole thing. And tables lost their header row to the previous
window, which turned a column of numbers into a column of numbers about nothing.

The second one is the interesting failure, because the answer still reads as
confident. Nothing in the pipeline noticed that the units were gone.

## What I changed

Splitting now follows the document structure first and the token budget second:
headings start a new chunk, tables stay whole even when they blow the budget,
and the overlap carries the nearest heading rather than the previous n tokens.

The next entry has what that did to the measurements.
