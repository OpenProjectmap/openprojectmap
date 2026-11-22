# @openprojectmap/mcp

An [MCP](https://modelcontextprotocol.io) server that lets an AI agent read and update a project's
OpenProjectMap docs (`ROADMAP.md`, `DECISIONS.md`, `CHANGELOG.md`, and any tracks) through tools,
instead of editing markdown by hand.

```bash
claude mcp add openprojectmap -- npx -y @openprojectmap/mcp
```

Run it from the project folder, or pass `--cwd <dir>`. Add `--read-only` to leave out the tools that
write. The full guide, the tool list and what each tool refuses are in
[docs/guide/mcp.md](https://github.com/OpenProjectmap/openprojectmap/blob/main/docs/guide/mcp.md).

Licence: AGPL-3.0-only.
