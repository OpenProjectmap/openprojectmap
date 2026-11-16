# 2. Write your first roadmap (45 minutes)

Do this with a coffee, alone, or with your AI agent interviewing you ("Interview me using the
OpenProjectMap handbook chapter 2 and write my roadmap"). The example used throughout is
**Tidepool**, a fictional habit-tracking app (full files in `examples/tidepool/`).

Start with `npx openprojectmap init`. It creates the files and asks the first questions for you.

## Step 1: One sentence (3 min)

> *Tidepool helps people who keep breaking habits stay consistent with tiny daily check-ins.*

Shape: **[Product] helps [who] [do what] by [how].** Put it at the top of ROADMAP.md, under the
title. If you can't write it, that's your first decision.

## Step 2: Where are you, honestly? (5 min)

List what already exists and works for a real user. Not what's half-built, and not what's in your
head. This becomes your first shipped version (often `v0.1.0`), or an empty start.

## Step 3: Milestones, working backwards (7 min)

Pick 3–5 moments that would change your situation over the next 6–12 months. Write each with a
checkable "reached when".

| ID | Milestone | Reached when |
| --- | --- | --- |
| M1 | Private beta | 50 people use it weekly for 3 weeks |
| M2 | Public launch | In the App Store; 1,000 sign-ups |
| M3 | First revenue | 100 paying subscribers |

Tip: if a milestone has no number in it, it's probably not checkable.

## Step 4: Slice into versions (12 min)

For the *first* milestone, ask: "what's the smallest set of things a user must have?" Group those
things into versions of 1–3 weeks, each with **one theme**.

- 3–8 deliverables per version. Fewer is better.
- Each version should leave the product **usable**, even if small.
- Only plan versions in detail up to the next milestone. Later ones can be a title and a rough
  window (`2027-Q2`).

```markdown
### v0.2.0 — Reminders
**Window:** 2026-11-10 → 2026-11-30
**Milestone:** M1
**Goal:** Users get a nudge before they break a streak.
**Exit:** 50 beta users received a reminder and 30% opened it.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.2.0-D1 | Push permission flow | todo | |
| 0.2.0-D2 | Streak reminder at the user's chosen time | todo | |
| 0.2.0-D3 | Quiet hours setting | todo | |
```

## Step 5: Exit criteria that a stranger could check (5 min)

For each version: "how would someone else know it's done?" Use numbers, observable behaviour or a
passing test. "Reminders work" is not an exit; "a reminder arrives within 1 minute of the chosen
time on iOS and Android, in 20 of 20 test runs" is.

## Step 6: Dates you believe (3 min)

Estimate each version, then **add 50%**. Everyone underestimates, especially with AI, where the
last 20% (edge cases, deployment, store review) takes the longest. Dates live in one place only: the
version's `**Window:**` line.

## Step 7: Park everything else (3 min)

Every idea that didn't make it into a version goes onto the Parked list with why and when to
revisit. Be generous here: parking is free; carrying ideas in your head is expensive.

| Item | Why | Revisit when |
| --- | --- | --- |
| Social sharing of streaks | Not needed to test retention | After M1 if users ask |
| Apple Watch app | Expensive; small audience | After M2 |

## Step 8: Decisions with defaults (4 min)

What are you unsure about? Write each as a question with a default and a needed-by date in
DECISIONS.md. Three to six is normal.

## Step 9: Top risks (2 min)

What could kill the project or a milestone? Rate L/M/H, and write one mitigation each.

## Step 10: The Now block (1 min)

```markdown
## Now
**Updated:** 2026-11-16
**Current version:** v0.2.0
**Next step:** Build the push permission flow (0.2.0-D1).
**Why:** Reminders can't be tested without permission; it's the first thing beta users see.
**Target:** Private beta (M1) by 2026-12-20
```

## Step 11: Check and look (1 min)

```bash
npx openprojectmap check     # fix anything it lists; each line says how
npx openprojectmap build     # open .opmap/index.html
```

That's it: you have a real plan. Put it in git.

## Sizing cheatsheet

| If… | Then… |
| --- | --- |
| A version has more than 8 deliverables | Split it into two versions |
| A deliverable takes more than ~5 days | Split it, or it's actually a version |
| A version has no exit criteria | It will never feel done; write them now |
| You have more than 6 versions planned in detail | Detail only up to the next milestone |
| Everything is in v1.0 | Ask "what's the smallest thing that tests the idea?" and make that v0.1 |
