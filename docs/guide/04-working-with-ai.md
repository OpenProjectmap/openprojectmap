# 4. Working with AI agents

AI agents are fast and eager. Without a written plan, they fill the gaps with their own ideas.
With one, they become a very good project assistant.

## Set it up once

```bash
npx openprojectmap init --agents claude,cursor,codex
```

This installs the OpenProjectMap skill for Claude Code, a Cursor rule, and a section in
`AGENTS.md` that most agents read. The core rules it teaches:

1. Read the Now block before starting.
2. If a task isn't on the roadmap, add it (or park it) before writing code.
3. Mark `done` only with evidence (a PR, commit or passing test).
4. Do the close-out at the end of every session.
5. Open decisions past their deadline: proceed with the default, and record that.

## Prompts to copy

**Create your roadmap**

> Interview me to create my project roadmap using OpenProjectMap. Ask one question at a time:
> the one-sentence goal, who it's for, what works today, the milestones for the next 6–12 months,
> then the versions up to the first milestone. Write docs/project/ROADMAP.md and DECISIONS.md in
> the OpenProjectMap format and run `npx openprojectmap check`.

**Start a session**

> Read the Now block in docs/project/ROADMAP.md. Tell me the next step and the deliverables
> left in the current version, then start on the next step. Don't work on anything that isn't a
> deliverable.

**Close out**

> Do the OpenProjectMap close-out: update the statuses of the deliverables we touched (done only
> with a commit or PR ref), append a dated Status line to the current version, update the Now
> block, add user-visible changes to CHANGELOG.md [Unreleased], and run check.

**A new idea**

> I have an idea: <idea>. Don't build it. Suggest whether it belongs on the Parked list or in a
> future version, and add it there.

**Ship**

> Ship v0.2.0: run the "Shipping a version" checklist from the handbook, tell me what's missing,
> and update the docs once everything passes.

**Re-plan after a slip**

> I lost a week. Re-plan: move the windows, propose which deliverables to park to protect the
> next milestone, and add a status line explaining why. Show me the diff before writing.

## Trust, but verify

- **Agents love to say "done".** Ask for the evidence: the PR, the commit or the test output. With
  `"requireDoneRef": true` in `opmap.config.json`, `check` flags `done` rows without a reference.
- **Agents rewrite files.** The authoring commands (`opmap set-status`, `opmap log`, `opmap now`)
  and the MCP server change only the exact cell or line, so ask the agent to use them.
- **Agents drift from the plan.** If you see work you didn't plan in a diff, ask "which
  deliverable is this?" If there isn't one, it's scope creep.
- **Save money.** Updating docs is simple work. A smaller, cheaper model does it well; keep the big
  model for the code.
