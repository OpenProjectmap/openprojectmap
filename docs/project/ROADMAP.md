<!-- opmap: 1 -->
# OpenProjectMap: Roadmap

This file is the source of truth for what gets built and when. It is written in the
OpenProjectMap doc format v1 ([spec](../spec/02-doc-format.md)), so the tool renders its own map.
Rules: if it isn't here, it isn't in scope; new ideas go into a later version or into **Parked**;
the newest status line in a version goes last; windows live only on the version blocks.

## Now

**Updated:** 2026-11-18
**Current version:** v0.3.0
**Next step:** "Open docs…" in the page (0.4.0-D5), the last v0.4.0 deliverable. v0.3.0 is waiting on the founder for the handbook review (0.3.0-D3) and the repo going public (D14) for the live demo (0.3.0-D6) and the launch (0.3.0-D7). The founder: merge the v0.2.0 release PR, publish to npm after 2026-11-20 16:54 UTC and link the trusted publisher, look at the docs on github.com (0.0.1-D5).
**Why:** v0.1.0 and v0.2.0 are complete on `beta`: parser, CLI, the full map with six views, accessibility, print and screenshot checks. Onboarding (`init`, templates, agent skill) is what stands between the tool and the first outside user.
**Target:** Public alpha (M2) by 2027-01-17
**Live:** v0.2.0 (with v0.1.0) is on `beta`, not on npm yet. The npm publish of 0.0.1 (placeholder) failed on 2026-11-17 with 403: npm suspended the account for 72 hours because a recovery code was used to log in; it returns to normal on 2026-11-20 at 16:54 UTC

## Phase 1 — Foundations

### v0.0.1 — Seed

**Window:** 2026-11-17 → 2026-11-23
**Goal:** A repo with toolchain, CI and these planning docs, ready for parser work.
**Exit:** `pnpm install && pnpm test && pnpm lint && pnpm typecheck` pass on Linux, macOS and Windows in CI on Node 20 and 22; the repo has licence, README, SECURITY and CONTRIBUTING (it opens to the public at the v0.3.0 launch, D14).
**Status 2026-11-16:** planned. Roadmap, spec, handbook, templates, example and agent skill written; repo not created.
**Status 2026-11-16:** D2 and D4 done; D3 written, awaiting a first run on GitHub; D5 committed, GitHub rendering unchecked; D1 and D3 (GitHub home) are decided by the founder; the repo stays private under `alkomy` until it is ready to open. Work is on stacked local branches 0.0.1-D1 to D4, unmerged.
**Status 2026-11-16:** PRs #1 and #5 squash-merged into `main` (CI green on 6 legs). D2, D3, D4 done. Open: D1 (branch protection, private vulnerability reporting and squash-only wait on D14, repo visibility) and D5 (GitHub rendering check). The npm name is not yet claimed (needs `npm login`).
**Status 2026-11-16:** `main` is protected and the CI workflow now has a quality report job and a `CI result` gate (format, lint, typecheck, coverage, audit, build, summarised in the run summary). Only private vulnerability reporting is left of D1, waiting on D14.
**Status 2026-11-16:** the founder set a two-branch model (D19, 0.0.1-D6): work branches go into `beta` for testing; `main` only gets a release PR from `beta` when a version is complete.
**Status 2026-11-17:** the founder approved every default and answered D11 (`openprojectmap.dev` registered), D14 (stay private) and D16 (certificates bought in January 2027). D1, D6 and D7 are done. Left of v0.0.1: the GitHub rendering check (D5) and the npm publish (D8, blocked by the account suspension), then the release PR from `beta` to `main`.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.0.1-D1 | **Repository**: create the GitHub repo per D3, add LICENSE (D2), README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT (Contributor Covenant 2.1); enable private vulnerability reporting, branch protection on `main` (PR + green CI required), squash-merge only | done | spec 08 §5. Files, CODE_OF_CONDUCT and the org name are done. On 2026-11-16 `main` got classic branch protection (PR required, status check `CI result`, up to date, linear history, no force-push or deletion, applies to admins) and squash-only merges; auto-merge is off and branches are deleted on merge. Private vulnerability reporting is not available on this private repo (API returns 404); turn it on when the repo opens (D14). Private vulnerability reporting moves to 0.3.0-D7 (needs a public repo, D14 stays private). Branch protection: PRs #6 to #14 |
| 0.0.1-D2 | **Toolchain**: `package.json` (`type: module`, `engines.node >=20.11`, `packageManager: pnpm@10`), TypeScript 5 `strict` + `noUncheckedIndexedAccess`, ESLint flat config + typescript-eslint, Prettier, Vitest, esbuild (D7); scripts `build`, `test`, `lint`, `typecheck`, `format` | done | spec 01 §5. 81f6300 (#5); typecheck, lint, test, build pass locally on Linux/Node 22 |
| 0.0.1-D3 | **CI**: `.github/workflows/ci.yml`, matrix {ubuntu, macos, windows} × Node {20, 22}; jobs typecheck, lint, test, build; `permissions: contents: read`; third-party actions pinned by commit SHA; Dependabot for actions and dev deps | done | spec 08 §4. 81f6300 (#5); ran green on ubuntu, macOS and Windows on Node 20 and 22 for PR #5 |
| 0.0.1-D4 | **Skeleton**: the `src/core`, `src/node`, `src/render`, `src/cli` folders per spec 01 §3, each with an `index.ts` and one passing test; ESLint `no-restricted-imports` forbids `node:*` in `src/core` and `innerHTML` patterns in `src/render/client` | done | spec 01 §3, AGENTS §4. 81f6300 (#5); both lint rules checked with a deliberately bad file |
| 0.0.1-D5 | **Seed commit**: commit `docs/`, `templates/`, `examples/`, `skills/`, `opmap.config.json`, `CHANGELOG.md`; check every doc renders on GitHub (tables, links) | review | Committed in c9fe7d9; rendering on GitHub not yet checked (repo is private; check in the web UI) |
| 0.0.1-D6 | **Branch model**: `beta` (preview) and `main` (production), both protected; task PRs squash into `beta`, a release PR from `beta` to `main` per completed version (D19); CI runs on both and a `branch flow` check rejects other PRs to `main`; Dependabot targets `beta` | done | AGENTS.md §6, spec 08 §5. GitHub settings (create and protect `beta`, enable merge commits, drop linear history on `main`) are applied alongside the PR. PR #14 |
| 0.0.1-D7 | **Cheap sub-agents**: AGENTS.md §9 and CLAUDE.md say small tasks (docs updates, search, easy edits) go to Claude Haiku 5.5 sub-agents to cut cost | done | Founder request, 2026-11-16. PR #15 |
| 0.0.1-D8 | **Decisions recorded and npm name claimed**: D4 to D18 recorded in DECISIONS.md; AGENTS.md §4 allows the user-clicked update check (D18); `openprojectmap` 0.0.1 published to npm as a placeholder | doing | Founder approved all defaults on 2026-11-17. Decisions are recorded; the publish is blocked until 2026-11-20 16:54 UTC, then run `npm login --auth-type=web` (passkey) and publish |
| 0.0.1-D9 | **Audit gate on what ships**: the CI quality report fails on high advisories in runtime dependencies only (there are none, D5); dev-tooling advisories show in the run summary but do not fail the build | doing | Founder chose this on 2026-11-17. A picomatch ReDoS advisory (GHSA-fc5q-39xc-vjpf, no patched version, dev only via typescript-eslint) failed the gate |
| 0.0.1-D10 | **CI cost cut**: the full OS and Node matrix runs only on release PRs (to `main`) and pushes to `main`; task PRs and pushes to `beta` run one ubuntu, Node 22 leg | doing | Founder approved on 2026-11-17 after GitHub Actions stopped starting jobs (minutes or spending limit; macOS counts 10x, Windows 2x) |
| 0.0.1-D11 | **Self-hosted runner for the light CI jobs**: `plan`, `branch flow`, `quality report`, `CI result` and the single test leg run on the founder's self-hosted runner (`[self-hosted, Linux, X64]`); the full matrix for release PRs stays on GitHub-hosted runners. Node is set up before pnpm because the runner image's Node is v10 | done | PR #28. Tested 2026-11-17: all five jobs pass. Revisit before the repo goes public (D14 note) |
| 0.0.1-D12 | **Release matrix on the self-hosted runner**: what blocks a release PR is Linux, Node 20 and 22, on the self-hosted runner; macOS and Windows run as an advisory hosted job (`cross-os`) that cannot block a release | done | Founder chose this on 2026-11-17 because GitHub-hosted runners were blocked (billing or minutes). The advisory job shows red until the hosted minutes work again; see the advice in PR #39 |
| 0.0.1-D13 | **Tests run on Node 20 and 22**: jsdom is pinned to the 29 line because jsdom 30 and 31 need Node 22.22 or newer (through undici 8), which broke every jsdom test on Node 20 | done | Found on 2026-11-17 by the release PR's first Node 20 run on the self-hosted runner. Package `engines` stays `>=20.11` for users; jsdom is a dev dependency |
| 0.0.1-D14 | **Quality job prints its failures**: a failed check now also writes its last 60 log lines and an error annotation to the job log, not only the run summary | done | Added on 2026-11-17 after the release PR's quality job failed with no readable reason |
| 0.0.1-D15 | **Test timeout 30 s**: vitest's default 5 s made the axe-core and jsdom tests fail under coverage on a busy runner | done | Found on 2026-11-18 thanks to the failure output added in 0.0.1-D14 |

### v0.1.0 — Core parser, build and check

**Window:** 2026-11-24 → 2026-12-13
**Milestone:** M1
**Goal:** `npx openprojectmap build` turns the three docs into one HTML map, and `check` lists every format problem with file:line and a fix hint.
**Exit:** On a clean clone, `npx openprojectmap@0.1.0 check` exits 0 on `examples/tidepool` and on this repo; `build` finishes in under 1 s for the 1,000-deliverable stress fixture; `src/core` line coverage is 95% or higher.
**Status 2026-11-16:** planned.
**Status 2026-11-17:** D1 (block scanner) done in PR #17; D2 (dates) in PR #19; D4 (status vocabulary) in PR #20, ahead of D3 which depends on it; D3 (roadmap parser) in PR #21; D5 (decisions and changelog parsers) in PR #22; D6 (derivations) in PR #23; D7 (validator and catalogue) in PR #24; D8 (config loader) in PR #25; D9 (git enrichment) in PR #26; D11 (minimal renderer) in PR #27, ahead of D10 because `build` needs it; D10 (CLI build and check) in PR #28; D12 (fixtures and snapshots) in PR #30; D14 parked (superseded); D13 in progress in PR #31.
**Status 2026-11-17:** all 14 deliverables are done or parked (D14 superseded). `check --strict` passes on this repo and on Tidepool; `build` of the 1,000-deliverable fixture takes well under 1 s; `src/core` line coverage is above 95%. Release PR from `beta` to `main` opened (PR #34). Work on v0.2.0 continued on `beta` while it waited, so the release also carries the Timeline, History, Parked and accessibility work, which the changelog now lists. Left for the founder: the first `npm publish` and the trusted-publisher link (npm account suspended until 2026-11-20 16:54 UTC), so the `npx openprojectmap@0.1.0 check` part of the exit is checked after publishing.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.1.0-D1 | **Block scanner** (`core/scan.ts`): line-based scan into headings, fields (`**Key:** value`), GFM pipe tables (escaped `\|`, pipes inside backticks), paragraphs; fenced code and HTML comments skipped; CRLF and BOM normalised; every node carries `{line, column}` | done | spec 02 §2, spec 01 §4. PR #17: `core/scan.ts`, 99% line coverage |
| 0.1.0-D2 | **Dates** (`core/dates.ts`): ISO day, month, quarter and year points; ranges with `→`, `->`, `..`, ` – `, ` to `; trailing note kept; `start <= end` enforced; leap years and quarter ends tested; property tests with fast-check | done | spec 02 §6, D4. PR #19: `core/dates.ts`, 100% line coverage; fast-check property tests (day-number round trip, month ends, window order) |
| 0.1.0-D3 | **Roadmap parser** (`core/parse-roadmap.ts`): format marker, Now block (known keys + free facts), phases, version blocks (heading grammar, Window/Goal/Exit/Milestone/State fields, status lines), deliverable tables mapped by header name, milestones, Parked | done | spec 02 §3. PR #21: `core/parse-roadmap.ts` (also `core/diagnostics.ts`, `core/progress.ts`); parses this repo's roadmap and tidepool with no warnings |
| 0.1.0-D4 | **Status vocabulary** (`core/status.ts`): 6 statuses + aliases, optional date and reference in the cell (`done 2026-12-01 (#14)`) | done | spec 02 §4, D8. PR #20: `core/status.ts`, plus `core/types.ts` (the ProjectData v1 types and `Diagnostic`). Done before D3 because the roadmap parser needs it |
| 0.1.0-D5 | **Decisions and changelog parsers**: decisions table + risks table (`core/parse-decisions.ts`); Keep a Changelog 1.1 headings incl. `[Unreleased]` and the common variants (`core/parse-changelog.ts`) | done | spec 02 §7–8, D6. PR #22: `core/parse-decisions.ts`, `core/parse-changelog.ts`. New code OPM-W505 (unknown decision status) added to spec 02 §9. The scanner now keeps each paragraph line so list items can be split |
| 0.1.0-D6 | **Derivations** (`core/derive.ts`): version state, progress (parked excluded), current/next version, overall progress, Needs-your-call list (open decisions by Needed by; overdue → "proceeding with default"), staleness, timeline bounds | done | spec 03 §3, spec 02 §5. PR #23: `core/derive.ts`. The cross-file checks that use it (OPM-W104, W204, I601, I602) belong to the validator, D7 |
| 0.1.0-D7 | **Validator and diagnostic catalogue** (`core/validate.ts`, `core/codes.ts`): every OPM code in spec 02 §9, each with message, hint and a fixture | done | spec 02 §9. PR #24: `core/codes.ts` (catalogue, checked against the spec table by a test), `core/validate.ts` (W104, W204, W305, I601, I602), `core/errors.ts`, and `parseProject()` in `core/index.ts` that ties the parsers together. 34 fixtures under `test/fixtures/diagnostics/`; the four codes raised outside the core (E003, I801, I802, W803) get theirs in D8 and D9 |
| 0.1.0-D8 | **Config loader** (`node/config.ts`): find `opmap.config.json` from cwd up to the git root; hand-written validation with precise errors; defaults; paths resolved relative to the config and contained in the repo root after `realpath` | done | spec 04 §3, spec 07 §3. PR #25: `node/config.ts`. Unknown keys are errors; paths are `realpath`-ed and checked against the repo root (a symlink pointing out is rejected); OPM-E003 fixture added |
| 0.1.0-D9 | **Git enrichment** (`node/git.ts`): `execFile('git', …)` only; ref validation; branch heads, last commit, N-week activity, areas by prefix; soft-fail outside a repo or on a shallow clone (info diagnostic); `--fetch`, `--no-git` | done | spec 06 §1. PR #26: `node/git.ts` (`git()`, `gatherGit()`); fixtures for OPM-I801, I802 and W803; `--fetch` and `--no-git` are wired in D10 with the CLI |
| 0.1.0-D10 | **CLI `build` and `check`** (`cli/`): `node:util.parseArgs`; text, json and github output formats; exit codes 0/1/2/3; `--strict`; `--now` / `OPMAP_NOW` for reproducible output | done | spec 04 §1–4. PR #28: `cli/index.ts` (parseArgs, `build`, `check`), `cli/output.ts` (text, json, github), `cli/open.ts`, `node/sources.ts`, `node/build.ts` (also the programmatic API in `src/index.ts`). Exit codes 0/1/2/3; `--now`, `OPMAP_NOW`, `--tz`, `--no-git`, `--fetch`, `--out`, `--json`, `--open`, `--strict`, `--max-warnings`. `build` skips writing when the docs have errors |
| 0.1.0-D11 | **Minimal renderer**: Overview, Versions and Decisions views, built with the safe DOM helper (no `innerHTML`, so v0.2 is not a rewrite); data embedded as escaped JSON; `<noscript>` summary | done | spec 05 §1–2. PR #27: client (`h`, `safeHref`, `rich`, router, theme, Overview, Versions and Decisions views), `core/inline.ts`, `render/render.ts` (CSP hashes, escaped JSON, `<noscript>` summary), styles and template, `scripts/build-assets.mjs`. XSS suite in `test/xss/` classifies every string field and runs 16 payloads through every view. Done before D10 because `build` needs it |
| 0.1.0-D12 | **Fixtures and snapshots**: `test/fixtures/**` incl. one per diagnostic, tidepool and a generated 1,000-deliverable stress fixture; JSON snapshots of ProjectData | done | spec 08 §2. PR #30: `test/fixtures/projects/{minimal,full}`, Tidepool, a generated 1,000-deliverable stress fixture (`stressRoadmap()`; parse and render under 1 s), and JSON snapshots of ProjectData in `test/fixtures/snapshots/` (update with `UPDATE_FIXTURES=1`, review the diff). The per-diagnostic fixtures were added with D7 |
| 0.1.0-D13 | **Dogfood and publish**: CI runs `check --strict` on this repo's docs; npm trusted publishing with provenance (D12); `0.1.0` tagged and released | done | spec 08 §5. PRs #31 and the v0.1.0 release PR: the quality job runs `check --strict --no-git` on this repo's docs, and `.github/workflows/release.yml` publishes a `vX.Y.Z` tag on `main` to npm with provenance and creates the GitHub Release. The first `npm publish` is manual and the trusted-publisher link on npmjs.com is set up after it (both wait for the npm account to leave suspension, 2026-11-20 16:54 UTC). The release workflow skips the publish when the version is already on npm, so the first manual publish and the later tag do not clash |
| 0.1.0-D14 | **Map prototype as reference**: the `.project-map/` parser, template and build script (written 2026-11-16, gitignored) move to `prototype/project-map/` as the reference for D3, D10 and D11; deleted when D11 ships | parked | Superseded: D3, D10 and D11 shipped without moving it, and `opmap build` now makes the map. The prototype stays in the gitignored `.project-map/` where the map agent uses it, so nothing is committed |

## Phase 2 — Public alpha

### v0.2.0 — Safe renderer and views

**Window:** 2026-12-14 → 2027-01-03
**Goal:** A map that is pleasant on a phone and a laptop, readable in light and dark, accessible, and impossible to script-inject.
**Exit:** axe-core reports 0 serious or critical violations on every view; the XSS corpus renders inert in every field; template + client are 60 KB gzipped or less; there is no horizontal scroll at 360 px.
**Status 2026-11-16:** planned.
**Status 2026-11-17:** v0.1.0's renderer already covers D1 to D3, D6 and most of D4 and D7. History and Parked views and compact density added in PR #35. Timeline done in PR #36; accessibility checks in jsdom in PR #37 (the real-browser axe run is still to verify). Left: D8 verification, responsive and print polish (D9), size budget (D10), visual regression (D11).
**Status 2026-11-18:** all eleven deliverables are done (PR #43 closes D8, D9 and D11). The browser libraries were installed on the dev machine, which let real-browser axe (colour contrast included), 360 px layout, keyboard, print and screenshot checks run: they found and fixed the timeline link names, the clipped milestone label, a vertical legend, empty card rows on phones and the tab bar overflow. Exit checked: axe 0 serious or critical on every view; the XSS corpus renders inert in every field; the template, client and styles are about 11 KB gzipped (limit 60 KB); no horizontal scroll at 360 px.
**Status 2026-11-18:** v0.1.0 was merged to `main` (PR #34, 2026-11-17) and v0.2.0 follows in its own release PR from `beta`. Neither version is tagged or on npm yet; the first publish waits for the npm account (2026-11-20 16:54 UTC) and may go straight to `0.2.0`. Milestone M1 ("works on one repo") is reached when it is on npm.
**Status 2026-11-19:** v0.2.0 is on `main` (PR #47, merge commit). Still to do by the founder: publish to npm by hand, link the trusted publisher, then tag `v0.2.0`.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.2.0-D1 | **DOM helper `h()`**: an allow-listed attribute set (no `on*`, no `style`, `href` only via `safeHref`); a lint rule bans the HTML-string sinks in `src/render/client` | done | spec 05 §2, spec 07 §2. Shipped with 0.1.0-D11 (PR #27): `h()` allow-lists tags and attributes, `style`, `title` and string handlers throw; the lint rules were in 0.0.1-D4 |
| 0.2.0-D2 | **Inline rich text `rich()`**: tokenizer for bold, italic, code, links and autolinks producing DOM nodes; anything else stays literal text | done | spec 05 §3. Shipped with 0.1.0-D11 (PR #27): `core/inline.ts` and `client/rich.ts` |
| 0.2.0-D3 | **CSP by hash**: build-time SHA-256 of the inline script and style; meta CSP `default-src 'none'`; the accent colour validated as `#rrggbb` | done | spec 05 §6, spec 07 §2. Shipped with 0.1.0-D11 (PR #27): `render.ts` hashes the inline script and style; the accent is validated by the config loader (0.1.0-D8) |
| 0.2.0-D4 | **Views and router**: Overview, Timeline, Versions, Decisions & Risks, History, Parked; hash routes (`#/versions/v0.2.0?status=doing`) | done | spec 05 §4. Overview, Timeline, Versions, Decisions (with risks), History and Parked are all in (PRs #27, #35, #36); hash routes and ARIA tabs with arrow, Home and End keys |
| 0.2.0-D5 | **Timeline**: hand-written SVG Gantt; phase groups, version bars with a progress fill, milestone diamonds, today line, month/quarter zoom, an "Unscheduled" list | done | spec 05 §4.2. PR #36: `views/timeline-layout.ts` (pure layout, unit-tested) and `views/timeline.ts`. Phase groups, bars with progress fill, state colours, dashed tentative windows, milestone diamonds, today line, month and quarter zoom in the URL, keyboard-focusable bars, an Unscheduled list and a legend. The 3x3 risk matrix of spec 05 §4.4 is not drawn yet (risks are a table) |
| 0.2.0-D6 | **Filters and search**: status chips, text search over IDs, titles and notes; state kept in the URL | done | spec 05 §4.3. Shipped with 0.1.0-D11 (PR #27): status chips and text search, kept in the URL |
| 0.2.0-D7 | **Theming**: CSS custom-property tokens, light/dark auto + toggle (localStorage with try/catch), config accent, compact density; system font stack, no web fonts | done | spec 05 §5. Tokens, light and dark auto with a toggle (try/catch around localStorage), config accent with a contrast-picked text colour, compact density (PR #35), system fonts |
| 0.2.0-D8 | **Accessibility**: WCAG 2.2 AA; ARIA tabs pattern, keyboard navigation, visible focus, `prefers-reduced-motion`; Playwright + axe-core in CI | done | spec 05 §7. PRs #37 and #43: axe-core in jsdom on every view, a WCAG contrast test of every theme token, and axe in a real browser (Playwright, `test/e2e/a11y.spec.ts`) on every view in light and dark with colour contrast: 12 of 12 pass with no serious or critical violation. The real browser found a link whose name did not contain its visible text (timeline bars). Keyboard: ARIA tabs with arrow, Home and End, Enter on a timeline bar, visible focus ring, reduced motion (`test/e2e/layout.spec.ts`) |
| 0.2.0-D9 | **Responsive and print**: works at 360 px without horizontal scroll; tables reflow to cards; print stylesheet | done | spec 05 §5. PRs #38 and #43: no horizontal page scroll at 360 px on every view (checked in a real browser), tables become labelled cards on phones (empty cells hidden), the tab bar wraps, and printing shows every view in sequence (hides tabs and the on-screen copy; checked in a real browser) |
| 0.2.0-D10 | **Size budget**: CI fails if the gzipped template + client exceeds 60 KB | done | spec 08 §4. PR #38: `test/unit/size-budget.test.ts` fails when the gzipped template, client and styles pass 60 KB (about 11 KB now) and when the page loads anything external |
| 0.2.0-D11 | **Visual regression**: Playwright screenshots of tidepool in light, dark and mobile | done | spec 08 §2. PR #43: Playwright screenshots of Tidepool for all six views in light, dark and mobile (18 baselines in `test/e2e/visual.spec.ts-snapshots/`, 2% pixel tolerance; update on purpose with `pnpm exec playwright test --update-snapshots=all` and review the images). Baselines were made on Debian; the hosted CI job may differ in fonts, so it stays advisory |

### v0.3.0 — Onboarding: init, templates, handbook, agent skill

**Window:** 2027-01-04 → 2027-01-17
**Milestone:** M2
**Goal:** Someone who has never planned a project goes from nothing to a published map in 30 minutes, alone or with their AI agent.
**Exit:** In 3 moderated tests with people new to roadmaps, each reaches a built map with zero warnings in 30 minutes or less; the agent skill completes "interview me and write my roadmap" in Claude Code and one other agent.
**Status 2026-11-16:** planned.
**Status 2026-11-18:** D1 (`init`) done in PR #46; D2 (templates and `init --example`) in PR #48; D4 (agent integration) in PR #48; D5 (`doctor`) in PR #48; D6 (README and demo workflow) in progress in PR #49.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.3.0-D1 | **`init`**: prompts via `node:readline/promises` (name, one-sentence goal, launch target, first version); flags for non-interactive runs (`--yes`, `--name`, `--dir`); never overwrites a file (`--force` only with confirmation); keeps an existing `CHANGELOG.md` | done | spec 04 §2.1. PR #46: `opmap init` (prompts through `node:readline/promises`, or flags with `--yes`; `--name`, `--goal`, `--target`, `--version-title`, `--window`, `--dir`, `--force`). It refuses to run without a terminal unless `--yes` is given, never overwrites existing files without `--force` (and never the changelog), keeps the docs folder inside the project, writes the config as data so no answer can break the JSON, adds `.opmap/` to .gitignore, runs the checker and prints the next three commands. Templates are bundled into the CLI. `--example` and `--agents` come with D2 and D4 |
| 0.3.0-D2 | **Templates final**: `templates/` with guidance as HTML comments, which are invisible on GitHub and ignored by the parser; `init --example` writes tidepool | done | PR #48. The templates were already final (guidance in HTML comments, which GitHub hides and the parser skips); `init` fills them, and a test builds a map from a fresh `init`. `opmap init --example` writes the fictional Tidepool project (config, roadmap, decisions, changelog) into the docs folder, asks nothing and never overwrites without `--force` |
| 0.3.0-D3 | **Founder Handbook final**: `docs/guide/` reviewed by 3 non-technical founders; plain-language pass | todo | |
| 0.3.0-D4 | **Agent integration**: `skills/openprojectmap/SKILL.md`, the AGENTS.md snippet, a Cursor rule; `init --agents claude,cursor,codex` installs them | done | spec 06 §5. PR #48: `opmap init --agents claude,cursor,codex` (or `all`, `none`; asked in a terminal): the Claude Code skill to `.claude/skills/openprojectmap/SKILL.md`, a Cursor rule with `alwaysApply: true`, and a section in `AGENTS.md` (added once, never duplicated; an existing skill or rule is kept unless `--force`). The skill text is bundled into the CLI. Risk R5 asks for the skill to be tried in 2 or more agents; that manual test is still to do |
| 0.3.0-D5 | **`doctor`**: checks the Node version, git, config, doc paths and format marker; prints a fix for each problem | done | spec 04 §2. PR #48: `opmap doctor` (`node/doctor.ts`) checks the Node version (20.11 or newer), git, the git repository, the config, the roadmap, decisions and changelog files, the format marker, a summary of the docs, and that the output folder is in .gitignore; each warning or failure prints a fix. Exit 1 only on a failure; `--format json` for tools |
| 0.3.0-D6 | **Demo and README**: the tidepool map published on GitHub Pages, a screenshot/GIF in the README | doing | PR #49: the README now shows the real overview and timeline screenshots of Tidepool and an accurate quick start; `.github/workflows/pages.yml` builds the Tidepool map and deploys it to GitHub Pages (manual run only). GitHub Pages needs a public repo or a paid plan, and the repo is private (D14), so the live demo waits for D14 |
| 0.3.0-D7 | **Launch**: issue and PR templates, `good first issue` labels on 10 or more roadmap rows, announcement posts (Show HN, r/SideProject, X) | todo | PR template added early (2026-11-16); issue templates (bug, idea) added in PR #49; the `good first issue` labels and the announcement posts are still to do |

## Phase 3 — Daily driver

### v0.4.0 — Live preview, authoring commands, JSON export

**Window:** 2027-01-18 → 2027-02-07
**Goal:** An agent or a person can update the roadmap through precise commands, preview the map live, and feed the data to other tools.
**Exit:** In the tidepool repo, a full session close-out done only with CLI commands leaves the file byte-identical outside the edited cells, with zero warnings.
**Status 2026-11-16:** planned.
**Status 2026-11-19:** working ahead on v0.4.0 while v0.3.0 waits on the founder (handbook review, going public). D2 (source-preserving editor) done in PR #52; D3 (authoring commands) in PR #53; D1 (`serve`) in PR #54; D4 (`export` and schemas) and D6 (staleness banner) in PR #55.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.4.0-D1 | **`serve`**: `node:http` on 127.0.0.1:4173; `fs.watch` with a 150 ms debounce; SSE live reload; serves only the output dir, `/healthz` and `/events`; GET/HEAD only; security headers | done | spec 04 §2, spec 07 §4. PR #54: `opmap serve [--port 4173] [--host 127.0.0.1] [--open]` (`node/serve.ts`). `node:http`, `fs.watch` on the doc folders with a 150 ms debounce (so a file replaced on save is followed), SSE `/events` that carries only a `reload` event, `/healthz`, `/data.json`, security headers, a Host check against DNS rebinding, GET and HEAD only, at most 20 open pages, and a warning for `--host 0.0.0.0`. The page and data are held in memory, so nothing is read from disk per request and there is no path to traverse (the spec's "serve the output dir" is not needed). A failed rebuild keeps the last good map. Checked in a real browser: the page reloads under its CSP, which allows `connect-src 'self'` only on a live page. `--hub` and `--pull-interval` come with v0.5 |
| 0.4.0-D2 | **Source-preserving editor** (`node/editor.ts`): patches a table cell, field line or appended line by source position; round-trip tests (parse → edit → parse) and a byte-identity check outside the edit | done | spec 04 §5. PR #52: `node/editor.ts` (set a table cell with alignment kept, set or add a Now or version field, add a status line after the last one, add a deliverable row with the next free ID, add a version block, set a decision, a unified diff) and `node/edit-file.ts` (re-parse before and after, refuse an edit that adds a diagnostic or misses its intended value, `--dry-run` diff, atomic write that keeps permissions). Line endings, a BOM and a missing final newline are preserved; tests check that only the intended lines change |
| 0.4.0-D3 | **Authoring commands**: `set-status`, `add`, `new-version`, `log`, `now`, `decide`; all support `--dry-run` (prints a unified diff) | done | spec 04 §2. PR #53: `set-status <ID> <status> [--date] [--ref] [--note]`, `add <version> "<text>" [--status] [--notes]`, `new-version <semver> --title [--window] [--goal] [--exit] [--after]`, `log <version> "<text>" [--date]`, `now [--current] [--next] [--why] [--fact key=value]` (always sets Updated) and `decide <ID> "<outcome>" [--defaulted]`, all with `--dry-run` (a unified diff) and all refusing an edit that adds a problem. A test runs a whole session close-out with commands only on a copy of Tidepool: only the intended lines change and `check --strict` shows zero warnings. `new-version --phase` is not supported: a new version goes after the last version, or after `--after` |
| 0.4.0-D4 | **`export --json` + JSON Schemas**: `schema/project-data.v1.json` and `schema/config.v1.json`, generated from the TS types and checked in CI | done | spec 03 §4. PR #55: `opmap export [--pretty]` prints ProjectData as JSON (exit 1 for errors, or warnings with `--strict`, but the data is always printed). `schema/project-data.v1.json` is generated from the TypeScript types by `scripts/gen-schema.mjs` (`pnpm schema`); a test fails when the file is out of date, and real project data (Tidepool, fixtures, this repo, the stress fixture) must validate against it. `schema/config.v1.json` is written by hand and a test checks it agrees with the config loader on 27 cases. Both are in the npm package (`schema/`) and `$schema` lines now resolve |
| 0.4.0-D5 | **"Open docs…" in the page**: drag-and-drop or a file picker re-parses markdown in the browser with the embedded core; nothing is uploaded | todo | spec 05 §4.7 |
| 0.4.0-D6 | **Staleness banner**: shows when `Now.Updated` is older than `staleAfterDays` or when there are 10 or more commits since that date | done | spec 03 §3. PR #55: a banner under the header (role status) when `Now.Updated` is older than `staleAfterDays` or there are 10 or more commits since it, with the reason and the `opmap now` fix; replaces the small stale chip. Checked with axe in a real browser in both themes |

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
