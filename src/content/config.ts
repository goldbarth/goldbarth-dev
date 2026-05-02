import { defineCollection, z } from 'astro:content';

const postSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  date: z.coerce.date(),
  draft: z.boolean().default(false),
});

export const collections = {
  projects: defineCollection({ type: 'content', schema: postSchema }),
  decisions: defineCollection({ type: 'content', schema: postSchema }),
  thoughts: defineCollection({ type: 'content', schema: postSchema }),
};
