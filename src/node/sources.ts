// Reads the configured doc files (UTF-8) with display paths: repo-relative and `/` separated.
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import type { ProjectSources, Source } from '../core/index.js';
import { OpmapError } from '../core/errors.js';
import type { ResolvedConfig } from './config.js';

export function displayPath(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/');
}

function read(config: ResolvedConfig, abs: string): Source {
  return { path: displayPath(config.root, abs), text: readFileSync(abs, 'utf8') };
}

/** Read the roadmap (required) and the decisions and changelog files (optional). */
export function readSources(config: ResolvedConfig): ProjectSources {
  let roadmap: Source;
  try {
    roadmap = read(config, config.docs.roadmap);
  } catch (e) {
    throw new OpmapError(
      'OPM-E001',
      `The roadmap file could not be read: ${(e as Error).message}`,
      'Set docs.roadmap in opmap.config.json or run opmap init',
    );
  }
  return {
    roadmap,
    decisions: config.docs.decisions ? read(config, config.docs.decisions) : undefined,
    changelog: config.docs.changelog ? read(config, config.docs.changelog) : undefined,
  };
}
