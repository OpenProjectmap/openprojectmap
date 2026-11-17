import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/render/assets.generated.ts', 'src/**/*.html', 'src/**/*.css'],
    },
  },
});
