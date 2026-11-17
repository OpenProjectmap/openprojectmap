// Fatal problems (spec 01 §7): the CLI prints these and exits with code 2.
import type { Diagnostic } from './types.js';

export class OpmapError extends Error {
  readonly code: Diagnostic['code'];
  readonly hint: string | undefined;

  constructor(code: Diagnostic['code'], message: string, hint?: string) {
    super(message);
    this.name = 'OpmapError';
    this.code = code;
    this.hint = hint;
  }
}
