@AGENTS.md

## Sub-agents and models (Claude Code)

Follow AGENTS.md §9. When you spawn a sub-agent for a small or easy task, set `model: "haiku"`
(Claude Haiku 5.5, `claude-haiku-5-5`) on the Agent call:

- Docs and status updates (ROADMAP status lines, CHANGELOG, DECISIONS outcomes).
- Searching, reading and summarising the codebase (use the `Explore` agent type).
- Mechanical edits, renames, formatting, and checking CI or PR state.

Do not use Haiku for parser, renderer or security code, architecture, decisions, or reviews. Do
those yourself or with a stronger model. Do not spawn an agent at all for a task that takes one or
two tool calls.
