// Public programmatic API (spec 01 §6).
export { parseProject } from './core/index.js';
export type { ParseProjectOptions, ProjectSources, Source } from './core/index.js';
export { OpmapError } from './core/errors.js';
export { buildData, buildProject, renderMap, VERSION } from './node/build.js';
export type { BuildOptions } from './node/build.js';
export { loadConfig } from './node/config.js';
export type { ResolvedConfig } from './node/config.js';
export type { ProjectData, Diagnostic } from './core/types.js';
export { queryCheck, queryGet, queryList, queryNow } from './core/index.js';
export type { Item, ListInput, NowSummary } from './core/index.js';
export { EditError } from './node/editor.js';
export { checkProposal, proposalFor, saveProposal } from './node/propose.js';
export type { CheckedRows, ProposeContext, SaveInput } from './node/propose.js';
export type { Proposal, RowCheck } from './core/index.js';
export { opDecide, opLog, opSetStatus, opUpdateNow } from './node/ops.js';
export type {
  DecideInput,
  LogInput,
  OpContext,
  SetStatusInput,
  UpdateNowInput,
} from './node/ops.js';
export type { EditResult } from './node/edit-file.js';
