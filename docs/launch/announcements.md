# Launch posts (drafts)

Drafts only. Nothing here has been posted. Post them when the repository is public, the first version
is on npm, and the demo map is live (see roadmap rows 0.3.0-D6 and D7). Replace the `<…>` parts.
Keep the tone plain: say what it does, who it is for, and what is not done yet.

## Show HN

**Title:** Show HN: OpenProjectMap – turn three markdown files into a project map

**Text:**

I build with AI agents, and after a few weeks the plan lived only in old chat windows: I forgot what
I had decided, the agent "improved" things I never asked for, and everything was 80% done.

OpenProjectMap fixes that with three plain markdown files in your repo (ROADMAP, DECISIONS,
CHANGELOG) and one command that turns them into a single self-contained HTML page: where you are,
what is next, a timeline, versions with progress, and a "Needs your call" list of open decisions,
each with a default.

- Zero runtime dependencies, one output file, no telemetry, no network requests. Text from your
  docs is never treated as HTML, so a map built from a pull request cannot run scripts.
- `npx openprojectmap init` interviews you and writes the files; `set-status`, `log`, `now` and
  `decide` edit one cell or line and nothing else, so an agent can keep the plan fresh without
  rewriting your file. `serve` previews with live reload.
- It ships a skill for Claude Code, a Cursor rule and an AGENTS.md section so agents read the plan
  at the start of a session and update it at the end.
- There is a Founder Handbook for people who have never planned versions or milestones.

Demo: <demo URL>. Repo: <repo URL>. AGPL-3.0 licensed. It is early (v<version>); I would love to hear
where the format or the handbook confuses you.

## r/SideProject

**Title:** I got tired of losing the plan when building with AI, so I made a tool that turns three markdown files into a project map

**Text:**

Short version: you keep ROADMAP.md, DECISIONS.md and CHANGELOG.md in your repo, run
`npx openprojectmap build`, and get one HTML page showing where you are, what is next, a timeline
and the decisions waiting on you.

Why I made it: building with AI agents is fast, but the plan drifts. Writing it down in a fixed,
small format fixes it, and your agent can read and update the same files.

What is in it: a guided setup (`init`), a live preview (`serve`), commands that edit one line of
your plan safely, an agent skill, and a handbook that explains versions, milestones and decisions in
plain words (no Scrum needed). Free, AGPL-3.0, no account, nothing leaves your machine.

Try it without writing anything: `npx openprojectmap init --example && npx openprojectmap build --open`.
Demo: <demo URL>. Feedback welcome, especially from first-time founders.

## X / Bluesky / Mastodon

> Building with AI and losing the plan?
>
> OpenProjectMap turns 3 markdown files (roadmap, decisions, changelog) into one page: where you
> are, what's next, what needs your call.
>
> `npx openprojectmap init --example`
>
> Free, AGPL-3.0, no telemetry. <demo URL>

Thread follow-ups, one per post:

1. The idea: your docs are the database. They live in git, your agent reads and updates them.
2. "Needs your call": every open question has a default and a date, so work never waits on you.
3. Safe edits: `set-status`, `log`, `now`, `decide` change one line and refuse a change that would
   break your docs.
4. Made for people who have never planned a project: the handbook explains the six ideas in under
   an hour.
5. Looking for feedback on the handbook and the format: <issues URL>.

## Checklist before posting

- [ ] Repository is public and the README renders (screenshots included)
- [ ] The package is on npm and `npx openprojectmap init --example` works from a clean folder
- [ ] The demo map is live (GitHub Pages workflow run once)
- [ ] `good first issue` issues are open and have the label
- [ ] SECURITY.md has a reporting address and private vulnerability reporting is on
- [ ] Reply to every comment in the first two hours
