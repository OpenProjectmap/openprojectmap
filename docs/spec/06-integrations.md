# 06: Integrations

## 1. Git (`src/node/git.ts`)

All calls go through one function:

```ts
function git(args: string[], cwd: string): string | null {
  // execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  //   windowsHide: true, timeout: 10_000, maxBuffer: 32 * 1024 * 1024, env: { ...safeEnv, GIT_TERMINAL_PROMPT: '0' } })
  // returns null on any failure
}
```

- **Ref validation** before any call: `^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$`, no `..`, not starting
  with `-`. Refs are also passed after `--end-of-options` where git supports it.
- Facts collected:
  - `git rev-parse --show-toplevel`, `git rev-parse --is-shallow-repository`
  - head and per branch: `git log -1 --format=%h%x1f%cI%x1f%s <ref>` (unit-separator fields, so a
    subject containing `|` can't break parsing). For each configured branch, try `origin/<b>`
    first, then `<b>`.
  - activity: `git log <live-ref> --since=<N weeks> --no-merges --format=%x1e%cI --name-only`
    → commits per ISO week (Monday start, UTC) and changed files per area for the last 4 weeks.
  - commits since `Now.Updated`: `git rev-list --count --since=<updated>T00:00:00Z HEAD`.
- `--fetch` runs `git fetch --quiet --no-tags origin` (still execFile, 60 s timeout).
- Not a repo / git missing → `OPM-I801`; shallow → `OPM-I802`; missing branch → `OPM-W803`.

## 2. GitHub Action (v0.5)

### 2.1 `action.yml` (in this repo under `action/`; mirrored to `openprojectmap/action` for the Marketplace)

```yaml
name: OpenProjectMap
description: Build the project map from your roadmap docs
branding: { icon: map, color: blue }
inputs:
  version:   { description: openprojectmap npm version, default: '0.5' }
  config:    { description: path to opmap.config.json, default: '' }
  strict:    { description: fail on warnings, default: 'false' }
  out:       { description: output directory, default: '.opmap' }
outputs:
  out: { description: output directory, value: ${{ steps.build.outputs.out }} }
runs:
  using: composite
  steps:
    - uses: actions/setup-node@<pinned-sha> # v4
      with: { node-version: 22 }
    - id: build
      shell: bash
      # the implementation installs the pinned version into a temporary folder and runs that copy:
      # npx would pick a same-named local package
      env:
        OPMAP_VERSION: ${{ inputs.version }}
        OPMAP_CONFIG_IN: ${{ inputs.config }}
        OPMAP_STRICT: ${{ inputs.strict }}
        OPMAP_OUT: ${{ inputs.out }}
      run: |
        set -euo pipefail
        [[ "$OPMAP_VERSION" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]] || { echo "bad version"; exit 2; }
        args=(build --out "$OPMAP_OUT" --format github)
        [[ -n "$OPMAP_CONFIG_IN" ]] && args+=(--config "$OPMAP_CONFIG_IN")
        [[ "$OPMAP_STRICT" == "true" ]] && args+=(--strict)
        npx --yes "openprojectmap@$OPMAP_VERSION" "${args[@]}"
        echo "out=$OPMAP_OUT" >> "$GITHUB_OUTPUT"
```

Inputs are only read from environment variables, never interpolated into the script (spec 07 §5).

### 2.2 Publishing to GitHub Pages (user workflow)

```yaml
name: Project map
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>   # v4
        with: { fetch-depth: 0 }       # full history for git activity
      - uses: openprojectmap/action@v1
      - uses: actions/upload-pages-artifact@<sha>
        with: { path: .opmap }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.d.outputs.page_url }}' }
    steps:
      - id: d
        uses: actions/deploy-pages@<sha>
```

> **Privacy warning (printed in the docs and in the Action log):** GitHub Pages sites are public on
> free plans, even for private repositories. Publish only what you would put on your website.

### 2.3 PR checks

```yaml
on: pull_request            # never pull_request_target
permissions: { contents: read, pull-requests: write }
jobs:
  roadmap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
        with: { fetch-depth: 0 }
      - run: npx --yes openprojectmap@0.5 check --format github
      - run: npx --yes openprojectmap@0.5 diff "origin/$GITHUB_BASE_REF" HEAD --format markdown > opmap-diff.md
      # optional: post opmap-diff.md as a sticky comment with a pinned comment action
```

`diff` builds ProjectData for both refs (reading files with `git show <ref>:<path>`) and lists
deliverable status changes, new or removed deliverables, window changes, Now block changes and
decisions closed.

## 3. Hub (v0.5)

`opmap.hub.json`:

```json
{
  "title": "My projects",
  "projects": [
    { "name": "Tidepool", "path": "/repos/tidepool" },
    { "name": "Side quest", "repo": "git@github.com:me/side-quest.git", "branch": "main" }
  ]
}
```

- `opmap hub hub.json --out site/` builds each project into `site/<slug>/index.html` (hub-child
  mode) and writes `site/index.html` with one card per project: name, current version and state,
  current-version progress, next step, Needs-your-call count, stale badge, last commit date.
- `slug` = the name lowercased, `[^a-z0-9]+` → `-`, deduplicated with a numeric suffix.
- `path` entries are folders on this machine (relative paths are taken from the hub file's folder). The hub
  file is trusted like a command line: it may point anywhere you can read.
- A project that cannot be built (missing folder, bad docs, failed clone) still gets a card that says why;
  the command exits 1 and writes everything else.
- `repo` must be an `https://`, `ssh://` or `file://` URL or `git@host:path`; git runs with only those
  transports enabled, so a value can never start a helper program. `branch` must be a plain branch name.
- `repo` entries are cloned into a cache dir (`~/.cache/openprojectmap/repos/<slug>`, or `$OPMAP_REPOS_DIR`,
  or `--cache-dir`; `/data/repos/<slug>` in Docker) with `git clone --filter=blob:none`; refreshed with
  `git fetch origin <branch>` + `git reset --hard origin/<branch>`. That is safe because the
  directory is owned by the tool, never a user's working copy, and the tool refuses to reset a
  directory without its `.opmap-managed` marker, or one cloned from a different remote.
  `--no-fetch` skips the refresh and uses the clones already there.
- Each project page is built in hub-child mode, which adds a "← All projects" link to `../index.html`.
  The index page is static HTML without script (CSP: its own style by hash only); card text is plain
  words (inline markdown is stripped) and every value is escaped.

## 4. Docker self-host (v0.5)

### 4.1 Image

The `Dockerfile` at the repo root builds the CLI from the source tree (a multi-stage build: `pnpm build`,
`npm pack`, then a global install of that tarball into a small runtime stage), so the image always
matches the commit it came from.

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache git openssh-client tini
# ... npm install --global --omit=dev <the packed tarball>; mkdir /data/repos /config; chown node /data
USER node
ENV NODE_ENV=production OPMAP_REPOS_DIR=/data/repos
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=120s CMD wget -qO- http://127.0.0.1:4173/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--", "opmap"]
CMD ["serve", "--hub", "/config/opmap.hub.json", "--host", "0.0.0.0", "--pull-interval", "300"]
```

`opmap serve --hub <file>` builds the hub once before it listens (so the first start waits for the first
clones), holds the whole site in memory, answers `GET`/`HEAD` only, and rebuilds every
`--pull-interval` seconds (`git fetch` and reset of each `repo` entry). Clones run asynchronously, so
`/healthz` stays responsive during a refresh. If a rebuild fails, the last good site stays up; a hub file
that is invalid at start stops the server. `CI` runs `scripts/docker-smoke.sh` on every change: it builds
the image, serves Tidepool, and checks the index, a map's CSP header, the non-root user and `opmap hub`.

Built multi-arch (amd64, arm64) by `.github/workflows/docker.yml` when a version tag is pushed to `main`,
pushed to GHCR as `X.Y.Z` and `X.Y`, with build provenance and an SBOM attached and a keyless cosign
signature on the digest. It is a separate workflow so an image problem never holds back the npm release.

### 4.2 Compose + Caddy (for a VPS or a Coder host)

```yaml
services:
  opmap:
    image: ghcr.io/openprojectmap/openprojectmap:0.5
    restart: unless-stopped
    volumes:
      - ./opmap.hub.json:/config/opmap.hub.json:ro
      - ./deploy_key:/home/node/.ssh/id_ed25519:ro      # read-only deploy key, mode 600
      - ./known_hosts:/home/node/.ssh/known_hosts:ro
      - opmap-data:/data
    expose: ["4173"]                # not published; only Caddy reaches it
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile:ro, caddy-data:/data]
volumes: { opmap-data: {}, caddy-data: {} }
```

```
map.example.com {
  basic_auth {
    founder <bcrypt hash from `caddy hash-password`>
  }
  reverse_proxy opmap:4173
}
```

Notes for the guide (0.5.0-D5):

- The tool removes every `GIT_*` variable before it runs git, so `GIT_SSH_COMMAND` has no effect. ssh uses
  its defaults: the key at `~/.ssh/id_ed25519` and `~/.ssh/known_hosts`, and with no terminal it refuses a
  host it does not know (`StrictHostKeyChecking` asks). Mount both files as shown.
- A project mounted into the container with `path` can be refused by git ("dubious ownership") when it
  belongs to another user; the map still builds, without git facts. Prefer `repo` entries, which the
  container clones itself.

- Use one read-only **deploy key** per repository (GitHub → Settings → Deploy keys, without write).
- On a Coder workspace you can skip Caddy for personal use: run
  `opmap serve --hub hub.json` and open it through Coder's port forwarding (private to you).
- Nothing needs a backup: all state is in git; `/data` is a rebuildable cache.

## 5. Agent integration (v0.3)

- **Claude Code**: `skills/openprojectmap/SKILL.md` copied to `.claude/skills/openprojectmap/`.
- **Any agent**: a snippet appended to `AGENTS.md` (read by Codex, Cursor, Claude Code via import,
  and others):

```markdown
## Project map (OpenProjectMap)
- The plan lives in docs/project/ROADMAP.md. Read its Now block before starting work.
- If a task isn't on the roadmap, add it as a deliverable (or to Parked) before writing code.
- At the end of a session: update deliverable statuses (done needs a PR/commit ref), append a
  dated Status line to the current version (newest last), update the Now block, add user-visible
  changes to CHANGELOG.md [Unreleased], then run `npx openprojectmap check` and fix warnings.
- Open decisions past their Needed-by date: proceed with the Default and mark them defaulted.
```

- **Cursor**: `.cursor/rules/openprojectmap.mdc` with the same rules and `alwaysApply: true`.

## 6. MCP server (v0.6, package `@openprojectmap/mcp`)

Stdio transport; it depends on the official MCP TypeScript SDK and on `openprojectmap` (for the
parser and editor). The server's working directory is the repo root (or `--cwd`).

| Tool | Input | Returns | Writes |
| --- | --- | --- | --- |
| `now` | — | Now block + current version summary + needs-your-call | no |
| `list` | `{ version?, status?: Status[], q?, limit≤200 }` | deliverables (compact) of the roadmap and every track | no |
| `get` | `{ id }` | a deliverable, version or track block, decision or risk, with its source line | no |
| `check` | — | diagnostics | no |
| `set_status` | `{ id, status, date?, ref?, note? }` | unified diff + new diagnostics | yes |
| `log` | `{ version, text, date? }` | diff | yes |
| `decide` | `{ id, outcome, defaulted? }` | diff | yes |
| `update_now` | `{ current?, next?, why?, facts? }` | diff | yes |

- Ids are plain words (`[A-Za-z0-9][A-Za-z0-9._-]{0,63}`); text inputs are one line and length-capped.
  `set_status` finds a deliverable in the roadmap or in any track; `log` takes a roadmap version or
  a track block id.
- Every tool carries the MCP `readOnlyHint` annotation (true for `now`, `list`, `get`, `check`),
  and the server runs over stdio only: it opens no port and makes no network request.
- `--read-only` disables every write tool. Every write goes through the editor (spec 04 §5) and is
  re-validated, so an agent cannot leave the file in a broken format.
- Text returned to the agent is data; the tool descriptions say so, to limit prompt injection from
  doc content.
