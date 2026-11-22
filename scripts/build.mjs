// Bundles the CLI and the API with esbuild (spec 01 §5). `pnpm assets` runs first (prebuild) and
// writes src/render/assets.generated.ts, so the client and styles are inside both bundles.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'info',
  define: { __OPMAP_VERSION__: JSON.stringify(version) },
};

await build({
  ...common,
  entryPoints: { cli: 'src/cli/bin.ts' },
  outdir: 'dist',
  banner: { js: '#!/usr/bin/env node' },
});
await build({ ...common, entryPoints: { index: 'src/index.ts' }, outdir: 'dist' });

// The MCP server package (packages/mcp): its own code is bundled; its dependencies stay external
// so npm installs them (the CLI package is one of them).
const mcp = JSON.parse(readFileSync('packages/mcp/package.json', 'utf8'));
await build({
  ...common,
  entryPoints: { bin: 'packages/mcp/src/bin.ts' },
  outdir: 'packages/mcp/dist',
  banner: { js: '#!/usr/bin/env node' },
  external: Object.keys(mcp.dependencies),
  packages: 'external',
  define: { __MCP_VERSION__: JSON.stringify(mcp.version) },
});
