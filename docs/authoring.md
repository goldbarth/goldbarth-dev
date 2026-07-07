# Authoring

## Overview

Three content collections:

| Collection  | URL          | Purpose                              |
|-------------|--------------|--------------------------------------|
| `thoughts`  | `/thoughts`  | Short, unfinished thoughts and notes |
| `decisions` | `/decisions` | Reasoning behind technical decisions |
| `projects`  | `/projects`  | Project detail pages (content posts) |

**Note:** Projects have two layers - see below.

---

## Adding Thoughts & Decisions

Create a file at:
- `src/content/thoughts/my-title.md`
- `src/content/decisions/my-title.md`

Filename = slug = URL. Use kebab-case. Example: `event-sourcing-trade-offs.md` → `/decisions/event-sourcing-trade-offs`

### Frontmatter

```yaml
---
title: "Entry Title"
description: "Short summary (optional but recommended)"
date: "2026-05-03"
updated: "2026-05-10"   # optional
readMin: 3              # optional, falls back to default
draft: false            # true = not shown publicly
---
```

| Field         | Type    | Required | Default | Notes                                      |
|---------------|---------|----------|---------|--------------------------------------------|
| `title`       | string  | yes      | -       |                                            |
| `description` | string  | no       | -       | Shown in list views                        |
| `date`        | date    | yes      | -       | Format: `"YYYY-MM-DD"` or `"YYYY-MM-DDTHH:MM:SS"` |
| `updated`     | date    | no       | -       |                                            |
| `readMin`     | integer | no       | 2–3     | thoughts: 2, decisions: 3                  |
| `draft`       | boolean | no       | `false` | `true` hides from listings                 |

**Same-day ordering:** Posts with only `"YYYY-MM-DD"` are treated as midnight - multiple posts on the same day appear in undefined order. Use a datetime to control order explicitly:

```yaml
date: "2026-05-04T10:00:00"   # appears earlier in the list
date: "2026-05-04T20:00:00"   # appears at the top (newest first)
```

Write markdown content below the frontmatter.

---

## Projects - Two Layers

Projects work differently from thoughts/decisions. There are **two independent places**:

### 1. Featured Projects (Homepage)

Shown on `/` in the Projects section. Manually maintained in `src/pages/index.astro`.

```typescript
const featuredProjects = [
  {
    title: 'my-project',
    status: 'live',      // 'live' | 'wip' | 'archived'
    description: 'What this project does.',
    stack: ['.NET 9', 'C#', 'Postgres'],
    links: [
      { label: 'github.com/goldbarth/my-project', href: 'https://github.com/goldbarth/my-project' },
    ],
  },
];
```

No markdown. No content file. Just add an entry to the array.

### 2. Content Collection Posts (Detail Pages)

Shown at `/projects` and `/projects/[slug]`. Works identically to thoughts/decisions.

Create file: `src/content/projects/my-project.md`

```yaml
---
title: "Project"
description: "Short description."
date: "2026-05-03"
draft: false
---
...
```

**Important:** Featured projects (homepage) and content posts are independent. An entry in the `featuredProjects` array does *not* automatically appear under `/projects`. Both must be maintained separately.

### Suggested Structure for Project Posts

Project posts cover the full arc of a project - not a single decision. Sections are suggestions, not required. Rename or skip what doesn't fit.

```markdown
## What it is

One paragraph. What does it do, who is it for?

## Problem / Motivation

Why build it? What gap or frustration triggered it?

## Architecture / Key Decisions

Stack choices, structural decisions, notable tradeoffs.
Link to `/decisions/[slug]` for deeper dives.

## Challenges

What was hard, what broke, what surprised you.

## Takeaways

What you'd do differently. What you'd keep.
```

**vs. Decision posts:** A decision post zooms into one specific tradeoff. A project post is the overview. One project can reference many decisions.

---

## Draft Workflow

Set `draft: true` to keep an entry out of public listings while still accessible in the local dev server.  
Set `draft: false` (or remove the field) to publish.

---

## Quick Reference

| What                        | Where                                        |
|-----------------------------|----------------------------------------------|
| Thought                     | `src/content/thoughts/*.md`                  |
| Decision                    | `src/content/decisions/*.md`                 |
| Project detail page         | `src/content/projects/*.md`                  |
| Featured project (homepage) | `src/pages/index.astro` → `featuredProjects` |
