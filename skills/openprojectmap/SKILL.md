---
name: openprojectmap
description: Plan and track a software project in OpenProjectMap markdown docs (ROADMAP.md, DECISIONS.md, CHANGELOG.md). Use when the user asks to create a roadmap, plan versions or milestones, start or close out a work session, ship a version, park an idea, record a decision, re-plan after a slip, or asks "where are we?".
---

# OpenProjectMap skill

The project's plan lives in three files (paths in `opmap.config.json`, defaults shown):
`docs/project/ROADMAP.md`, `docs/project/DECISIONS.md`, `CHANGELOG.md`. The format is described
in the OpenProjectMap doc format v1. Keep to it exactly; `npx openprojectmap check` is the judge.

## Ground rules

- **Never invent facts.** Dates, statuses and decisions come from the user or from evidence
  (git log, PRs, test output). If unknown, ask.
- **`done` needs evidence**: a commit SHA, PR number or passing test, written in Notes.
- **Edit surgically.** Change only the cells and lines that need it. Prefer the CLI authoring
  commands (`opmap set-status`, `opmap log`, `opmap now`, `opmap decide`, `opmap add`) when available,
  because they never reformat the file. Never reorder or reformat tables.
- **IDs are forever.** Take the next free number; dropped work becomes `parked`.
- **Status lines go last** (newest at the end of the version's status lines).
- **Scope:** new work goes into a future version or Parked unless the user explicitly adds it to
  the current version.
- **Overdue decisions:** proceed with the Default, set Status `defaulted`, and note the date in Outcome.
  Tell the user.

## Workflow A: create a roadmap (interview)

Ask **one question at a time**, offer an example answer for each, and keep answers short:

1. Project name, and the one sentence: "[Product] helps [who] [do what] by [how]".
2. What works today for a real user? (This becomes a shipped `v0.1.0`, or nothing.)
3. Milestones for the next 6–12 months (3–5), each with a checkable "reached when" (push for numbers).
4. For the first milestone: the smallest set of things users need. Group them into versions of
   1–3 weeks with one theme each and 3–8 deliverables.
5. For each version: a one-sentence goal and measurable exit criteria.
6. Dates: ask for estimates, then propose windows with about 50% buffer; confirm them.
7. Everything else goes to Parked (item, why, revisit when).
8. Open questions become decisions (question, options, default, needed by). Top 3–5 risks (L/M/H + mitigation).
9. The Now block: Updated today, the current version, a single next step, why.

Then run `npx openprojectmap init --yes --name "<name>"` if there is no config yet, write the
files, run `npx openprojectmap check`, fix every warning, and run `build`. Show the user the
summary line and the path of the map.

## Workflow B: start of session

1. Read the Now block, the current version's rows, and open decisions due within 7 days.
2. Report in 5 lines or fewer: current version (progress), next step, blockers, decisions due.
3. Set the next deliverable to `doing` once the user agrees.

## Workflow C: close-out (end of session)

1. From `git log` since the last status line date, find what was done; map commits to deliverable IDs.
2. Update the statuses (with refs). Unfinished work stays `doing`; anything waiting becomes `blocked` with a reason.
3. Append `**Status <today>:** <one or two sentences: what moved, what's next>`.
4. Update the Now block: `Updated`, `Current version`, `Next step`, `Why`.
5. Add user-visible changes to `## [Unreleased]` in CHANGELOG.md.
6. Run `npx openprojectmap check`; fix all warnings; report what changed in 5 bullets or fewer.

## Workflow D: ship a version

Check: every row `done` (with a ref) or `parked` (with a reason); exit criteria met (ask for the
evidence); tests pass. Then: move `[Unreleased]` → `## [x.y.z] - <today>` in CHANGELOG.md, add a
final status line, point the Now block at the next version, fill the milestone's `Reached on` if
this version completes it, then run check and build.

## Workflow E: new idea

Don't build it. Propose Parked (with "why" and "revisit when") or a future version (with the next
free ID), then write it after the user agrees.

## Workflow F: re-plan after a slip

Show a proposal first: new windows for the slipped and following versions, deliverables to park
to protect the next milestone, and a status line explaining why. Write it only after approval.
Never delete old status lines.

## Workflow G: "where are we?"

Answer from the docs (not from memory): current version and progress, next step, the last
status line, open decisions with deadlines, the next milestone and its progress, and whether the
Now block is stale (Updated older than 14 days). If it's stale, offer to run the close-out.
