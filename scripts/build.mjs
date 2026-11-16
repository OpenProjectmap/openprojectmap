// Build for v0.0.1: bundles the CLI and the API with esbuild (D7).
// The client/template pipeline from spec 01 §5 arrives with v0.1.0-D11.
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: { cli: 'src/cli/index.ts' },
  outdir: 'dist',
  banner: { js: '#!/usr/bin/env node' },
});
await build({ ...common, entryPoints: { index: 'src/index.ts' }, outdir: 'dist' });
