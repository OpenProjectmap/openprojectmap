# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
