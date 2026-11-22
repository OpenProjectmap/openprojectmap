// `openprojectmap-mcp`: serves the MCP tools over stdio. stdout carries the protocol, so every
// message for a person goes to stderr.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

declare const __MCP_VERSION__: string | undefined;
const VERSION = typeof __MCP_VERSION__ === 'string' ? __MCP_VERSION__ : '0.0.0-dev';

const HELP = `openprojectmap-mcp ${VERSION}

Usage: openprojectmap-mcp [--cwd <dir>] [--config <file>] [--read-only]

  --cwd <dir>      the project folder (default: the current folder)
  --config <file>  the opmap.config.json to use (default: found from --cwd)
  --read-only      serve only the read tools (now, list, get, check, propose)
  --version, --help
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cwd: { type: 'string' },
      config: { type: 'string' },
      'read-only': { type: 'boolean' },
      version: { type: 'boolean' },
      help: { type: 'boolean' },
    },
    strict: true,
  });
  if (values.version === true) {
    process.stderr.write(`${VERSION}\n`);
    return;
  }
  if (values.help === true) {
    process.stderr.write(HELP);
    return;
  }
  const cwd = resolve(values.cwd ?? process.cwd());
  const server = createServer({
    cwd,
    configPath: values.config === undefined ? undefined : resolve(cwd, values.config),
    readOnly: values['read-only'] === true,
    version: VERSION,
  });
  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `openprojectmap-mcp ${VERSION} serving ${cwd}${values['read-only'] === true ? ' (read-only)' : ''}\n`,
  );
}

main().catch((e: unknown) => {
  process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
