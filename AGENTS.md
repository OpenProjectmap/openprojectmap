# AGENTS.md: rules for coding agents in this repo

Read this file fully before doing anything. These rules apply to every agent and every human
contributor.

## 1. What this project is

OpenProjectMap is a CLI (`openprojectmap`, alias `opmap`) that parses three markdown files
(ROADMAP, DECISIONS, CHANGELOG) and writes one self-contained HTML project map. It is
open source (MIT), has zero runtime dependencies, and never makes network requests.

## 2. Read order at the start of every session

1. `docs/project/ROADMAP.md`, the **Now** block first. It names the current version and the next step.
2. `docs/project/DECISIONS.md`: open decisions and their defaults.
3. The spec section linked from the deliverable you are about to work on (`docs/spec/0x-*.md`).

## 3. Scope

- **If it isn't in `docs/project/ROADMAP.md`, it isn't in scope.** A new idea becomes a new
  deliverable row in a future version, or a row in the Parked table, before any code is written.
- Work on the current version's deliverables in ID order unless the Now block says otherwise.
- An open decision past its "Needed by" date: proceed with its **Default**, set its Status to
  `defaulted`, and write one line in its Outcome cell saying so and when.
- Never change a released version's deliverables or dates. Record changes as new status lines.

## 4. Code rules

- TypeScript `strict`, ESM only, Node 20.11+ (CI also runs 22). Relative imports use `.js` extensions.
- **Zero runtime dependencies** (decision D5). Dev dependencies are fine. Adding a runtime
  dependency needs a new decision row first.
- `src/core/**` is isomorphic: no `node:*` imports, no `process`, no `Date.now()`. The current time
  is passed in as `options.now`. ESLint `no-restricted-imports` enforces this.
- `src/render/client/**` never uses `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `document.write`, `eval`, `new Function`, or inline event-handler strings. All document text goes
  through `textContent` or the `rich()` inline renderer. Every `href` goes through `safeHref()`.
- Git is called only through `src/node/git.ts`, with `execFile` (never a shell) and validated refs.
- Paths from config must resolve (after `realpath`) inside the repo root.
- No telemetry, analytics or update checks, ever.
- Match the existing style. Prettier and ESLint configs are the authority. Don't reformat files you
  didn't change.

## 5. Tests

- Every diagnostic code (`OPM-*`) has a fixture under `test/fixtures/diagnostics/<code>/`.
- Every field that reaches the page has an entry in the XSS suite (`test/xss/`).
- Parser changes update snapshot JSON intentionally (`pnpm test -u`) and the diff is reviewed.
- Before a commit: `pnpm typecheck && pnpm lint && pnpm test`. Before a PR, also run `pnpm build`
  and `node dist/cli.js check --strict`.

## 6. Git and PRs

Two long-lived branches: `beta` (preview, where new code is tested) and `main` (production, what
public users get). Both are protected: no direct pushes, a PR and a green `CI result` are required.

    task / feature / bug branch  →  beta  →  main

- **Work branches** are cut from `beta`: `<deliverable-id>/<slug>`, e.g. `0.1.0-D3/roadmap-parser`.
  One task, feature or bug per branch.
- **Task PR** targets `beta`. Title: `0.1.0-D3: <title>`; commit subjects start with the deliverable
  ID. **Squash-merge** it. Test the result on `beta`.
- **Release PR** targets `main` and is opened **from `beta` only**, and **only when a whole version
  is complete** (0.1.0, 0.2.3, 0.8.0 and so on), after it has been tested on `beta`. Title:
  `vX.Y.Z — <Version title>`. Merge it with a **merge commit** (not squash, so `beta` and `main`
  keep a shared history), then tag `vX.Y.Z` on `main`.
- Never open a PR from a work branch to `main`. CI fails any PR to `main` whose head is not `beta`
  (job `branch flow`). Hotfix for a broken release: branch from `main`, PR to `beta` like any task,
  then release a patch version.
- `main` and `beta` must always pass CI.
- Never commit secrets, tokens or private data. The `examples/` project is fictional and must stay so.

## 6a. Commands

```bash
pnpm install
pnpm build          # bundles client + CLI into dist/
pnpm test           # vitest (unit + fixtures + xss)
pnpm test:e2e       # playwright (from v0.2)
pnpm lint && pnpm typecheck
node dist/cli.js check --strict          # dogfood: validates docs/project
node dist/cli.js build -C examples/tidepool
```

## 7. Session close-out (do this at the end of every working session)

1. In `docs/project/ROADMAP.md`, set the **Status** cell of every deliverable you touched
   (`done` needs a reference: a commit SHA or PR number in Notes).
2. Append one `**Status YYYY-MM-DD:**` line to the current version. **The newest line goes last.**
3. Update the **Now** block: `Updated`, `Current version`, `Next step`, `Why`.
4. Add user-visible changes under `## [Unreleased]` in `CHANGELOG.md`.
5. If behaviour changed, update the matching `docs/spec/` section in the same PR.
6. Run `node dist/cli.js check --strict` (once it exists) and fix every warning in the docs.

## 8. Shipping a version

Follow the checklist in `docs/spec/08-quality-release.md` §6 (Definition of Done), then open the
release PR from `beta` to `main` (§6 above).

## 9. Cost: which model does the work

Use the cheapest model that can do the job well.

- **Small models** (Claude Haiku 5.5) take small, well-defined, low-risk tasks: updating docs and
  status lines, the CHANGELOG, searching and reading the repo, listing or summarising files,
  renaming, formatting, simple mechanical edits, and checking CI or PR status.
- **The main model** keeps the work that needs judgement: parser, renderer and security code,
  architecture, decisions, reviewing a finished change, and anything a small model got wrong.
- Give a small-model agent a self-contained prompt (the files, the exact change, what to report),
  and read its result before you rely on it. Its output is still your responsibility.
