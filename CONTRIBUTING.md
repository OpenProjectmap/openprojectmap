# Contributing to OpenProjectMap

Thanks for helping. This project plans in the open, using its own format.

1. **Find work in the roadmap.** [docs/project/ROADMAP.md](docs/project/ROADMAP.md) lists every
   deliverable with an ID such as `0.2.0-D5`. Issues labelled `good first issue` point to one.
2. **Propose new ideas as an issue first.** If accepted, the idea becomes a roadmap row (or goes
   to the Parked table) before code is written. This keeps the scope honest.
3. **Read [AGENTS.md](AGENTS.md).** The code rules there apply to humans too: zero runtime
   dependencies, no `innerHTML`, isomorphic `src/core`, and a fixture for each diagnostic.
4. **Open a PR** titled `<deliverable-id>: <what it does>`. CI must be green. Update the spec if
   you change behaviour, and add an `## [Unreleased]` line to `CHANGELOG.md` for visible changes.

## Development

```bash
corepack enable && pnpm install
pnpm test && pnpm lint && pnpm typecheck
pnpm build && node dist/cli.js build -C examples/tidepool
open examples/tidepool/.opmap/index.html
```

## Code of conduct

This project follows the [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Report unacceptable behaviour to the maintainers through the contact in SECURITY.md.

## Security issues

Don't open a public issue. See [SECURITY.md](SECURITY.md).

## Branches and pull requests

- Branch from `beta`, one task, feature or bug per branch: `<deliverable-id>/<slug>`.
- Open your PR against **`beta`**. We test it there. PRs to `main` are release PRs from `beta`
  only, opened by a maintainer when a whole version is complete.

## Licence

OpenProjectMap is licensed under AGPL-3.0-only. By contributing you agree your contribution is
licensed under it. Before outside contributions are merged, a Contributor License Agreement
will be required so the project owner can also license the code separately.
