# 01: Architecture

## 1. Goals and non-goals

**Goals**

- Read a small, documented markdown format (spec 02) and produce one self-contained HTML file.
- Run anywhere Node 20.11+ runs: macOS, Linux, Windows, CI, a VPS, a container.
- Be safe to run on untrusted docs (a fork's PR) and safe to publish (no script injection).
- Be friendly to AI agents: precise diagnostics, machine-readable output, source-preserving edits.

**Non-goals**

- A hosted service, accounts, a database, or real-time collaboration (see the Parked list).
- A general markdown renderer. Only a small inline subset is rendered (spec 05 §3).
- Task tracking below the deliverable level. Tasks live in your head, your agent's todo list or your issues.

## 2. Principles

1. **The docs are the database.** All state lives in the user's git repo. The tool is a pure
   function: `docs + git facts + now → map`.
2. **Zero runtime dependencies** (D5). Smaller attack surface, instant `npx`, no lockfile drift
   for users.
3. **Isomorphic core.** `src/core` runs unchanged in Node and in the browser (for in-page "Open
   docs…", spec 05 §4.7).
4. **Deterministic.** The same inputs and `now` give byte-identical output. Nothing in the core
   reads the clock, the environment or the filesystem.
5. **Fail soft, explain precisely.** Bad input produces diagnostics with code, file:line and a fix
   hint, never a stack trace. Only unreadable config or a missing roadmap is fatal.
6. **No network.** The CLI never opens a socket, except `serve` listening on localhost and an
   explicit `--fetch` running `git fetch`.

## 3. Repository layout

```
openprojectmap/
├─ src/
│  ├─ core/                  # isomorphic: no node:*, no process, no Date.now()
│  │  ├─ scan.ts             # markdown → Block[] with positions
│  │  ├─ inline.ts           # inline subset tokenizer (shared with the renderer)
│  │  ├─ dates.ts            # window grammar → {start, end}
│  │  ├─ status.ts           # status words, aliases, cell parsing
│  │  ├─ parse-roadmap.ts
│  │  ├─ parse-decisions.ts
│  │  ├─ parse-changelog.ts
│  │  ├─ derive.ts           # states, progress, current version, needs-your-call, staleness
│  │  ├─ validate.ts         # cross-file checks → Diagnostic[]
│  │  ├─ codes.ts            # diagnostic catalogue (code → severity, message, hint)
│  │  ├─ types.ts            # ProjectData v1 (spec 03)
│  │  └─ index.ts            # parseProject(sources, options): ProjectData
│  ├─ node/                  # Node-only adapters
│  │  ├─ config.ts           # discovery, validation, defaults, path containment
│  │  ├─ sources.ts          # read files (UTF-8, CRLF/BOM normalised) with display paths
│  │  ├─ git.ts              # execFile wrapper, ref validation, facts
│  │  ├─ editor.ts           # source-preserving edits (v0.4)
│  │  ├─ serve.ts            # dev server + SSE (v0.4)
│  │  └─ hub.ts              # multi-project index (v0.5)
│  ├─ render/
│  │  ├─ template.html       # skeleton with placeholders
│  │  ├─ styles.css
│  │  ├─ client/             # browser code, bundled to one IIFE string
│  │  │  ├─ main.ts  router.ts  h.ts  safe.ts  rich.ts  theme.ts
│  │  │  └─ views/ overview.ts timeline.ts versions.ts decisions.ts history.ts parked.ts
│  │  └─ render.ts           # (data, assets) → { html, cspHashes }
│  ├─ cli/
│  │  ├─ index.ts            # bin entry: argv → command
│  │  ├─ output.ts           # text/json/github formatters, colour (NO_COLOR aware)
│  │  └─ commands/ init.ts build.ts check.ts serve.ts set-status.ts … doctor.ts
│  └─ index.ts               # public programmatic API
├─ scripts/
│  ├─ build.mjs              # esbuild: client → string, then CLI + API bundles
│  └─ gen-schema.mjs         # types → schema/*.json (v0.4)
├─ schema/                   # JSON Schemas (config.v1.json, project-data.v1.json)
├─ templates/                # files written by `init`
├─ examples/tidepool/        # fictional demo project (also a fixture)
├─ skills/openprojectmap/    # agent skill
├─ test/
│  ├─ unit/                  # per module
│  ├─ fixtures/<case>/       # input docs + expected.json + expected-diagnostics.txt
│  ├─ xss/                   # payload corpus + render harness
│  └─ e2e/                   # Playwright (v0.2)
└─ docs/ project/ spec/ guide/
```

## 4. Data flow

```
             ┌──────────── src/node ────────────┐        ┌──────── src/core (pure) ────────┐
argv ─► CLI ─► loadConfig ─► readSources ─────────┼──────► scan ─► parse-* ─► derive ─► validate
                    │                             │                                    │
                    └─► git facts (execFile) ─────┼──────────────► ProjectData ◄────────┘
                                                  │                    │
                                                  └─ render(data) ─► index.html (+ data.json)
```

1. **Config** (`node/config.ts`) yields a fully defaulted `ResolvedConfig` with absolute paths.
2. **Sources** (`node/sources.ts`) returns `{ roadmap?: Source, decisions?: Source, changelog?: Source, tracks: Source[] }`,
   where `Source = { path: string /* display, repo-relative, '/' separated */, text: string }`.
3. **Core** `parseProject(sources, { now, config })`:
   - `scan(text)` → `Block[]`: `heading{level,text}`, `field{key,value}`, `table{head[],rows[][]}`,
     `paragraph`, each with `line` (1-based) and `column`.
   - The `parse-*` functions walk blocks with a tiny section state machine (spec 02 §3) and build
     typed records with `source: {file, line}`.
   - `derive` computes everything the views need (spec 03 §3), so the client does no logic beyond
     filtering.
   - `validate` runs the cross-file rules (IDs, milestones, changelog ↔ versions).
4. **Git** facts are attached as `data.git` after the core runs (the core never sees git).
5. **Render** serialises the data into the template (spec 05 §1) and computes CSP hashes.

### 4.1 Scanner details

- Normalise: strip a UTF-8 BOM; `\r\n` and `\r` → `\n`; tabs kept.
- Skip fenced code (```` ``` ```` or `~~~`, with matching fence length) and HTML comments
  (`<!-- … -->`, which may span lines). The format marker `<!-- opmap: 1 -->` is read before skipping.
- Headings: ATX only (`#` to `######` followed by a space). Setext headings are treated as paragraphs.
- Field: `^\*\*([^*]+?):\*\*\s+(.*)$` (key without the colon; key compared case-insensitively
  after trimming and collapsing whitespace).
- Table: a row line starting with `|` followed by a delimiter row `^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$`.
  Cells are split on `|` that is not escaped (`\|`) and not inside backtick code spans. Rows
  continue until a line that doesn't start with `|`. Rows with fewer cells are padded with `''`;
  extra cells are dropped with info `OPM-I702`.
- All regexes are linear (no nested quantifiers); the scanner is O(n) in input length.

## 5. Building the package

`scripts/build.mjs` (esbuild only):

1. Bundle `src/render/client/main.ts` → IIFE, `target: es2020`, minified, no sourcemap; read
   `styles.css`, minified with esbuild's CSS loader.
2. Write `src/render/assets.generated.ts` exporting `CLIENT_JS`, `STYLES_CSS`, `TEMPLATE_HTML`
   as string constants (gitignored; created before typecheck/test via a `pre` script).
3. Bundle `src/cli/index.ts` → `dist/cli.js` (`platform: node`, `format: esm`, `target: node20`,
   banner `#!/usr/bin/env node`).
4. Bundle `src/index.ts` → `dist/index.js`; `tsc --emitDeclarationOnly` → `dist/index.d.ts`.

`package.json` (essentials):

```json
{
  "name": "openprojectmap",
  "type": "module",
  "bin": { "openprojectmap": "dist/cli.js", "opmap": "dist/cli.js" },
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist", "templates", "schema", "skills"],
  "engines": { "node": ">=20.11" },
  "packageManager": "pnpm@10",
  "dependencies": {}
}
```

## 6. Programmatic API (`src/index.ts`)

```ts
export function parseProject(sources: Sources, options: { now: Date; config?: Partial<Config> }): ProjectData;
export async function buildProject(opts: { cwd?: string; configPath?: string; now?: Date; git?: boolean; fetch?: boolean })
  : Promise<{ data: ProjectData; html: string; outDir: string }>;
export function renderMap(data: ProjectData, opts?: { mode?: 'file' | 'hub-child' }): { html: string };
export type { ProjectData, Diagnostic, Config } from './core/types.js';
```

The API follows the same semver as the CLI from v1.0.

## 7. Error model

```ts
interface Diagnostic {
  code: `OPM-${'E' | 'W' | 'I'}${number}`;
  severity: 'error' | 'warning' | 'info';
  message: string;      // one sentence, names the offending value
  hint?: string;        // how to fix, imperative
  file?: string;        // display path
  line?: number;        // 1-based
  column?: number;      // 1-based
}
```

- Fatal problems (config unreadable, roadmap missing) throw `OpmapError { code, message, hint }`,
  which the CLI prints and exits with code 2.
- Unexpected exceptions exit with code 3 and print "this is a bug" with a link to issues;
  `OPMAP_DEBUG=1` prints the stack.

## 8. Performance budgets

| Measure | Budget |
| --- | --- |
| `build` on tidepool (cold `npx` excluded) | < 300 ms |
| `build` on the 1,000-deliverable stress fixture | < 1 s |
| Gzipped template + client | ≤ 60 KB |
| Page interactive on a mid-range phone, 1,000 deliverables | < 1 s |

## 9. Cross-platform rules

- Read files as UTF-8; display paths are repo-relative with `/` separators on every OS.
- Never build shell strings; `execFile` with an argument array; on Windows, resolve `git.exe`
  through PATH (`execFile` does this) and pass `windowsHide: true`.
- Output files are written with `\n` line endings.
- Tests run on Windows in CI (R6).
