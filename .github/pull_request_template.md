## Summary

<!-- One or two sentences: what this PR does. -->

## Motivation

<!-- Why is this needed? What problem does it solve? -->

## Related issue

<!-- Link the issue or roadmap deliverable, e.g. "Closes #12" or "0.1.0-D3". -->

## Changes

<!-- The main changes, as a short list. -->

-

## Security

<!-- Tick what applies, or write "None". Details for any ticked box go below. -->

- [ ] No new runtime dependency (needs a decision row first, see D5)
- [ ] No network requests, telemetry or update checks
- [ ] No `innerHTML`, `eval` or `new Function` in `src/render/client`; every `href` goes through `safeHref()`
- [ ] New or changed rendered fields have an entry in the XSS suite (`test/xss/`)
- [ ] Paths from config still resolve inside the repo root; git is called only through `src/node/git.ts`
- [ ] No secrets, tokens or private data committed

## Verification

<!-- How you checked it works. Paste the commands you ran and what you saw. -->

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm build && node dist/cli.js check --strict
```

## Checklist

- [ ] This PR targets `beta`. Only a maintainer opens `beta` → `main` release PRs, once a version is complete
- [ ] The branch is named `<deliverable-id>/<slug>` and the PR title starts with the deliverable ID
- [ ] The work is a row in `docs/project/ROADMAP.md`, and its Status cell and Status line are updated
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]` for any user-visible change
- [ ] The matching `docs/spec/` section is updated if behaviour changed
- [ ] Every new diagnostic code has a fixture under `test/fixtures/diagnostics/`
- [ ] CI is green
