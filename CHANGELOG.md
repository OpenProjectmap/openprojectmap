# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Recipes for publishing the map from GitLab CI (Pages, and a merge request check), Netlify, Cloudflare Pages and Vercel (`examples/ci/`, `docs/guide/other-hosts.md`), each with a warning about who can open the page.
- A self-hosting guide (`docs/guide/self-hosting.md`) and ready-to-copy files (`examples/self-host/`): one private page for all your projects with Docker, Caddy, a password and read-only deploy keys.
- `opmap serve --hub <file>` serves a hub on one port and rebuilds it on a timer (`--pull-interval`, default 300 seconds), fetching the git repos in the hub file. It keeps the last good site if a rebuild fails and answers `/healthz`.
- A `Dockerfile` for self-hosting, with a smoke test that runs in CI. A workflow publishes a signed multi-arch image to GitHub Container Registry for each release tag.
- `opmap hub <hub.json>` builds many projects into one folder with an index page: a card per project with its current version and progress, next step, decisions waiting on you, a staleness badge and the last commit. Projects can be folders or git remotes (cloned into a cache folder the tool owns). Each map links back to the index. A project that fails still gets a card that says why.
- `opmap diff <base> [<head>]` shows what changed in the roadmap between two git refs (or a ref and your files): status changes, new and removed deliverables, windows, the Now block and decisions, as text, markdown or json. A recipe for checking pull requests is in `action/README.md`.
- A GitHub Action (`action/action.yml`) that builds the map in your workflow and writes problems in the docs as annotations. It installs the version you pin, takes its inputs only through the environment, and warns that GitHub Pages sites are public on free plans. A Pages recipe is in `action/README.md`.

## [0.4.0] - 2026-11-19

### Changed

- CI runs on GitHub-hosted runners (free now that the repo is public) instead of a self-hosted one.
- Licence: new releases are AGPL-3.0-only (was MIT). Versions up to 0.2.0 stay MIT.

### Added

- Editing commands that change one cell or line and nothing else: `set-status`, `add`, `new-version`, `log`, `now` and `decide`. Each supports `--dry-run` (prints the diff) and refuses a change that would add a problem to your docs. Writes are atomic.
- `opmap serve` previews the map in your browser and reloads it when you save a doc. It listens on 127.0.0.1 only unless you pass `--host`.
- `opmap export` prints the project data as JSON for other tools, and JSON Schemas for it and for `opmap.config.json` are published in `schema/` (your editor can use the config schema for autocomplete).
- A banner on the map when the Now block is out of date.
- "Open docs…" on the map: pick or drop your ROADMAP, DECISIONS and CHANGELOG files and the page shows them, parsed in your browser. Nothing is uploaded or saved.

### Fixed

- Windows: files are checked out with LF line endings (`.gitattributes`), which fixes the schema and agent-file tests there.
- The Now block no longer counts as stale because of commits made before the roadmap was last edited, so refreshing it clears the warning on a busy day.

## [0.3.0] - 2026-11-19

### Added

- Founder Handbook: a five-minute "try it first" section, the real commands in the chapters, and a review sheet for first readers.
- `opmap init` sets up a project: it asks a few questions (or takes flags with `--yes`), writes `opmap.config.json`, the roadmap, decisions and changelog from templates, adds `.opmap/` to .gitignore and runs the checker. It never overwrites your files without `--force`.
- `opmap init --example` writes the fictional Tidepool project so you can explore a finished map before writing your own.
- `opmap init --agents claude,cursor,codex` installs instructions for your AI agents: the Claude Code skill, a Cursor rule, and a section in `AGENTS.md`.
- `opmap doctor` checks your setup (Node, git, config, doc files, format marker, output folder) and says how to fix each problem.
- A README with real screenshots, issue templates for bugs and ideas, and a workflow that publishes the demo map to GitHub Pages once the repository is public.

## [0.2.0] - 2026-11-18

### Added

- Printing shows every view in sequence.
- Real-browser checks: axe-core with colour contrast on every view in light and dark, 360 px layout, keyboard and print checks, and screenshots of every view in light, dark and mobile.

### Fixed

- Timeline bars: the link name now contains its visible text, the last milestone label is no longer clipped, and the legend sits in one row.
- On phones, empty cells are hidden in the card view and the tab bar wraps instead of scrolling.

### Changed

- CI: release PRs run the blocking checks on Linux (Node 20 and 22) on the self-hosted runner; macOS and Windows run as an advisory job.

## [0.1.0] - 2026-11-17

### Added

- `opmap build` writes one self-contained HTML map from ROADMAP, DECISIONS and CHANGELOG markdown; `opmap check` lists every problem with file, line and a fix hint. Both support `--strict`, `--max-warnings`, `--format text|json|github`, `--now`, `--no-git`, `--fetch`, `--out`, `--json` and `--open`, and exit with 0, 1, 2 or 3.
- A parser for doc format v1: block scanner, dates and windows, status words with aliases, roadmap, decisions and risks, and Keep a Changelog; 38 diagnostic codes, each with a hint and a fixture.
- A first map with Overview, Versions (filters and search) and Decisions views, light and dark themes, an escaped data block, a content security policy pinned by hash, and a no-script summary.
- A Timeline view (SVG Gantt with phase groups, progress fill, milestone diamonds, today line and month or quarter zoom), History and Parked views, and compact density.
- Accessibility: axe-core checks on every view, contrast-tested theme colours, a proper tab panel structure, and tables that turn into labelled cards on narrow screens.
- `opmap.config.json` loader with strict validation; every path must stay inside the repository.
- Git facts (branch heads, weekly activity, areas, commits since the last update) read without a shell, and skipped cleanly outside a repository.
- A programmatic API: `parseProject`, `buildData`, `buildProject`, `renderMap` and `loadConfig`.
- Agent rules for cost: small tasks (docs updates, search, easy edits) go to Haiku 5.5 sub-agents.
- Branch model: a protected `beta` preview branch and the protected `main` production branch. CI runs on both and a `branch flow` check allows only `beta` to open PRs into `main`.
- Pull request template (summary, motivation, related issue, changes, security, verification, checklist).
- Seed documents: roadmap, open decisions and risks, doc format v1 spec, architecture, CLI,
  renderer, integrations, security and release specs.
- Founder Handbook (plain-language guide to versions, milestones, decisions and risks).
- Init templates, the fictional Tidepool example project, and the OpenProjectMap agent skill.
- Toolchain: TypeScript strict, ESLint flat config, Prettier, Vitest and an esbuild build script.
- Source skeleton (`src/core`, `src/node`, `src/render`, `src/cli`) with one test each, and lint
  rules that keep Node imports out of `src/core` and HTML-string sinks out of `src/render/client`.
- CI workflow (Linux, macOS, Windows on Node 20 and 22) with SHA-pinned actions, and Dependabot.
- Code of Conduct (Contributor Covenant 2.1).
- CI quality report (format, lint, typecheck, coverage, dependency audit, build) written to the run summary, and a single `CI result` check that gates merges.
- CODEOWNERS; `main` requires a PR with a passing `CI result`, and only squash merges are allowed.

### Changed

- CI runs the full 3-OS, 2-Node matrix only for release PRs and pushes to `main`; other runs use one ubuntu, Node 22 leg to save Actions minutes.
- Decisions D4 to D18 recorded. The desktop app may have a user-clicked "Check for updates" button; nothing else ever checks for updates.
- Roadmap: a VS Code extension (v0.7.0) and a desktop app for Windows, macOS and Linux (v0.8.0) are now planned, moved out of Parked; a feature-intake tool for agents is added to v0.6.0; v1.0.0 moves to 2027-Q3.
