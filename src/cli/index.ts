import { CORE_NAME } from '../core/index.js';

export function main(argv: readonly string[]): number {
  process.stdout.write(`openprojectmap (${CORE_NAME}) ${argv.length > 0 ? '' : 'skeleton'}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
