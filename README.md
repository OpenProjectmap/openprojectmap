# OpenProjectMap

**Turn your project's markdown docs into a living project map: one HTML file that shows where you
are, what's next, and what needs your decision.**

> Status: pre-alpha. The format spec and roadmap are written, and the code is being built in the
> open. See [docs/project/ROADMAP.md](docs/project/ROADMAP.md).

OpenProjectMap is for founders, solo builders and "vibe coders" who ship with AI agents and lose
track of the plan. You keep three plain markdown files in your repo:

| File | Holds |
| --- | --- |
| `docs/project/ROADMAP.md` | Where you are now, your versions and what's in each one, milestones, the things you're *not* doing |
| `docs/project/DECISIONS.md` | Questions waiting for your decision (each with a default) and your top risks |
| `CHANGELOG.md` | What you shipped, and when |

Then you run one command:

```bash
npx openprojectmap build      # writes .opmap/index.html
```

You get a single self-contained page with an overview, a timeline, version progress, a
"Needs your call" panel, risks and release history. It works offline, makes no network requests,
and you can open it locally, publish it on GitHub Pages, or self-host it with Docker.

## Why markdown, not an app?

- **Your docs are the database.** They live in git next to your code, your AI agent can read and
  update them, and there is no account or lock-in.
- **Agents keep it fresh.** The bundled agent skill teaches Claude Code, Cursor or Codex to read the
  roadmap at the start of a session and update it at the end.
- **It teaches the basics.** If you've never planned versions, milestones or decisions, the
  [Founder Handbook](docs/guide/README.md) walks you through it in plain language, and
  `npx openprojectmap init` interviews you and writes your first roadmap.

## Quick start (once v0.3 is released)

```bash
npx openprojectmap init       # asks a few questions, writes the three docs and opmap.config.json
npx openprojectmap check      # lists problems with file:line and how to fix them
npx openprojectmap build      # builds the map
npx openprojectmap serve      # live preview while you edit (v0.4)
```

## Principles

- One output file, zero runtime dependencies, no telemetry, no network access (except reading your
  local git history).
- Text from your docs is never treated as HTML, so a map built from a pull request can't run scripts.
- The format is small and documented: [docs/spec/02-doc-format.md](docs/spec/02-doc-format.md).

## Documentation

- [Founder Handbook](docs/guide/README.md): how to plan a project, explained for people who've never done it
- [Doc format v1](docs/spec/02-doc-format.md): exactly what the tool reads
- [Architecture](docs/spec/01-architecture.md) · [CLI](docs/spec/04-cli.md) · [Security](docs/spec/07-security.md)
- [Contributing](CONTRIBUTING.md)

## Licence

MIT. See [LICENSE](LICENSE).
