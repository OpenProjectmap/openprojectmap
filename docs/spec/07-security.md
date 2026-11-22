# 07: Security

## 1. Threat model

| Asset | Threat | Where it can happen |
| --- | --- | --- |
| Viewers of a published map | Script injection via doc, config or git text (XSS) | A map built from a fork's PR or a malicious contributor's docs, then viewed by the maintainer or the public |
| The machine running `build` | Reading files outside the repo into a public map; command injection through git refs | A PR edits `opmap.config.json` paths or branch names |
| CI secrets | Exfiltration through the Action | `pull_request_target` misuse; shell interpolation of inputs |
| Private roadmaps | Accidental publication | Pages on a private repo; a hub exposed without auth |
| Users of the npm package / image | Supply-chain compromise | A dependency takeover, a stolen publish token |

Trust assumptions: the repo owner trusts their own docs, config and machine. Contributors' changes
are **untrusted** until merged. The generated page is viewed by people who did not write it.

## 2. Rendering controls (XSS)

1. **No HTML-string sinks** in the client: `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
   `document.write`, `DOMParser` on doc text, `eval`, `Function`, `setTimeout(string)`. Enforced
   by ESLint `no-restricted-syntax` / `no-restricted-properties` on `src/render/client/**`.
2. All doc text reaches the DOM through `textContent`, or through `rich()`, which builds nodes.
3. `href` only via `safeHref()` (spec 05 §2). `javascript:`, `data:`, `vbscript:`, protocol-relative
   `//`, backslashes and control characters are rejected after `trim()` and a lowercase check of
   the scheme.
4. No `style` attribute from data; the accent colour must match `^#[0-9a-fA-F]{6}$`.
5. The embedded JSON is escaped (`<`, `>`, `&`, U+2028, U+2029), so `</script>` in a doc can't close the tag.
6. The build-time `<noscript>` summary uses `escapeHtml` for every interpolation; it's the only
   place HTML strings are built, and it has its own XSS test.
7. **CSP by hash** with `default-src 'none'` (spec 05 §6) as a second layer: even if a sink slipped
   in, injected inline script would not run.

**Tests** (`test/xss/`): a payload corpus (`<script>`, `<img onerror>`, `javascript:` links in
markdown links and autolinks, `</script>` in text, SVG payloads, unicode line separators, CSS
`expression`, `"><svg/onload>`) is injected into **every** text field of a fixture (title, Now
fields and facts, version titles, goals, exits, status lines, deliverable cells, extra columns,
decision and risk cells, changelog items, config name, git subjects via a fake git layer). For each
built page, Playwright asserts: no dialog fires, `window.__pwned` is undefined, there are no
`javascript:` hrefs in the DOM, and the CSP meta is present. A new rendered field without a corpus
entry fails a coverage test that compares the ProjectData keys rendered against the corpus.

## 3. Filesystem controls

- Config paths are resolved, `realpath`-ed (following symlinks) and required to be inside the repo
  root (spec 04 §3.2). The same applies to `output.dir`, and to `tracks[].file`.
- The tool reads only the configured doc files and git metadata. It never globs the repo for content.
- Writes: only `output.dir` (build), the configured doc files (authoring commands, atomic rename),
  and files `init` creates (never overwritten without `--force` + confirmation).
- v0.6 adds three writers, each narrow: `import` writes only `ROADMAP.import.md` next to the roadmap
  (an existing file, or a link at that name, is replaced as itself, only with `--force`);
  `save_proposal` writes only `proposals/<slug>.md` (slug `[a-z0-9-]{1,60}`, created with `wx` so
  nothing is overwritten, and a `proposals` folder that is a link out of the repo is refused);
  `propose --check <file>` reads only `.md` or `.txt` files that `realpath` puts inside the repo.
- Text that an agent or another tool supplies (MCP inputs, GitHub issue titles, CSV cells) never
  becomes structure: the editor refuses a line break in a table cell or field, a field name must be
  plain words (no `*` or `:`), a reference cannot hold `(`, `)` or `|`, ids are plain words, and
  importer text is cleaned to one line without `|`, `*`, backticks or control characters. Tests feed
  each of these hostile strings in and check that no row, heading or block appears.

## 4. Process and network controls

- Git through `execFile` with an argument array, validated refs, `GIT_TERMINAL_PROMPT=0`, timeouts.
- The GitHub CLI (`gh api`) for `import github`, through `execFile`, with fixed arguments and a
  validated `owner/repo`, in `src/node/gh.ts` only. The tool never sees, stores or logs a token (D24).
- The MCP server speaks over stdin and stdout only: it opens no port and makes no network request.
  Its tool descriptions tell the agent that text from the docs is data, not instructions.
- No other subprocesses, except the OS "open" command for `--open` (fixed binary, the path as a
  single argument).
- No outbound network, except `git fetch` when explicitly asked (`--fetch`, hub refresh) and the clone of a
  hub `repo` entry. Those git calls allow only the https, ssh and file transports, take the URL after `--`,
  and reset only folders that carry the tool's `.opmap-managed` marker.
- `serve` binds `127.0.0.1` by default; `--host 0.0.0.0` prints a warning ("no authentication: put
  it behind a reverse proxy with auth"). It serves only files under the output dir, resolved with
  `path.resolve` + a prefix check after decoding, rejects `..`, NUL and backslashes, allows GET/HEAD
  only, sends security headers, and has no directory listing. SSE `/events` carries only a "reload" event.

## 5. CI and Action controls

- The Action reads inputs from `env:` only, validates `version` with a regex, and never
  interpolates `${{ }}` into `run:` scripts.
- The documented PR workflow uses `pull_request` (a read-only token for forks) and never
  `pull_request_target` with a checkout of PR code.
- Third-party actions are pinned by full commit SHA; Dependabot keeps them updated.
- Workflows declare minimal `permissions`.

## 6. Supply chain

- Zero runtime dependencies in `openprojectmap` (D5). The MCP server is a separate package
  (`@openprojectmap/mcp`) whose dependencies (the official SDK and `zod`) are pinned to exact
  versions and have their own Dependabot entry, so the CLI package stays free of them. Dev dependencies are locked
  (`pnpm-lock.yaml`), `pnpm install --frozen-lockfile` in CI, and Dependabot is enabled.
- npm publishing through **trusted publishing** (GitHub OIDC), with `--provenance`; no long-lived
  npm token is stored; 2FA on maintainer accounts.
- The Docker image is built in CI from a pinned base digest, signed with cosign keyless, with an
  SBOM attached (syft). It runs as non-root `node`.
- `files` in package.json is an allow-list; `npm pack --dry-run` output is checked in CI for
  unexpected files.

## 7. Privacy

- No telemetry, analytics, update checks or remote fonts (D10).
- The page sends `Referrer-Policy: no-referrer` (meta and header).
- Docs warn that Pages is public, and `init` adds `.opmap/` to `.gitignore`, so built maps are not
  committed by accident.

## 8. Pre-release security checklist (part of the Definition of Done)

- [ ] The XSS suite passes, and every rendered field is covered.
- [ ] No new HTML-string sink (lint is clean).
- [ ] New config paths or keys go through containment and validation.
- [ ] New subprocess calls use `execFile` with validated arguments.
- [ ] `npm pack --dry-run` file list reviewed.
- [ ] Workflows: pinned SHAs, minimal permissions, no input interpolation.
