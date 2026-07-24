import { defineCollection, z } from 'astro:content';

// Three states, they hang on the experiment and never on the entry.
const status = z.enum(['running', 'partial answer', 'concluded']);

// The experiment is the unit: a state, a dated log, a framing question.
// No long body text - that lives in the entries.
const experiments = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    frame: z.string(),
    status,
    // Only reached states are written down. The template fills the rest
    // with `open`, because open is a state, not a gap.
    log: z.array(
      z.object({
        state: z.enum(['started', 'running', 'partial answer', 'concluded']),
        date: z.coerce.date(),
      }),
    ),
    tags: z.array(z.string()).default([]),
  }),
});

// The entry is the publication. It carries a date and a URL, no state.
// `experiment` stays a plain slug string rather than a reference(), because
// every lookup here resolves by slug anyway.
const log = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    teaser: z.string(),
    experiment: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { experiments, log };
