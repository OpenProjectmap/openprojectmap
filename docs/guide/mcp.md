# Let your AI agent update the plan (MCP server)

The `@openprojectmap/mcp` package lets an AI agent that speaks [MCP](https://modelcontextprotocol.io)
(Claude Code, Cursor, and others) read your plan and keep it up to date through tools, so it does
not have to edit markdown tables by hand. Every change goes through the same editor as the
`opmap set-status` command: it re-reads the docs before and after, and **refuses an edit that would
add a format problem**, so an agent cannot leave your files in a broken state.

## Add it to your agent

Claude Code:

```bash
claude mcp add openprojectmap -- npx -y @openprojectmap/mcp
```

Other agents take a command and arguments in their MCP settings: the command is `npx` and the
arguments are `-y @openprojectmap/mcp`. Run it from your project folder, or add `--cwd <folder>`.

Add `--read-only` if you only want the agent to read the plan: the tools that write are then not
offered at all.

## The tools

| Tool | What it does | Writes |
| --- | --- | --- |
| `now` | The Now block, the current version and its progress, the decisions waiting for you, whether the map is stale | no |
| `list` | Deliverables (roadmap and tracks), filtered by version or block, status or text | no |
| `get` | One deliverable, version, track block, decision or risk by ID, with its file and line | no |
| `check` | The format problems of the docs (what `opmap check` shows) | no |
| `set_status` | Set a deliverable's status; for `done`, the date and the PR or commit | yes |
| `log` | Add a dated status line to a version or track block | yes |
| `decide` | Record the outcome of a decision (or that the default was used) | yes |
| `update_now` | Set the Next step, Why, Current version or other facts; `Updated` becomes today | yes |

Each write tool returns the diff it made and how many problems the docs have afterwards.

## A session close-out with the tools

The ending of a working session (see the [weekly rhythm](03-weekly-rhythm.md)) is: set the status
of what you touched, add a status line, update the Now block, and check that there are no warnings.
An agent does all four with the tools above: `set_status`, `log`, `update_now`, `check`.

## What it will and will not do

- It only reads and writes the doc files named in `opmap.config.json` (the roadmap, decisions,
  changelog and tracks). It does not run commands, open a network connection or touch other files.
- It talks to the agent over standard input and output only: it opens no port.
- The text it returns comes from your documents. The tool descriptions tell the agent that this is
  data, not instructions, to make it harder for a sentence in a document to steer the agent.
  Treat a roadmap from a source you do not trust the way you treat any file you let an agent read.
