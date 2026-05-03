import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://goldbarth.dev',
  markdown: {
    // Built-in Shiki — closest match to the amber-family palette without
    // shipping a custom theme. Swap to your own theme JSON later if desired.
    shikiConfig: {
      theme: 'vitesse-dark',
      wrap: false,
    },
  },
});
