// Public programmatic API (spec 01 §6).
export { parseProject } from './core/index.js';
export type { ParseProjectOptions, ProjectSources, Source } from './core/index.js';
export { OpmapError } from './core/errors.js';
export { buildData, buildProject, renderMap, VERSION } from './node/build.js';
export type { BuildOptions } from './node/build.js';
export { loadConfig } from './node/config.js';
export type { ResolvedConfig } from './node/config.js';
export type { ProjectData, Diagnostic } from './core/types.js';
