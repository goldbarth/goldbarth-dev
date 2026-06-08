import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://goldbarth.dev',
  integrations: [mdx()],
  markdown: {
    // Built-in Shiki — closest match to the amber-family palette without
    // shipping a custom theme. Swap to your own theme JSON later if desired.
    shikiConfig: {
      theme: 'vitesse-dark',
      wrap: false,
    },
  },
});
