<!-- opmap: 1 -->
# OpenProjectMap: Decisions and risks

Each open decision has a **Default** and a **Needed by** date. If nobody decides by then, work
proceeds with the default: set Status to `defaulted` and write the date in Outcome.

## Decisions

| ID | Decision | Options | Default | Needed by | Status | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | npm package and binary names | `openprojectmap` · `@openprojectmap/cli` · other | Package `openprojectmap`, bins `openprojectmap` and `opmap` (check `npm view openprojectmap` and `npm view opmap` first) | 2026-11-23 | decided | 2026-11-16, founder: `openprojectmap`, `opmap` and `open-project-map` are all free on npm (404 on 2026-11-16). Package `openprojectmap`, bins `openprojectmap` and `opmap`. Not yet published, so the name is unclaimed |
| D2 | Licence | MIT · Apache-2.0 | MIT | 2026-11-23 | decided | 2026-11-16, founder: MIT |
| D3 | GitHub home | personal account · `openprojectmap` org | Create the `openprojectmap` org (keeps the Action name `openprojectmap/action@v1` possible) | 2026-11-23 | decided | 2026-11-16, founder: the `openprojectmap` org on GitHub is ours. The repo `alkomy/openprojectmap` still has to be transferred into it |
| D4 | Date syntax in format v1 | ISO only · ISO + English ranges | ISO only: `2026-11-24 → 2026-12-13`, `2027-01`, `2027-Q2`, `2027`. English ranges go to Parked | 2026-11-30 | open | |
| D5 | Runtime dependencies | zero · small set (micromark, yaml, commander) | Zero runtime deps in `openprojectmap`; the MCP server is a separate package and may depend on the MCP SDK | 2026-11-30 | open | |
| D6 | Release-history source | own `HISTORY.md` · Keep a Changelog `CHANGELOG.md` | `CHANGELOG.md` (Keep a Changelog 1.1); many repos already have one | 2026-11-30 | open | |
| D7 | Bundler | esbuild · tsup · rollup | esbuild (bundles both CLI and client) + `tsc --emitDeclarationOnly` for types | 2026-11-30 | open | |
| D8 | Status vocabulary | fixed set · per-project custom | Fixed 6 (`todo`, `doing`, `review`, `blocked`, `done`, `parked`) with aliases | 2026-12-07 | open | |
| D9 | Docs site generator (v1.0) | Astro Starlight · VitePress · none | Astro Starlight | 2027-03-01 | open | |
| D10 | Telemetry | none · opt-in | None, ever; stated in the README | 2026-11-23 | open | |
| D11 | Domain | openprojectmap.dev · .org · none | Register `openprojectmap.dev` if free; it hosts `$schema` URLs and the demo | 2026-11-30 | open | |
| D12 | npm dist-tag for 0.x | `latest` · `next` | `latest` (0.x semver already signals instability) | 2026-12-13 | open | |
| D13 | Config file format | JSON · JSONC · JS/TS | Plain JSON with `$schema` (zero deps, editor autocomplete) | 2026-11-30 | open | |

## Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | The format feels too strict, users hit warnings and quit | M | H | Every diagnostic has a fix hint; `init` templates; status aliases; prose outside known sections is ignored; `check --fix` later | maintainer |
| R2 | Script injection in a shared map (an Action build on a fork's PR) | M | H | textContent-only rendering, hash CSP, XSS corpus in CI, `pull_request` not `pull_request_target` | maintainer |
| R3 | Maintainer bandwidth (the founder also runs a startup) | H | H | Small versions, a strict Parked list, good-first-issues, no SaaS to operate | maintainer |
| R4 | Name taken on npm, GitHub or the domain | M | M | Check D1, D3 and D11 before the first commit | maintainer |
| R5 | Vibe coders don't read docs, so the agent skill is the real interface | H | M | Treat SKILL.md as a product: test it in 2 or more agents in v0.3.0 | maintainer |
| R6 | Windows path and line-ending bugs | M | M | Windows in the CI matrix; CRLF/BOM normalised at read; display paths with `/` | maintainer |
| R7 | Users publish private roadmaps by accident (Pages on a private repo, hub without auth) | M | H | Warnings in the Action and self-host docs; `serve` binds 127.0.0.1 by default; the output dir is gitignored by `init` | maintainer |
| R8 | Parser regex blow-up (ReDoS) from a crafted doc | L | M | Only linear regexes in `src/core`; fuzz with time budgets; a cap on the length of the `idPattern` config value | maintainer |
