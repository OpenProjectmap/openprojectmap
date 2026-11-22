import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const root = json('package.json');
const mcp = json('packages/mcp/package.json');

describe('the MCP server package (0.6.0-D2)', () => {
  it('has the same version as the CLI package, so the release publishes a matching pair', () => {
    expect(mcp.version).toBe(root.version);
  });

  it('is named and licensed as the roadmap says', () => {
    expect(mcp.name).toBe('@openprojectmap/mcp');
    expect(mcp.license).toBe(root.license);
    expect(mcp.bin).toEqual({ 'openprojectmap-mcp': 'dist/bin.js' });
    expect(mcp.publishConfig).toEqual({ access: 'public' });
  });

  it('depends on the CLI package through the workspace and pins every other dependency exactly', () => {
    expect(mcp.dependencies.openprojectmap).toBe('workspace:^');
    for (const [name, range] of Object.entries(mcp.dependencies as Record<string, string>)) {
      if (name === 'openprojectmap') continue;
      expect(range, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('keeps the CLI package free of runtime dependencies (D5)', () => {
    expect(root.dependencies).toBeUndefined();
  });

  it('is built into the image workspace and published after the CLI package', () => {
    const docker = readFileSync('Dockerfile', 'utf8');
    expect(docker).toContain('pnpm-workspace.yaml');
    expect(docker).toContain('packages/mcp/package.json');
    const release = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(release.indexOf('npm publish --provenance')).toBeLessThan(
      release.indexOf('Publish the MCP server package'),
    );
    expect(release).toContain("vars.MCP_PUBLISH == 'true'");
  });
});
