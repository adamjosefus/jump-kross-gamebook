import path from 'node:path';

import { defineProject } from 'vitest/config';

/** Unit tests of the web's pure functions; components are looked at in Storybook. */
export default defineProject({
  test: {
    name: 'web',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
