# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `opmap init` sets up a project: it asks a few questions (or takes flags with `--yes`), writes `opmap.config.json`, the roadmap, decisions and changelog from templates, adds `.opmap/` to .gitignore and runs the checker. It never overwrites your files without `--force`.

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
