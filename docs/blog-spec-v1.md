# Blog specification - goldbarth.dev

Counterpart to `kachel-spezifikation-v4.md`.
That one covers the GitHub profile, this one covers the blog.

Both share the amber and teal ramps, IBM Plex Mono as the signature, and the role split of amber equals identity and teal equals system.

They differ in three points: serif as the reading face (impossible on a tile), the notion of state (tiles know active and in progress, the blog knows three states), and the light-mode mechanic (tiles grade by border weight, the blog by surface plus colour).

This document describes the site as built.
Where it names a file, that file exists; where it names a token, that token is in `src/styles/global.css`.

---

## 1. Stance

Everything below follows from two texts.
They are decided and they stand.

**Blog tile on the GitHub profile**

```
FIELD NOTES
Everything is an experiment
LLM systems in .NET and Python. Experiments, partial answers, open questions.
www.goldbarth.dev →
```

**Header of the landing page**

```
~/goldbarth $ whoami

Felix Wahl, backend engineer in Hamburg, working toward AI engineering in .NET and Python.
Posts go up while the experiment is still running. They carry a status, and they change when the result does.
```

The second sentence of the header is not decoration.
It explains the status dot and the dated log before the reader meets either for the first time.

What follows from that, and what does not:

- No verdict labels.
  `DECISION` is dropped without replacement, because it claims the opposite of "still open".
- No `failed`.
  If everything is an experiment, a result is not a failure.
  What did not work goes in the text, not on the label.
- No split headings with a negation.
  The figure `X, not Y` belongs to Chartula (`Grounded, not guessed`) and stays there.

---

## 2. Data model

Two objects, cleanly separated.
This is the most important decision in the whole specification.

**Experiment** is the unit.
It has a state, a dated log and a framing question, but no long body text.

| Field | Type | Note |
|---|---|---|
| `slug` | string | filename, equals the URL segment |
| `title` | string | a statement or a question, not a product name |
| `frame` | 2 to 3 sentences | what this is about and what is still open |
| `status` | enum | `running` · `partial answer` · `concluded` |
| `log` | list of state and date | see section 3 |
| `tags` | list | stack axis only, see section 9, defaults to empty |

**Entry** is the publication.
It has a date, a URL of its own and **no state of its own**.

| Field | Type | Note |
|---|---|---|
| `slug` | string | filename, equals the URL segment |
| `title` | string | |
| `date` | date | written once, never overwritten |
| `teaser` | 1 sentence | used in the line and on the experiment page |
| `experiment` | slug or omitted | omitted means: free note |
| `draft` | boolean | defaults to false, drafts are excluded from every page and from RSS |
| `body` | text | Markdown or MDX |

The schema lives in `src/content/config.ts`.
`experiment` is a plain slug string rather than a `reference()`, because every lookup resolves by slug anyway.

Two rules hang off this:

1. **Old entries are never rewritten.**
   New insight means a new entry, not a revision.
   That keeps the effort small and the chronology honest.
2. **An entry may exist without an experiment.**
   An open question belongs, by definition, to no attempt yet.
   Without that option the very texts the tile promises would go unwritten.

**URLs, flat**

```
/experiments/<experiment-slug>
/log/<entry-slug>            every entry, with or without an experiment
/rss.xml
```

The path deliberately does **not** contain the experiment.
A nested path would fix the membership: a free note later assigned to an experiment would get a new URL, and every existing link plus the RSS GUID would point nowhere.
Flat keeps `experiment` a frontmatter field, and reassigning costs nothing.

Implementation in Astro: two content collections, `experiments` and `log`.
The former collections `projects`, `decisions` and `thoughts` are gone.

**RSS** carries entries, not state changes.
A state change without a new entry is a quiet change and should notify nobody.

Shared logic sits in `src/lib/experiments.ts`: `lastChange`, `entriesOf`, `startedAt`, `statusClass`, `fullLog`, `iso`.
Templates read those and do no date arithmetic of their own.

---

## 3. States

Three, no more.
They hang on the experiment, never on the entry.

| State | Meaning |
|---|---|
| `running` | currently being worked on |
| `partial answer` | one part is answered, the rest is open |
| `concluded` | finished, regardless of the result |

`running` and not `active`: `active` is already taken on the Chartula tile for "is being maintained".
Projects are active, experiments run.
`partial answer` is the literal wording on the tile and brackets both channels without explanation.

**The state changes over time.**
Every change is logged with a date, no state is overwritten:

```yaml
log:
  - state: started
    date: 2026-04-02
  - state: partial answer
    date: 2026-06-30
```

The template renders the log as three fixed positions: `started`, `partial answer`, `concluded`.
Positions not reached yet are shown dimmed and read `open` instead of carrying an empty field.
This is where the page performs its own stance: open is a state, not a gap.

The rendering is a bordered box (`StatusLog.astro`), not an inline run of text.
Each position is a dot with its label and the date underneath.
The position the experiment currently stands on is the last one with a date and is the brightest of the three.

Landing-page sorting is by **last state change**, not by creation.
Otherwise revived experiments would not rise back to the top.

---

## 4. Page structure

### 4a. Landing page, three layers

1. **Stance.**
   Prompt line plus the two sentences from section 1.
2. **Running experiments.**
   Only `running`, as framed blocks under a `RUNNING` kicker.
   That is the answer to "what is he working on", and it maintains itself.
3. **The line.**
   All entries chronologically, newest first, frameless, hairlines between them.
   The filter row sits above it.

The two lower layers must differ **in format**, not only in colour: experiments are objects with a border and padding, entries are a list.
Without that difference the second layer reads as a continuation of the first.

Every row of the line names its experiment in mono under the title, followed by that experiment's state.
Free notes read `no experiment · note`.
Only through this does the separation from section 2 become visible to the reader without being explained.

The line carries **no heading of its own**.
The filter row above it already says what it is, and a second label would only repeat the list below.

The card counts instead of narrating: `started <date> · N entries · last <date>`.
The counts come from the thread itself, so they stay true without anyone maintaining them.
The full log lives one click deeper.

There is **no** separate Now or About area.
Both would age; layers 1 and 2 do not.

**Open: experiments have no index.**
Layer 2 is deliberately a now view and therefore shows `running` only.
That leaves `partial answer` and `concluded` without a place where an experiment appears as an object.
They stay reachable, because every row of the line links its experiment, but there is nowhere to browse experiments as a list.
Layer 3 archives entries; nothing archives experiments.
Decide when the second experiment concludes, not before: either the experiment is the unit a reader navigates by and needs an index of its own, or the entries carry the archive and the line is enough.

### 4b. Experiment page

Order: wordmark, title with identity dot and status, framing text, tags, dated log, then the entries, then the way back.

**Entries ascending, oldest at the top.**
The landing page is newest first, because it shows what is new.
The experiment page is a story, and a story is read from the front.
The newest entry is the only one carrying a teal separator plus the addition `latest`, so the eye still finds the current state immediately.

Entries appear here with date, title and teaser, not in full text.
Full text lives on the entry page, because every entry needs a URL of its own.

The page ends on `← back to the log`, the same step back one level up that the entry page ends on.

### 4c. Entry page

Order: wordmark, membership in the experiment as a mono kicker with a status dot, title, meta, body, navigation.

The meta line carries the date and the position in the thread (`entry 2 of 4`) and nothing else.
A free note has no thread, so it carries the date alone and gets no navigation block.

**The navigation at the foot leads to the previous and next entry inside the same experiment**, not through the whole blog.
Whoever reads inside a thread stays inside the thread.
Below it a line back to the experiment: `← back to the experiment · 4 entries · running`.

On the newest entry of a running experiment the right-hand field stays, dashed, reading `not written yet`.
Dropping the field would tip the symmetry and end the page on half a box.

**Number block.**
Fixed building block for measurements: mono, left aligned, a 2px teal line on the left, no border, no table.
Written as raw HTML with `class="numbers"`.
Numbers are where the tone gets concrete, so they look the same everywhere.

### 4d. Prompt line and the way back

The full prompt line

```
~/goldbarth $ whoami
```

stands once, at the top of the landing page, and nowhere else.
Repeating it as a breadcrumb on every subpage was tested and rejected: the figure turns into decoration, and it would be the only place where a path contains the experiment although the URL deliberately does not.

Every page below the landing page carries the **wordmark** instead (`Wordmark.astro`):

```
~/goldbarth
```

It is the same amber mono, it takes no props, and it links to `/`.
It never changes with the page, which is what separates an anchor from a path.

Two further elements carry the way back:

- On the entry page the mono kicker with the experiment name is the link back to the experiment.
- At the foot stands `← back to the experiment · 4 entries · running`, and on the experiment page `← back to the log`.

That keeps the page head quiet, and the way back sits where the reader needs it, at the end of the text.

### 4e. Footer

One footer on every page (`SiteFooter.astro`), mono, meta colour, above it a hairline.
Left: `github · linkedin · email`.
Right: `rss · © <year>`.
The year comes from the build, so it does not have to be maintained.

---

## 5. Typography

| Role | Family | Use |
|---|---|---|
| Sans | **IBM Plex Sans** | titles, subheadings, UI text, teasers |
| Serif | **IBM Plex Serif** | body text on the entry page only |
| Mono | **IBM Plex Mono** | prompt, kicker, status, date, meta, tags, numbers |

Mono is the constant across GitHub and blog.
The sans layer may differ, hence Plex Sans here instead of Inter.
Serif exists only here, because it would never work on a tile.

Fonts are loaded from Google Fonts in `Base.astro`, weights 400 and 500 for sans, 400 for serif and mono.

**Two weights: 400 and 500.**
No 600, no 700, same as on the tile layer.

Sizes in px, measured against a text column of roughly 520 to 560px.
Token names are the CSS custom properties in `global.css`.

| Element | Token | Size | Family | Weight |
|---|---|---|---|---|
| Prompt line, wordmark | `--fs-prompt` | 12 | Mono | 400 |
| Kicker (`RUNNING`, experiment name) | `--fs-kicker` | 11, tracking 0.2em | Mono | 400 |
| Date, status, meta, filter | `--fs-meta` | 11 | Mono | 400 |
| Number block | `--fs-numbers` | 12, line height 1.9 | Mono | 400 |
| Framing text, landing page | `--fs-frame-home` | 13 | Sans | 400 |
| Teaser | `--fs-teaser` | 13.5 | Sans | 400 |
| Header, landing page | `--fs-head` | 14 | Sans | 400 |
| Framing text, experiment page | `--fs-frame` | 14.5 | Sans | 400 |
| Subheading inside body text | `--fs-h-inline` | 15 | Sans | 500 |
| **Body text, entry page** | `--fs-read` | **15.5, line height 1.78** | **Serif** | **400** |
| Entry title in lists | `--fs-entry-list` | 16 | Sans | 500 |
| Experiment title, landing page | `--fs-title-home` | 19 | Sans | 500 |
| Experiment title, experiment page | `--fs-title-exp` | 26 | Sans | 500 |
| Entry title, entry page | `--fs-title-entry` | 27 | Sans | 500 |

Three measures, not one:

| Token | Width | Use |
|---|---|---|
| `--w-page` | 688px | page frame, plus 24px padding |
| `--w-read` | 520px | serif body text, roughly 70 characters |
| `--w-frame` | 600px | sans framing text, which reads faster |

Reading comfort outranks a fast overview, and that rule holds for every running-text spot, not just the entry body.

**Radii.**
`--radius` 8px for cards, the state box and the nav fields, `--radius-sm` 3px for tags.
One radius per class of object, so frames read as one family.

**Breakpoint.**
There is one, at 620px, and it is a container query (`@container page`) rather than a media query.
`html` is the container.
At that width the three large title sizes step down, the body text steps **up** to 16px, page padding drops to 16px, and the two-column layouts (log row, entry nav, card head) become single-column.

---

## 6. Colours dark

Base from `kachel-spezifikation-v4.md`.
Five values are new and are not in that document; they cover roles a tile does not have.

| Role | Token | Hex | New | Use |
|---|---|---|---|---|
| bg | `--bg` | `#12100E` | | page, all surfaces |
| running surface | `--surface-run` | `#12100E` | | no fill in dark, see section 8 |
| hairline soft | `--hairline-soft` | `#241E18` | **new** | list separators, neutral borders |
| hairline | `--hairline` | `#332A21` | | strong separation, rare |
| title | `--title` | `#FAF6F0` | | |
| title at rest | `--title-rest` | `#FAF6F0` | | identical in dark, differs in light |
| reading text (serif) | `--read` | `#C4B8A9` | **new** | entry body |
| body text (sans) | `--body` | `#B5A899` | **new** | framing text, teaser, header |
| meta | `--meta` | `#7E7365` | **new** | date, membership, filter, footer |
| dimmed | `--dim`, `--dim-text`, `--sep` | `#4A4038` | **new** | unreached state, empty nav field, separators |

`#9C9082` from the tile specification is **not** used for body text on the blog.
At tile size it is right; across several hundred words it is too quiet.

| Role | Token | Hex |
|---|---|---|
| identity dot | `--identity` | `#E0A34B` |
| prompt line, wordmark, ways back | `--prompt` | `#B07A2E` |
| status `running` | `--st-running` | `#5EEAD4` with glow |
| status `partial answer` | `--st-partial` | `#2DD4BF` |
| status `concluded` | `--st-concluded` | `#14807A` |
| border of a running block | `--border-run` | `#14807A` |
| kicker | `--kicker-text` | `#2DD4BF` |
| tag: text · fill · border | `--tag-text` · `--tag-fill` · `--tag-border` | `#2DD4BF` · `#0A2724` · `#0E4B45` |

The border of the running block stays `#14807A` deliberately and not `#2DD4BF`, otherwise it competes with the glowing dot.

The kicker carries the same teal as the state ramp: a kicker names a layer of the site, and every layer is a state of some experiment.

**Glow** only on the `running` status dot:

```css
--dot-effect: 0 0 7px #5EEAD4;
```

No glow on block borders.
On a text page it does not carry; border colour and white space do the work there.

---

## 7. Colours light

Base from section 6b of the tile specification.
Four values are new.

| Role | Token | Hex | New | Use |
|---|---|---|---|---|
| bg | `--bg` | `#FBF8F3` | | page |
| running surface | `--surface-run` | `#F4EEE5` | | see section 8 |
| hairline soft | `--hairline-soft` | `#E2DACE` | | list separators, resting borders |
| hairline | `--hairline` | `#D6CDBF` | | strong separation, rare |
| title | `--title` | `#1A1613` | | |
| title at rest | `--title-rest` | `#3D352E` | **new** | titles of resting experiments |
| reading and body text | `--read`, `--body` | `#6B6055` | | one step stronger for long texts |
| meta | `--meta` | `#8A7F72` | **new** | date, membership, filter, footer |
| dimmed, dots and borders | `--dim` | `#C9A96E` | **new** | resting identity dot, empty nav field |
| dimmed, as text | `--dim-text` | `#9C8455` | **new** | `#C9A96E` lacks contrast as text |
| separators | `--sep` | `#D6CDBF` | **new** | |

| Role | Token | Hex |
|---|---|---|
| identity dot | `--identity` | `#A86F22` |
| prompt line, wordmark, ways back | `--prompt` | `#8F5D18` |
| status `running` | `--st-running` | `#0B4742` with ring |
| status `partial answer` | `--st-partial` | `#0E5F5A` |
| status `concluded` | `--st-concluded` | `#14807A` |
| border of a running block | `--border-run` | `#0E5F5A`, 1px |
| kicker | `--kicker-text` | `#0E5F5A` |
| tag: text · fill · border | `--tag-text` · `--tag-fill` · `--tag-border` | `#0E5F5A` · `#E8F4F2` · `#B9DEDA` |

**The ramp runs backwards.**
In light mode `running` is the darkest tone and `concluded` the lightest.
Presence on a light ground is darkness.
The scale is not inverted; the roles shift two steps, as in the tile specification.

Light mode is one `@media (prefers-color-scheme: light)` block that redefines tokens only.
No component below it ever reads a hex value, only a role name.
There is no manual theme toggle.

---

## 8. State rendering

The state is carried **twice** in both modes, once on the dot and once on the block.

| | Dark | Light |
|---|---|---|
| dot `running` | `#5EEAD4` plus glow | `#0B4742` plus ring |
| dot otherwise | ramp, bare | ramp, bare |
| block `running` | border `#14807A`, no fill | fill `#F4EEE5`, border `#0E5F5A` 1px |
| block otherwise | border `#241E18` | border `#E2DACE` 1px |

**The ring is the sharp counterpart of the glow**, same geometry, concentric and outward.
That makes dark and light one idea in two materials rather than two designs.
A blur on a light ground produces a grey smudge instead of light, so it is dropped there without replacement.

Dot ⌀ 7, gap 2 in the surface colour, ring 1.
One `box-shadow`, no extra element:

```css
--dot-effect: 0 0 0 2px var(--dot-gap), 0 0 0 3px #B9DEDA;
```

The second colour in the gap is always the colour of the surface underneath.
That surface is handed down by whichever block the dot sits in: `--dot-gap` defaults to `--bg` and is overridden to `--surface-run` inside a running card.

**Why surface and not border weight.**
The tile specification grades light mode by 3px against 1.5px.
On a text page that is a hard jump, and 1.5px does not sit cleanly on devices with one device pixel per CSS pixel; it gets rounded or blurred.
The mix of surface and colour solves both: it reads calmer, keeps the colour signal at the block edge, and everywhere the value is 1px.

The state is therefore carried three ways: surface, border colour and ring.
Should that turn out to be too much in practice, the ring is the candidate to drop, not the colour.

---

## 9. Tags and filter

Two axes, no categories.

- **Stack:** `dotnet` · `python` · `rag` · `pgvector` · `eval` · `grounding` and whatever comes next.
  Grows organically and maps the move from .NET to Python by itself.
- **State:** the three from section 3.

Tags live on the experiment, not on the entry.
They are rendered as chips on the experiment card and on the experiment page (`TagList.astro`).

The filter row (`FilterBar.astro`) sits above the line, not above the experiments, and is set in mono.
It carries `all`, the three states, a separator, and then every stack tag in use across all experiments, deduplicated and sorted.
The active filter gets an amber underline.

It is client-side by decision: the buttons toggle `hidden` on the rows based on `data-tags` and `data-status`.
A filter state cannot be linked or bookmarked, and that is the accepted price at this size.
Without JavaScript the full list simply stays visible, which is the correct fallback for a list that is complete to begin with.

An entry's state is the state of its experiment.
Free notes carry no `data-status` and therefore drop out of the state filter, while the tag filter leaves them untouched.

**Turn this around** as soon as the filter row carries more than about five stack tags, or the list passes fifteen entries.
From there the filter is navigation rather than convenience, and navigation belongs in the URL: static routes under `/log/tag/<tag>`.
The rebuild is cheap, because `tags` is already in the frontmatter and only one route has to be added.

**Categories are postponed, not rejected.**
Four top-level categories across three entries produce three empty shelves, and an empty category says louder than no category that there is little here.
At around fifteen entries the categories write themselves, because by then it is visible what was actually written about instead of what was meant to be.

---

## 10. Deliberately not included

| Element | Reason |
|---|---|
| project index on the blog | the GitHub profile carries that now. A second index competes with the README and loses. |
| `DECISION` and `THOUGHT` | verdict and genre labels, replaced by state. |
| Now or About page | ages. The running experiments are the more honest answer. |
| hand-kept status line in the header | the same thing falls out of the state model without maintenance. |
| glow in light mode | grey smudge instead of light. |
| hover states as carriers of meaning | what is on the page has to be enough. |
| reading time (`5 min`) | a promise nobody can keep. Reading speed differs, for reasons that are nobody's business, and a minute count quietly sets a norm. The meta line therefore carries the date and the position in the thread and nothing else. |
| manual light/dark toggle | the system preference is the answer. A toggle adds state that has to be stored and restored. |

---

## 11. Legacy content

Done.
The former content under `src/content/` was removed rather than migrated.
It stood on .NET projects that are no longer on display on the GitHub profile, and in a tone this specification replaces.

Archival: the texts stay in the git history permanently and can be restored via `git log` at any time.
An additional local export is convenience, not a backup.

**Dead links.**
After the rebuild `/projects/*`, `/decisions/*` and `/thoughts/*` lead nowhere, and some of them are linked externally.
Since the content is gone without replacement, there is no meaningful target for individual redirects.
The decision is one blanket redirect to the landing page, executed by Azure Static Web Apps rather than by Astro.

`public/staticwebapp.config.json`, so the file lands in the root of the output:

```json
{
  "routes": [
    { "route": "/decisions/*", "redirect": "/", "statusCode": 301 },
    { "route": "/thoughts/*", "redirect": "/", "statusCode": 301 },
    { "route": "/projects/*", "redirect": "/", "statusCode": 301 }
  ]
}
```

The same file also carries three global headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`) and a 404 response override.

Reasoning against the Astro variant: with a static build and no adapter, Astro only produces a client-side redirect via `<meta http-equiv="refresh">` without a status code, and it does not allow a pattern route onto a fixed target but demands routes of the same shape.
Every old slug would have to be maintained individually.
Routing is part of the free tier, so the decision costs nothing.
The only price is the tie to the host: on a move, those three rules get rewritten.

---

## 12. Build and hosting

| Piece | Value |
|---|---|
| Framework | Astro 4.16, static output, no adapter |
| Integration | `@astrojs/mdx`, `@astrojs/rss` |
| Syntax highlighting | built-in Shiki, theme `vitesse-dark`, no wrapping |
| Site URL | `https://goldbarth.dev` |
| Host | Azure Static Web Apps |
| Commands | `npm run dev` · `npm run build` · `npm run preview` |

Code blocks stay dark in light mode.
That is a known and accepted detail: a single theme keeps the highlighting consistent, and a code block is a foreign object on the page in either mode.

`npm run build` is the check before committing, because it validates the frontmatter against the schema.
What the schema does not catch is an `experiment:` value pointing at a file that does not exist; the empty experiment page catches that one.

The authoring guide with the frontmatter templates is `docs/authoring.md`.

---

## 13. Open

- **The 404 page.**
  `staticwebapp.config.json` rewrites onto `/404.html`, but no `src/pages/404.astro` exists, so the build does not produce that file.
  Either the page gets built or the override goes.
- Whether the filter row moves to server-side routes.
  Decided in principle in section 9, with the thresholds that trigger it; not written yet.
- Whether the sans layer stays on Google Fonts or moves to self-hosted files.
  Self-hosting removes a third-party request and a preconnect; nothing else in the design depends on it.
