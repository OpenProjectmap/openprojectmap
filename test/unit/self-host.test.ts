import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHubConfig } from '../../src/core/hub.js';

const dir = join(import.meta.dirname, '../../examples/self-host');
const read = (f: string): string => readFileSync(join(dir, f), 'utf8');

describe('examples/self-host', () => {
  it('has a hub file the tool accepts', () => {
    const hub = parseHubConfig(read('opmap.hub.json'));
    expect(hub.projects.length).toBeGreaterThan(1);
    for (const p of hub.projects) expect(p.repo).toBeDefined();
  });
  it('defines every ssh alias the hub file uses, and one key file each', () => {
    const hub = parseHubConfig(read('opmap.hub.json'));
    const config = read('ssh/config');
    const compose = read('docker-compose.yml');
    for (const p of hub.projects) {
      const alias = /^git@([^:]+):/.exec(p.repo ?? '')?.[1];
      if (alias === undefined) continue;
      expect(config).toContain(`Host ${alias}`);
      const key = new RegExp(`Host ${alias}\\n(?:.*\\n)*?\\s+IdentityFile ~/\\.ssh/(\\S+)`).exec(
        config,
      )?.[1];
      expect(key, `a key for ${alias}`).toBeDefined();
      expect(compose).toContain(`/home/node/.ssh/${key}:ro`);
    }
  });
  it('keeps the page off the public network and mounts everything read-only', () => {
    const compose = read('docker-compose.yml');
    const opmap = compose.slice(compose.indexOf('  opmap:'), compose.indexOf('  caddy:'));
    expect(opmap).toContain('expose:');
    expect(opmap).not.toContain('ports:');
    for (const line of opmap.split('\n').filter((l) => /^\s+- \.\//.test(l)))
      expect(line).toMatch(/:ro$/);
    expect(compose).toContain('ghcr.io/openprojectmap/openprojectmap:');
  });
  it('asks for a password and does not ship a usable one', () => {
    const caddy = read('Caddyfile');
    expect(caddy).toContain('basic_auth');
    expect(caddy).toContain('REPLACE_WITH_THE_OUTPUT_OF_caddy_hash-password');
    expect(caddy).toContain('reverse_proxy opmap:4173');
  });
  it('is described by a guide that names real files', () => {
    const guide = readFileSync(
      join(import.meta.dirname, '../../docs/guide/self-hosting.md'),
      'utf8',
    );
    for (const f of ['opmap.hub.json', 'docker-compose.yml', 'Caddyfile', 'ssh/config'])
      expect(existsSync(join(dir, f))).toBe(true);
    expect(guide).toContain('examples/self-host/');
    expect(guide).toContain('Allow write access');
    expect(guide).toContain('public on free plans');
  });
});
