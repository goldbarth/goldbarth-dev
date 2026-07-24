import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  // Entries only. A state change without a new entry is a quiet change and
  // should notify nobody (spec §2).
  const entries = await getCollection('log', ({ data }) => !data.draft);

  const items = entries
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
    .map((entry) => ({
      title: entry.data.title,
      description: entry.data.teaser,
      pubDate: entry.data.date,
      link: `/log/${entry.slug}/`,
    }));

  return rss({
    title: 'goldbarth.dev',
    description: 'Field notes on LLM systems in .NET and Python. Experiments, partial answers, open questions.',
    site: context.site!,
    items,
  });
}
