// Placeholder build for v0.0.1: bundles the CLI and API with esbuild (D7).
// The client/template pipeline from spec 01 §5 arrives with v0.1.0-D11.
import { build } from 'esbuild';

await build({
  entryPoints: { cli: 'src/cli/index.ts', index: 'src/index.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});
