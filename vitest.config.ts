import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  define: { __OPMAP_VERSION__: JSON.stringify(version) },
  test: {
    // axe-core and jsdom are slow under coverage on a busy runner; a timeout is not a bug.
    testTimeout: 30_000,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/render/assets.generated.ts', 'src/**/*.html', 'src/**/*.css'],
    },
  },
});
