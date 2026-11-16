# 1. The six ideas

Planning a product is a ladder. Each rung is smaller than the one above it.

```
Vision          why the product exists                          (one sentence, rarely changes)
 └ Milestones   moments that matter: beta, launch, first $       (3–6 for the next year)
    └ Phases    chapters with a theme (optional)                 (a few versions each)
       └ Versions   releases of 1–3 weeks, each with a goal      (the heart of the plan)
          └ Deliverables   the 3–8 concrete things in a version  (each has an ID and a status)
             └ Tasks       the steps to build one deliverable    (not in the roadmap: your agent's todo list)
```

## 1. Version

A **version** is a small release with one goal. It is the unit you plan, build and ship.

- **Size:** 1–3 weeks of work, 3–8 deliverables. Anything bigger becomes two versions.
- **It has:** a title, a date **window**, a **goal** (one sentence: what users get), and **exit
  criteria** (how you'll *prove* it's done).
- **Numbering** uses semantic versioning, `MAJOR.MINOR.PATCH`:
  - `0.x.y` means "before launch: things can still change a lot".
  - Raise **MINOR** (`0.3.0` → `0.4.0`) for a version users would notice.
  - Raise **PATCH** (`0.3.0` → `0.3.1`) for fixes or a small follow-up.
  - `1.0.0` is your promise: "this is ready for the public, and I'll keep it stable".
- **Example:** `v0.2.0 — Reminders`, window `2026-11-10 → 2026-11-30`, goal "users get a nudge
  before they break a streak", exit "50 beta users received a reminder and 30% opened it".

> **What about sprints?** A *sprint* is a fixed time box (usually 2 weeks) that teams use to plan
> work together. If you're solo or a tiny team, a version with a window *is* your sprint. You don't
> need separate ceremonies, story points or burndown charts.

## 2. Deliverable

A **deliverable** is one concrete thing a version contains, which you can point at when it's done.

- **Good:** "Push permission flow", "Streak reminder at the user's chosen time", "Pricing page".
- **Too vague:** "Improve UX", "Backend work", "Polish".
- **Too small** (that's a task): "Rename the button", "Add an index".
- Each has an **ID** like `0.2.0-D3` (version + D + number). **Never reuse an ID**: if you drop
  something, mark it `parked`; don't delete the row.
- Each has a **status**:

| Status | Use it when |
| --- | --- |
| `todo` | Not started |
| `doing` | You're working on it now |
| `review` | Built; you're testing or checking it |
| `blocked` | It can't move until something else happens (say what in Notes) |
| `done` | Finished **and verified**. Add the PR or commit in Notes |
| `parked` | You decided not to do it in this version |

## 3. Milestone

A **milestone** is a moment that changes your situation, not a date and not a feature.

- **Examples:** "First 10 real users", "Public beta", "Public launch", "First paying customer",
  "Break-even".
- Each has a **"reached when"** definition you could check from a dashboard: "50 weekly active
  users", not "beta is good".
- A version can **complete** a milestone (`**Milestone:** M2` on the version).
- Plan backwards: decide the milestones first, then the versions that get you there.

## 4. Phase (optional)

A **phase** groups several versions under a theme: "Foundations", "Beta", "Growth". Use phases
when you have more than about 6 versions, so the map stays readable.

## 5. Decision

A **decision** is a question you can't (or don't want to) answer yet, written down so it stops
living in your head.

Every decision has four parts:

| Part | Example |
| --- | --- |
| **Question** | Do we charge monthly, yearly, or both? |
| **Options** | monthly · yearly · both |
| **Default** | Both, with yearly at 2 months free |
| **Needed by** | 2027-01-10 (when the pricing page gets built) |

**The rule that makes this work:** if nobody decides by the "needed by" date, you go ahead with the
default. No more blocked work and no more endless thinking. The map shows open decisions in a
**Needs your call** panel, and the overdue ones say "proceeding with default".

## 6. Risk

A **risk** is something that might go wrong and would hurt if it did.

- Rate **likelihood** and **impact** as L, M or H. Their product (1–9) is the score; the map
  highlights risks scoring 6 or more.
- Write a **mitigation**: what you do now to make it less likely or less painful.
- **Example:** "Apple rejects the app for using reminders as marketing" · M · H · "Read the review
  guidelines §4.5.4; make reminders opt-in; ship a TestFlight beta first".

## And two more things

### The Parked list

The **Parked** list holds the ideas you've decided *not* to do yet, with why and when to revisit.
It is the most powerful tool in this handbook: it lets you say "not now" without losing the idea.
When a new idea arrives (from you, a user or your AI agent), it goes onto the Parked list or into
a *future* version, never silently into the current one.

### The Now block

At the top of your roadmap, five lines say **where you are right now**: when it was updated, the
current version, the next step, why that step is next, and the next big target. If you only ever
update one thing, update this.

### Definition of Done

A short checklist that every version must pass before you call it shipped: tests pass, exit
criteria met, changelog entry written, roadmap updated. Write it once, and reuse it forever.

### Changelog

`CHANGELOG.md` records what you shipped and when, in plain words for users. OpenProjectMap reads
it to know which versions are shipped.

## Glossary

| Term | Meaning |
| --- | --- |
| Roadmap | The ordered plan: versions, deliverables, milestones. Committed, but changeable |
| Backlog | A pile of possible work. In this method, it's the Parked list plus future versions |
| Window | The planned start → end dates of a version |
| Exit criteria | Measurable conditions that prove a version is done |
| Scope creep | Work sneaking into a version that was never planned for it |
| Live / production | What real users run |
| Staging / beta | A copy for testing before it goes live |
| Ship | Release to real users |
| Slip | When a version misses its window. Normal; re-plan honestly |
| MVP | Minimum viable product: the smallest version that tests whether people want it |
