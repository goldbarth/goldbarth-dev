import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const [thoughts, decisions, projects] = await Promise.all([
    getCollection('thoughts', ({ data }) => !data.draft),
    getCollection('decisions', ({ data }) => !data.draft),
    getCollection('projects', ({ data }) => !data.draft),
  ]);

  const items = [
    ...thoughts.map((e) => ({ ...e, prefix: 'thoughts' })),
    ...decisions.map((e) => ({ ...e, prefix: 'decisions' })),
    ...projects.map((e) => ({ ...e, prefix: 'projects' })),
  ]
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
    .map((e) => ({
      title: e.data.title,
      description: e.data.description,
      pubDate: e.data.date,
      link: `/${e.prefix}/${e.slug}/`,
    }));

  return rss({
    title: 'goldbarth.dev',
    description: 'Felix Wahl · .NET Backend Engineer · architecture, decisions, system design.',
    site: context.site!,
    items,
  });
}
