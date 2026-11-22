import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  define: { __OPMAP_VERSION__: JSON.stringify(version) },
  // Workspace packages import the CLI package by name; tests use its source, not a build.
  resolve: { alias: { openprojectmap: fileURLToPath(new URL('./src/index.ts', import.meta.url)) } },
  test: {
    // axe-core and jsdom are slow under coverage on a busy runner; a timeout is not a bug.
    testTimeout: 30_000,
    include: ['test/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/render/assets.generated.ts', 'src/**/*.html', 'src/**/*.css'],
    },
  },
});
