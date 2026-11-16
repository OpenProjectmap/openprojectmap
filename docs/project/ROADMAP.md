<!-- opmap: 1 -->
# OpenProjectMap: Roadmap

This file is the source of truth for what gets built and when. It is written in the
OpenProjectMap doc format v1 ([spec](../spec/02-doc-format.md)), so the tool renders its own map.
Rules: if it isn't here, it isn't in scope; new ideas go into a later version or into **Parked**;
the newest status line in a version goes last; windows live only on the version blocks.

## Now

**Updated:** 2026-11-16
**Current version:** v0.0.1
**Next step:** Decide D14 (repo visibility) and check that the docs render on GitHub (0.0.1-D5), then start the block scanner (0.1.0-D1). Claiming the npm name needs `npm login` first.
**Why:** The toolchain, skeleton, CI and branch protection are on `main`. What is left of v0.0.1 waits on D14: private vulnerability reporting needs the repo to be public, and the exit criteria say the repo is public.
**Target:** Public alpha (M2) by 2027-01-17
**Live:** nothing published yet

## Phase 1 — Foundations

### v0.0.1 — Seed

**Window:** 2026-11-17 → 2026-11-23
**Goal:** A public repo with toolchain, CI and these planning docs, ready for parser work.
**Exit:** `pnpm install && pnpm test && pnpm lint && pnpm typecheck` pass on Linux, macOS and Windows in CI on Node 20 and 22; the repo is public with licence, README, SECURITY and CONTRIBUTING.
**Status 2026-11-16:** planned. Roadmap, spec, handbook, templates, example and agent skill written; repo not created.
**Status 2026-11-16:** D2 and D4 done; D3 written, awaiting a first run on GitHub; D5 committed, GitHub rendering unchecked; D1 and D3 (GitHub home) are decided by the founder; the repo stays private under `alkomy` until it is ready to open. Work is on stacked local branches 0.0.1-D1 to D4, unmerged.
**Status 2026-11-16:** PRs #1 and #5 squash-merged into `main` (CI green on 6 legs). D2, D3, D4 done. Open: D1 (branch protection, private vulnerability reporting and squash-only wait on D14, repo visibility) and D5 (GitHub rendering check). The npm name is not yet claimed (needs `npm login`).
**Status 2026-11-16:** `main` is protected and the CI workflow now has a quality report job and a `CI result` gate (format, lint, typecheck, coverage, audit, build, summarised in the run summary). Only private vulnerability reporting is left of D1, waiting on D14.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.0.1-D1 | **Repository**: create the GitHub repo per D3, add LICENSE (D2), README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT (Contributor Covenant 2.1); enable private vulnerability reporting, branch protection on `main` (PR + green CI required), squash-merge only | doing | spec 08 §5. Files, CODE_OF_CONDUCT and the org name are done. On 2026-11-16 `main` got classic branch protection (PR required, status check `CI result`, up to date, linear history, no force-push or deletion, applies to admins) and squash-only merges; auto-merge is off and branches are deleted on merge. Private vulnerability reporting is not available on this private repo (API returns 404); turn it on when the repo opens (D14) |
| 0.0.1-D2 | **Toolchain**: `package.json` (`type: module`, `engines.node >=20.11`, `packageManager: pnpm@10`), TypeScript 5 `strict` + `noUncheckedIndexedAccess`, ESLint flat config + typescript-eslint, Prettier, Vitest, esbuild (D7); scripts `build`, `test`, `lint`, `typecheck`, `format` | done | spec 01 §5. 81f6300 (#5); typecheck, lint, test, build pass locally on Linux/Node 22 |
| 0.0.1-D3 | **CI**: `.github/workflows/ci.yml`, matrix {ubuntu, macos, windows} × Node {20, 22}; jobs typecheck, lint, test, build; `permissions: contents: read`; third-party actions pinned by commit SHA; Dependabot for actions and dev deps | done | spec 08 §4. 81f6300 (#5); ran green on ubuntu, macOS and Windows on Node 20 and 22 for PR #5 |
| 0.0.1-D4 | **Skeleton**: the `src/core`, `src/node`, `src/render`, `src/cli` folders per spec 01 §3, each with an `index.ts` and one passing test; ESLint `no-restricted-imports` forbids `node:*` in `src/core` and `innerHTML` patterns in `src/render/client` | done | spec 01 §3, AGENTS §4. 81f6300 (#5); both lint rules checked with a deliberately bad file |
| 0.0.1-D5 | **Seed commit**: commit `docs/`, `templates/`, `examples/`, `skills/`, `opmap.config.json`, `CHANGELOG.md`; check every doc renders on GitHub (tables, links) | review | Committed in c9fe7d9; rendering on GitHub not yet checked (repo is private; check in the web UI) |

### v0.1.0 — Core parser, build and check

**Window:** 2026-11-24 → 2026-12-13
**Milestone:** M1
**Goal:** `npx openprojectmap build` turns the three docs into one HTML map, and `check` lists every format problem with file:line and a fix hint.
**Exit:** On a clean clone, `npx openprojectmap@0.1.0 check` exits 0 on `examples/tidepool` and on this repo; `build` finishes in under 1 s for the 1,000-deliverable stress fixture; `src/core` line coverage is 95% or higher.
**Status 2026-11-16:** planned.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.1.0-D1 | **Block scanner** (`core/scan.ts`): line-based scan into headings, fields (`**Key:** value`), GFM pipe tables (escaped `\|`, pipes inside backticks), paragraphs; fenced code and HTML comments skipped; CRLF and BOM normalised; every node carries `{line, column}` | todo | spec 02 §2, spec 01 §4 |
| 0.1.0-D2 | **Dates** (`core/dates.ts`): ISO day, month, quarter and year points; ranges with `→`, `->`, `..`, ` – `, ` to `; trailing note kept; `start <= end` enforced; leap years and quarter ends tested; property tests with fast-check | todo | spec 02 §6, D4 |
| 0.1.0-D3 | **Roadmap parser** (`core/parse-roadmap.ts`): format marker, Now block (known keys + free facts), phases, version blocks (heading grammar, Window/Goal/Exit/Milestone/State fields, status lines), deliverable tables mapped by header name, milestones, Parked | todo | spec 02 §3 |
| 0.1.0-D4 | **Status vocabulary** (`core/status.ts`): 6 statuses + aliases, optional date and reference in the cell (`done 2026-12-01 (#14)`) | todo | spec 02 §4, D8 |
| 0.1.0-D5 | **Decisions and changelog parsers**: decisions table + risks table (`core/parse-decisions.ts`); Keep a Changelog 1.1 headings incl. `[Unreleased]` and the common variants (`core/parse-changelog.ts`) | todo | spec 02 §7–8, D6 |
| 0.1.0-D6 | **Derivations** (`core/derive.ts`): version state, progress (parked excluded), current/next version, overall progress, Needs-your-call list (open decisions by Needed by; overdue → "proceeding with default"), staleness, timeline bounds | todo | spec 03 §3 |
| 0.1.0-D7 | **Validator and diagnostic catalogue** (`core/validate.ts`, `core/codes.ts`): every OPM code in spec 02 §9, each with message, hint and a fixture | todo | spec 02 §9 |
| 0.1.0-D8 | **Config loader** (`node/config.ts`): find `opmap.config.json` from cwd up to the git root; hand-written validation with precise errors; defaults; paths resolved relative to the config and contained in the repo root after `realpath` | todo | spec 04 §3, spec 07 §3 |
| 0.1.0-D9 | **Git enrichment** (`node/git.ts`): `execFile('git', …)` only; ref validation; branch heads, last commit, N-week activity, areas by prefix; soft-fail outside a repo or on a shallow clone (info diagnostic); `--fetch`, `--no-git` | todo | spec 06 §1 |
| 0.1.0-D10 | **CLI `build` and `check`** (`cli/`): `node:util.parseArgs`; text, json and github output formats; exit codes 0/1/2/3; `--strict`; `--now` / `OPMAP_NOW` for reproducible output | todo | spec 04 §2, §4 |
| 0.1.0-D11 | **Minimal renderer**: Overview, Versions and Decisions views, built with the safe DOM helper (no `innerHTML`, so v0.2 is not a rewrite); data embedded as escaped JSON; `<noscript>` summary | todo | spec 05 §1–2 |
| 0.1.0-D12 | **Fixtures and snapshots**: `test/fixtures/**` incl. one per diagnostic, tidepool and a generated 1,000-deliverable stress fixture; JSON snapshots of ProjectData | todo | spec 08 §2 |
| 0.1.0-D13 | **Dogfood and publish**: CI runs `check --strict` on this repo's docs; npm trusted publishing with provenance (D12); `0.1.0` tagged and released | todo | spec 08 §5 |
| 0.1.0-D14 | **Map prototype as reference**: the `.project-map/` parser, template and build script (written 2026-11-16, gitignored) move to `prototype/project-map/` as the reference for D3, D10 and D11; deleted when D11 ships | todo | Excluded from lint and format checks |

## Phase 2 — Public alpha

### v0.2.0 — Safe renderer and views

**Window:** 2026-12-14 → 2027-01-03
**Goal:** A map that is pleasant on a phone and a laptop, readable in light and dark, accessible, and impossible to script-inject.
**Exit:** axe-core reports 0 serious or critical violations on every view; the XSS corpus renders inert in every field; template + client are 60 KB gzipped or less; there is no horizontal scroll at 360 px.
**Status 2026-11-16:** planned.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.2.0-D1 | **DOM helper `h()`**: an allow-listed attribute set (no `on*`, no `style`, `href` only via `safeHref`); a lint rule bans the HTML-string sinks in `src/render/client` | todo | spec 05 §2, spec 07 §2 |
| 0.2.0-D2 | **Inline rich text `rich()`**: tokenizer for bold, italic, code, links and autolinks producing DOM nodes; anything else stays literal text | todo | spec 05 §3 |
| 0.2.0-D3 | **CSP by hash**: build-time SHA-256 of the inline script and style; meta CSP `default-src 'none'`; the accent colour validated as `#rrggbb` | todo | spec 05 §6, spec 07 §2 |
| 0.2.0-D4 | **Views and router**: Overview, Timeline, Versions, Decisions & Risks, History, Parked; hash routes (`#/versions/v0.2.0?status=doing`) | todo | spec 05 §4 |
| 0.2.0-D5 | **Timeline**: hand-written SVG Gantt; phase groups, version bars with a progress fill, milestone diamonds, today line, month/quarter zoom, an "Unscheduled" list | todo | spec 05 §4.2 |
| 0.2.0-D6 | **Filters and search**: status chips, text search over IDs, titles and notes; state kept in the URL | todo | spec 05 §4.3 |
| 0.2.0-D7 | **Theming**: CSS custom-property tokens, light/dark auto + toggle (localStorage with try/catch), config accent, compact density; system font stack, no web fonts | todo | spec 05 §5 |
| 0.2.0-D8 | **Accessibility**: WCAG 2.2 AA; ARIA tabs pattern, keyboard navigation, visible focus, `prefers-reduced-motion`; Playwright + axe-core in CI | todo | spec 05 §7 |
| 0.2.0-D9 | **Responsive and print**: works at 360 px without horizontal scroll; tables reflow to cards; print stylesheet | todo | spec 05 §5 |
| 0.2.0-D10 | **Size budget**: CI fails if the gzipped template + client exceeds 60 KB | todo | spec 08 §4 |
| 0.2.0-D11 | **Visual regression**: Playwright screenshots of tidepool in light, dark and mobile | todo | spec 08 §2 |

### v0.3.0 — Onboarding: init, templates, handbook, agent skill

**Window:** 2027-01-04 → 2027-01-17
**Milestone:** M2
**Goal:** Someone who has never planned a project goes from nothing to a published map in 30 minutes, alone or with their AI agent.
**Exit:** In 3 moderated tests with people new to roadmaps, each reaches a built map with zero warnings in 30 minutes or less; the agent skill completes "interview me and write my roadmap" in Claude Code and one other agent.
**Status 2026-11-16:** planned.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.3.0-D1 | **`init`**: prompts via `node:readline/promises` (name, one-sentence goal, launch target, first version); flags for non-interactive runs (`--yes`, `--name`, `--dir`); never overwrites a file (`--force` only with confirmation); keeps an existing `CHANGELOG.md` | todo | spec 04 §2.1 |
| 0.3.0-D2 | **Templates final**: `templates/` with guidance as HTML comments, which are invisible on GitHub and ignored by the parser; `init --example` writes tidepool | todo | |
| 0.3.0-D3 | **Founder Handbook final**: `docs/guide/` reviewed by 3 non-technical founders; plain-language pass | todo | |
| 0.3.0-D4 | **Agent integration**: `skills/openprojectmap/SKILL.md`, the AGENTS.md snippet, a Cursor rule; `init --agents claude,cursor,codex` installs them | todo | spec 06 §5 |
| 0.3.0-D5 | **`doctor`**: checks the Node version, git, config, doc paths and format marker; prints a fix for each problem | todo | spec 04 §2 |
| 0.3.0-D6 | **Demo and README**: the tidepool map published on GitHub Pages, a screenshot/GIF in the README | todo | |
| 0.3.0-D7 | **Launch**: issue and PR templates, `good first issue` labels on 10 or more roadmap rows, announcement posts (Show HN, r/SideProject, X) | todo | |

## Phase 3 — Daily driver

### v0.4.0 — Live preview, authoring commands, JSON export

**Window:** 2027-01-18 → 2027-02-07
**Goal:** An agent or a person can update the roadmap through precise commands, preview the map live, and feed the data to other tools.
**Exit:** In the tidepool repo, a full session close-out done only with CLI commands leaves the file byte-identical outside the edited cells, with zero warnings.
**Status 2026-11-16:** planned.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.4.0-D1 | **`serve`**: `node:http` on 127.0.0.1:4173; `fs.watch` with a 150 ms debounce; SSE live reload; serves only the output dir, `/healthz` and `/events`; GET/HEAD only; security headers | todo | spec 04 §2, spec 07 §4 |
| 0.4.0-D2 | **Source-preserving editor** (`node/editor.ts`): patches a table cell, field line or appended line by source position; round-trip tests (parse → edit → parse) and a byte-identity check outside the edit | todo | spec 04 §5 |
| 0.4.0-D3 | **Authoring commands**: `set-status`, `add`, `new-version`, `log`, `now`, `decide`; all support `--dry-run` (prints a unified diff) | todo | spec 04 §2 |
| 0.4.0-D4 | **`export --json` + JSON Schemas**: `schema/project-data.v1.json` and `schema/config.v1.json`, generated from the TS types and checked in CI | todo | spec 03 §4 |
| 0.4.0-D5 | **"Open docs…" in the page**: drag-and-drop or a file picker re-parses markdown in the browser with the embedded core; nothing is uploaded | todo | spec 05 §4.7 |
| 0.4.0-D6 | **Staleness banner**: shows when `Now.Updated` is older than `staleAfterDays` or when there are 10 or more commits since that date | todo | spec 03 §3 |

### v0.5.0 — Share and self-host

**Window:** 2027-02-08 → 2027-03-07
**Milestone:** M3
**Goal:** Publish a map on every push, review roadmap changes in PRs, and run one self-hosted page for all your projects.
**Exit:** One `docker compose up` serves maps for 3 repos behind TLS and auth, refreshing within 5 minutes of a push; the Action deploys tidepool to Pages and annotates a PR.
**Status 2026-11-16:** planned.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.5.0-D1 | **GitHub Action** (`action.yml`, composite): installs a pinned package version and builds; inputs passed through `env:`, never interpolated into shell; Pages deploy recipe | todo | spec 06 §2, spec 07 §5 |
| 0.5.0-D2 | **PR checks**: `check --format github` annotations; optional sticky PR comment summarising status changes between base and head ProjectData (`diff` command) | todo | spec 06 §2.3 |
| 0.5.0-D3 | **Hub**: `hub` command + `opmap.hub.json`; an index with one card per project (current version, progress, next step, Needs-your-call count, staleness) linking to each map | todo | spec 06 §3 |
| 0.5.0-D4 | **Docker image** `ghcr.io/openprojectmap/openprojectmap`: `node:22-alpine` + git, non-root, `serve --hub` with a periodic fetch of read-only clones, healthcheck; multi-arch amd64/arm64; signed with cosign | todo | spec 06 §4 |
| 0.5.0-D5 | **Self-host guide**: docker compose + Caddy (TLS, basic auth or forward-auth), notes for a VPS or Coder workspace, private repos via read-only deploy keys | todo | spec 06 §4 |
| 0.5.0-D6 | **Other CI and hosts**: GitLab CI template; Netlify, Cloudflare Pages and Vercel static recipes | todo | |

## Phase 4 — Ecosystem, editor and desktop

### v0.6.0 — Tracks, MCP server, importers

**Window:** 2027-03-08 → 2027-04-11
**Goal:** Plan more than code (business, marketing), and let agents drive the map through MCP.
**Exit:** Claude Code completes a full session close-out using only the MCP tools; a two-track project (product + business) renders both tracks.
**Status 2026-11-16:** planned.
**Status 2026-11-16:** 0.6.0-D5 (feature intake) added in the editor and desktop re-plan.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.6.0-D1 | **Tracks**: extra roadmap files with their own ID pattern (e.g. `BM0-S1`), one tab per track, a combined timeline; config `tracks[]` | todo | spec 02 §10 |
| 0.6.0-D2 | **MCP server**: separate package `@openprojectmap/mcp` (keeps the core zero-dependency); stdio; tools `now`, `list`, `get`, `check`, `set_status`, `log`, `decide`; writes go through the 0.4.0-D2 editor; `--read-only` | todo | spec 06 §6 |
| 0.6.0-D3 | **Importers**: `import github` (milestones and issues via `gh api`) and `import csv`; always writes a draft file for review, never edits the roadmap directly | todo | spec 04 §2 |
| 0.6.0-D4 | **i18n**: UI strings in a catalogue, English first, contributor-driven languages; RTL layout (`dir="rtl"`) | todo | spec 05 §8 |
| 0.6.0-D5 | **Feature intake**: MCP tool `propose` returns, for a plain-language idea, the candidate versions (by goal and deliverables), related rows, open decisions and Parked items, so the agent can place it without conflicts; `opmap propose --check <row>` validates a drafted row (ID free, version not shipped, no duplicate of a Parked item). Drafts go to `docs/project/proposals/`; it never edits the roadmap. No LLM in the tool: the agent does the reasoning | todo | spec 06 §6 |

### v0.7.0 — VS Code extension

**Window:** 2027-04-12 → 2027-05-09
**Goal:** A developer sees the map, the format problems and the next step without leaving VS Code, and edits statuses through commands instead of by hand.
**Exit:** In the tidepool repo, a full session close-out done only from VS Code leaves zero warnings; the extension installs from the Marketplace and Open VSX on Windows, macOS and Linux.
**Status 2026-11-16:** planned. Moved out of Parked in the editor and desktop re-plan.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.7.0-D1 | **Extension package** `@openprojectmap/vscode` (separate package, D17): activates when `opmap.config.json` exists; bundles the core; no network requests | todo | D17 |
| 0.7.0-D2 | **Map panel**: webview showing the v0.2 renderer under its CSP; refreshes on save | todo | spec 05 |
| 0.7.0-D3 | **Diagnostics**: `check` results in the Problems panel with file, line and the fix hint | todo | spec 02 §9 |
| 0.7.0-D4 | **Commands**: set status, add deliverable, add status line, record a decision, all through the 0.4.0-D2 editor with a diff preview | todo | spec 04 §5 |
| 0.7.0-D5 | **Agent bridge**: registers the MCP server (0.6.0-D2) so agents in VS Code use the same tools | todo | spec 06 §6 |

### v0.8.0 — Desktop app

**Window:** 2027-05-10 → 2027-06-27
**Milestone:** M4
**Goal:** Someone who never opens a terminal opens their project folder and sees a live, correct map, and keeps it current with buttons instead of markdown edits.
**Exit:** In 3 moderated tests with people who don't use a terminal, each installs the signed app on their OS, opens or creates a project and reaches a map with zero warnings in 10 minutes or less; updating from v0.8.0 to a test v0.8.1 works on Windows, macOS and Linux.
**Status 2026-11-16:** planned. Moved out of Parked in the editor and desktop re-plan.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.8.0-D1 | **App shell** per D15 (default Tauri with the Node core as a sidecar); separate package `@openprojectmap/desktop` (D17); no telemetry | todo | D15, D17 |
| 0.8.0-D2 | **Open a project**: folder picker, recent projects, finds `opmap.config.json`; the same path containment rules as the CLI | todo | spec 07 §3 |
| 0.8.0-D3 | **Guided setup**: the `init` interview as a form for a folder with no docs; templates and the tidepool example | todo | 0.3.0-D1 |
| 0.8.0-D4 | **Live map**: watches the docs, re-renders, lists diagnostics with an "Open in editor" button | todo | 0.4.0-D1 |
| 0.8.0-D5 | **Simple editing**: change a status, add a deliverable, add a status line, record a decision, through the 0.4.0-D2 editor with a preview of the change | todo | spec 04 §5 |
| 0.8.0-D6 | **Git panel**: branch, last commit, uncommitted doc changes; commit the docs with one button; git only through `execFile` | todo | spec 06 §1 |
| 0.8.0-D7 | **Signed builds and updates**: Windows (signed installer), macOS (notarised, universal), Linux (AppImage and .deb); update behaviour per D18; built in CI | todo | D16, D18 |

### v1.0.0 — Stable format

**Window:** 2027-Q3
**Milestone:** M5
**Goal:** Format v1, config v1, JSON schema v1 and the CLI flags are frozen with a semver promise.
**Exit:** The conformance suite is published; 25 or more public repos use OpenProjectMap; no open high-severity security issue.
**Status 2026-11-16:** planned.
**Status 2026-11-16:** window moved from 2027-Q2 to 2027-Q3 and milestone renamed M4 → M5, because v0.7.0 and v0.8.0 now come first. The desktop app and VS Code extension are part of the stable surface.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 1.0.0-D1 | **Conformance suite** `conformance/`: markdown inputs → expected JSON, usable by other implementations | todo | spec 02 §11 |
| 1.0.0-D2 | **Docs site** per D9, including the handbook and spec | todo | |
| 1.0.0-D3 | **Hardening**: parser fuzzing (fast-check, 1M cases in nightly CI), an external or checklist security review, a dependency and provenance audit | todo | spec 07 |
| 1.0.0-D4 | **Stability policy and migration guide** from 0.x | todo | spec 08 §5 |

## Milestones

| ID | Milestone | Reached when | Reached on |
| --- | --- | --- | --- |
| M1 | Works on one repo | v0.1.0 is on npm; tidepool and this repo pass `check --strict` | |
| M2 | Public alpha | v0.3.0 shipped; 3 new-to-roadmaps users reached a map in 30 minutes or less; announced | |
| M3 | Team ready | v0.5.0 shipped; the Action, hub and Docker self-host are used by 3 or more external repos | |
| M4 | Desktop ready | v0.8.0 shipped; signed builds for Windows, macOS and Linux; 3 people who don't use a terminal reached a map in 10 minutes or less | |
| M5 | Stable | v1.0.0 shipped; the format is frozen; 25 or more public repos use it | |

## Parked

| Item | Why | Revisit when |
| --- | --- | --- |
| Hosted SaaS (accounts, cloud storage) | It would hold other people's private roadmaps: accounts, storage and security work forever, for a static file | Desktop and self-host users ask for it after v0.8.0, and there is a maintainer team |
| Real-time collaborative editing | Git is the collaboration model | Not planned |
| Two-way Jira / Linear sync | A large surface with conflict resolution; one-way import is enough | After M5 |
| Sprint boards, burndown, story points | Team ceremony; solo founders need versions and milestones | Teams adopt it after M3 |
| Task dependencies / critical path | Windows and milestones are enough for the target users | After M5 |
| English date ranges ("Nov 3 – 14") | Ambiguous across locales and years; ISO only in format v1 (D4) | Format v2 |
