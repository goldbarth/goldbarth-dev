# Authoring

Two objects, not three categories.

| Object | Directory | URL | What it is |
|---|---|---|---|
| Experiment | `src/content/experiments/` | `/experiments/<slug>` | the unit of work: a state, a dated log, a framing question |
| Entry | `src/content/log/` | `/log/<slug>` | the publication: a date, a body, its own URL |

Filename = slug = URL. Kebab-case.
`retrieval-that-cites.md` becomes `/experiments/retrieval-that-cites`.

The path deliberately does not contain the experiment.
Moving an entry to another experiment is a frontmatter change and costs no URL.

---

## Adding an experiment

```yaml
---
title: "Can grounding be a mechanism instead of a request?"
frame: "Two to three sentences: what this is about and what is still open."
status: running          # running · partial answer · concluded
log:
  - state: started
    date: 2026-06-10
tags: [dotnet, grounding, eval]
---
```

The body stays empty.
An experiment has no long text of its own; that lives in the entries.

**Only reached states go into `log`.**
The template renders the missing ones as `open` in a dimmed tone.
An unreached state is a state, not a gap, and writing `concluded: null` would say the opposite.

`tags` is the stack axis only: `dotnet`, `python`, `rag`, `pgvector`, `eval`, `grounding` and whatever comes next.
State is not a tag; it is already in `status`.

## Adding an entry

```yaml
---
title: "Moving the grounding check out of the prompt"
date: 2026-06-18
teaser: "One sentence, used in the line and on the experiment page."
experiment: grounding-as-mechanism   # omit for a free note
draft: false
---
```

`experiment` must match an experiment filename without `.md`.
Leaving it out is allowed and intended: an open question belongs to no attempt yet, and the entry then renders as `no experiment · note`.

There is no `readMin` and no `description`.
Reading time is a promise nobody can keep, so the meta line carries the date and the position in the thread and nothing else.

### Prose building blocks

The body is Markdown; raw HTML is allowed.
Three things have fixed styling:

- `##` and `###` for headings inside the text. No `#`, the title already is that.
- Fenced code blocks, highlighted by Shiki. They stay dark in light mode, which is a known and accepted detail.
- The number block for measurements, written as raw HTML:

```html
<div class="numbers">
recall@5, semantic only &nbsp;&nbsp; 0.71<br>
recall@5, fused &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 0.86
</div>
```

Numbers are where the tone gets concrete, so they look the same everywhere.

---

## Logging a state change

A state change is two edits in the experiment file and nothing else:

```yaml
status: partial answer
log:
  - state: started
    date: 2026-03-14
  - state: partial answer
    date: 2026-05-21
```

No line is ever overwritten, only appended.
The landing page sorts running experiments by the newest date in `log`, so a revived experiment rises on its own.

A state change produces no RSS item.
A change without a new entry is a quiet change and should notify nobody.

**Old entries are never rewritten.**
New insight means a new entry, not a revision.
That keeps the effort small and the chronology honest.

---

## The filter

The filter line above the list is client-side: it toggles `hidden` on the rows based on `data-tags` and `data-status`.
A filter state cannot be linked or bookmarked, and that is the accepted price.

An entry's state is the state of its experiment.
Free notes carry no `data-status` and therefore drop out of the state filter, while staying untouched by the tag filter.

**Turn this around** as soon as the filter line carries more than about five stack tags, or the list passes fifteen entries.
From there the filter is navigation rather than convenience, and navigation belongs in the URL: static routes under `/log/tag/<tag>`.
The rebuild is cheap because `tags` is already in the frontmatter and only one route has to be added.

---

## Checks before committing

- `npm run build` passes, meaning the frontmatter matches the schema in `src/content/config.ts`.
- A new `experiment:` value points at a file that exists. The schema does not catch a typo here, the empty experiment page does.
- The entry reads in both light and dark. Toggle `prefers-color-scheme` in the dev tools.
