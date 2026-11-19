# 04: CLI and config

Binary `openprojectmap`, alias `opmap`. Arguments are parsed with `node:util.parseArgs` (strict
mode, so unknown flags are an error with exit 2).

## 1. Global options

| Flag | Meaning |
| --- | --- |
| `-C, --cwd <dir>` | Run as if started in `<dir>` |
| `-c, --config <file>` | Config path (otherwise discovered, §3.1) |
| `--now <date>` | Override "today" (ISO date or timestamp); also `OPMAP_NOW` |
| `--tz <utc\|local>` | How "today" is computed (default `utc`) |
| `-q, --quiet` | Errors only |
| `--no-color` | Also honours `NO_COLOR` and non-TTY output |
| `-h, --help`, `-v, --version` | |

Environment: `OPMAP_NOW`, `OPMAP_CONFIG`, `OPMAP_DEBUG=1` (stack traces), `NO_COLOR`, `CI`
(disables prompts; `init` then requires `--yes`).

## 2. Commands

| Command | Since | Synopsis |
| --- | --- | --- |
| `build` | 0.1 | `opmap build [--out <dir>] [--json] [--strict] [--format text\|json\|github] [--no-git] [--fetch] [--open]` (diagnostics are printed in `--format`, as in `check`) |
| `check` | 0.1 | `opmap check [--strict] [--format text\|json\|github] [--max-warnings <n>]` |
| `init` | 0.3 | `opmap init [--yes] [--name <s>] [--dir <docs dir>] [--example] [--agents claude,cursor,codex] [--force]` |
| `doctor` | 0.3 | `opmap doctor` |
| `serve` | 0.4 | `opmap serve [--port 4173] [--host 127.0.0.1] [--open] [--hub <file>] [--pull-interval <s>]` |
| `set-status` | 0.4 | `opmap set-status <ID> <status> [--date <d>] [--ref <r>] [--note <s>] [--dry-run]` |
| `add` | 0.4 | `opmap add <version> "<deliverable>" [--status todo] [--notes <s>] [--dry-run]` |
| `new-version` | 0.4 | `opmap new-version <semver> --title <s> [--window <w>] [--phase <id>] [--after <version>] [--dry-run]` |
| `log` | 0.4 | `opmap log <version> "<status text>" [--date <d>] [--dry-run]` |
| `now` | 0.4 | `opmap now [--current <v>] [--next <s>] [--why <s>] [--fact key=value] [--dry-run]` (always sets Updated) |
| `decide` | 0.4 | `opmap decide <ID> "<outcome>" [--defaulted] [--dry-run]` |
| `export` | 0.4 | `opmap export [--json] [--pretty]`, ProjectData to stdout |
| `diff` | 0.5 | `opmap diff <base-ref> [<head-ref>] [--format text\|markdown\|json]`, what changed between two git refs, or between a ref and the working tree when `<head-ref>` is left out. Refs are branch, tag or commit names (`origin/main`, `v0.4.0`, a SHA); the docs are read with `git show` and both sides use one "today". Markdown output starts with `<!-- opmap-diff -->` |
| `hub` | 0.5 | `opmap hub <hub.json> [--out <dir>] [--no-fetch] [--cache-dir <dir>]`; `--out` defaults to `.opmap/hub`. Exit 1 when a project could not be built (its card says why) |
| `import` | 0.6 | `opmap import github [--repo o/r] [--milestones]` · `opmap import csv <file>`, writes `ROADMAP.import.md` |
| `mcp` | 0.6 | provided by `@openprojectmap/mcp` (`npx @openprojectmap/mcp`) |

### 2.1 `init` flow

1. Abort if `opmap.config.json` exists (unless `--force` + confirmation).
2. Ask (or take from flags): project name; one-sentence goal; who it's for; launch target date or
   month; first version title and window; docs dir (default `docs/project`).
3. Write `opmap.config.json`, `ROADMAP.md`, `DECISIONS.md` from `templates/`, filling the answers;
   write `CHANGELOG.md` only if absent.
4. Append `.opmap/` to `.gitignore` (create it if missing).
5. With `--agents`, write `skills/openprojectmap/SKILL.md` into `.claude/skills/`, append the snippet
   to `AGENTS.md`, and write `.cursor/rules/openprojectmap.mdc`.
6. Run `check` and print the next three commands to try.

### 2.2 `build` output

- `<out>/index.html` (default `.opmap/`) and, with `--json`, `<out>/data.json`.
- It prints one summary line: `map built: 6 versions, 41 deliverables (58% done), 3 decisions open, 2 warnings → .opmap/index.html`
- With `--open`, it opens the file with the OS opener (`open`, `xdg-open`, `start`) via `execFile`.

## 3. Config (`opmap.config.json`)

```json
{
  "$schema": "https://openprojectmap.dev/schema/config.v1.json",
  "format": 1,
  "name": "Tidepool",
  "docs": {
    "roadmap": "docs/project/ROADMAP.md",
    "decisions": "docs/project/DECISIONS.md",
    "changelog": "CHANGELOG.md"
  },
  "idPattern": "^(?<version>\\d+\\.\\d+\\.\\d+)-D\\d+$",
  "requireDoneRef": false,
  "staleAfterDays": 14,
  "git": {
    "enabled": true,
    "branches": { "live": "main", "staging": "beta" },
    "areas": ["apps/*", "packages/*", "docs"],
    "activityWeeks": 12
  },
  "output": { "dir": ".opmap", "json": false },
  "theme": { "accent": "#2f6fed", "mode": "auto", "density": "comfortable" },
  "tracks": [
    { "id": "biz", "title": "Business & Marketing", "file": "docs/project/BUSINESS.md",
      "blockPattern": "^### +(?<id>BM\\d+) +[—–-] +(?<title>.+)$", "idPattern": "^BM\\d+-[A-Z]\\d+$" }
  ]
}
```

| Key | Type | Default | Validation |
| --- | --- | --- | --- |
| `format` | `1` | `1` | must be 1 |
| `name` | string | repo directory name | 1–80 chars |
| `docs.roadmap` | path | `docs/project/ROADMAP.md` | file must exist (E001) |
| `docs.decisions` | path \| null | `docs/project/DECISIONS.md` if present | |
| `docs.changelog` | path \| null | `CHANGELOG.md` if present | |
| `idPattern` | regex string | see above | ≤ 200 chars; must compile with the `u` flag |
| `requireDoneRef` | boolean | false | enables OPM-W305 |
| `staleAfterDays` | int | 14 | 1–365 |
| `git.enabled` | boolean | true | |
| `git.branches` | `{role: ref}` | `{ "live": "main" }` | ref matches `^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$`, no `..` |
| `git.areas` | string[] | `["*"]` (top-level dirs) | prefix globs: only a trailing `/*` is supported |
| `git.activityWeeks` | int | 12 | 1–52 |
| `output.dir` | path | `.opmap` | inside the repo root |
| `output.json` | boolean | false | |
| `theme.accent` | `#rrggbb` | `#2f6fed` | regex-validated (CSS-injection guard) |
| `theme.mode` | `auto\|light\|dark` | `auto` | |
| `theme.density` | `comfortable\|compact` | `comfortable` | |
| `tracks[]` | object[] | `[]` | ids unique, `^[a-z0-9-]{1,32}$` |

### 3.1 Discovery

`--config` > `OPMAP_CONFIG` > the first `opmap.config.json` walking up from cwd, stopping at the git
root (or the filesystem root). With no config at all, defaults are used if `docs/project/ROADMAP.md`
exists, else E001 with the hint `run opmap init`.

### 3.2 Path rules

Every path is resolved relative to the config file's directory, then `realpath`-ed, and it must be
inside the repo root (the git root, or the config's directory if there is no git). A violation →
E003 "path escapes the repository". This blocks a PR from pointing the map at `~/.ssh/…` (spec 07 §3).

## 4. Output formats and exit codes

Text (default, TTY colours):

```text
docs/project/ROADMAP.md:42:3  warning  OPM-W301  Unknown status "finished" for 0.2.0-D4
    hint: use done (closest match) or one of todo, doing, review, blocked, done, parked
✖ 0 errors, 1 warning
```

GitHub (`--format github`), one line per diagnostic, for workflow annotations:

```text
::warning file=docs/project/ROADMAP.md,line=42,col=3,title=OPM-W301::Unknown status "finished" for 0.2.0-D4. Hint: use done
```

Messages are escaped per the workflow-command rules (`%` → `%25`, `\r` → `%0D`, `\n` → `%0A`,
and `:`/`,` in properties).

JSON: `{ "diagnostics": Diagnostic[], "summary": { "errors": 0, "warnings": 1, "info": 2 } }`.

| Exit | Meaning |
| --- | --- |
| 0 | Success (warnings allowed unless `--strict` or `--max-warnings` exceeded) |
| 1 | Errors in docs, or warnings with `--strict` |
| 2 | Usage or config error |
| 3 | Internal error (bug) |

## 5. Source-preserving editor (v0.4, `node/editor.ts`)

The authoring commands must never reformat a user's file.

- The scanner already records, for each table row, the line number and the character offsets of
  every cell, and for each field the value's offsets.
- An edit is `{ file, line, start, end, replacement }`. Edits are applied from the end of the file
  backwards, so offsets stay valid.
- Cell replacement pads to the existing cell width only if the table was aligned (all rows the same
  length), and otherwise inserts `| value |` as-is.
- Appends (new rows, status lines) copy the previous sibling's indentation and spacing; a new
  status line goes directly after the last existing one (keeping newest last).
- After editing, the file is re-parsed; the command fails (no write) if the edit introduced a new
  diagnostic or didn't produce the intended value.
- `--dry-run` prints a unified diff. Writes are atomic: write to a temporary file in the same
  directory, then `rename`.
- Tests: for every command, `bytes outside [start, end)` are identical before and after.
