# The Founder Handbook

**For people who build products, often with AI, and have never been taught how to plan one.**

You don't need to know Scrum, Agile, Jira or project management. You need about six ideas and a
habit. This handbook gives you both in under an hour.

## Why bother?

When you build with an AI agent, the code moves fast and the plan lives in your head and in old
chat windows. After a few weeks:

- you don't remember what you decided or why,
- the agent keeps "improving" things you never asked for,
- everything feels 80% done and nothing ships,
- you can't tell a friend, an investor or a co-founder where you actually are.

A short written plan in your repo fixes all four. Your agent reads it, you read it, and
OpenProjectMap turns it into a page anyone can understand at a glance.

## Try it first (5 minutes)

You can see a finished map before you write anything:

```bash
npx openprojectmap init --example   # writes a fictional project called Tidepool
npx openprojectmap build --open     # builds the map and opens it in your browser
```

Click through the tabs: Overview, Timeline, Versions, Decisions, History, Parked. Everything on that
page came from three plain text files. When you're ready for your own, run `npx openprojectmap init`
in an empty project folder: it asks five questions and writes the files for you.

## Read in this order

| # | Chapter | Time | You'll be able to… |
| --- | --- | --- | --- |
| 1 | [The six ideas](01-concepts.md) | 15 min | Explain versions, milestones, deliverables, decisions, risks and the Parked list |
| 2 | [Write your first roadmap](02-first-roadmap.md) | 45 min | Produce a real ROADMAP.md and DECISIONS.md for your project |
| 3 | [The weekly rhythm](03-weekly-rhythm.md) | 10 min | Keep the plan true with 5 minutes per session |
| 4 | [Working with AI agents](04-working-with-ai.md) | 10 min | Make your agent follow and update the plan |
| 5 | [Mistakes everyone makes](05-anti-patterns.md) | 10 min | Spot and fix the common traps |

Reviewing this handbook for us? Use the [review sheet](review-checklist.md).

## The 30-second version

1. Write down **where you are now** and **the single next step**.
2. Cut the work into **versions**: small releases of 1–3 weeks, each with a clear goal and a test
   for "done".
3. Group versions into **milestones**: the moments that matter (first user, beta, launch, first
   revenue).
4. Anything you're not doing now goes on the **Parked** list, not in your head.
5. Every question you can't answer yet becomes a **decision** with a **default** and a deadline.
6. At the end of every session, update the plan. It takes 5 minutes, and your agent can do it.

Then run `npx openprojectmap build` and look at your project from above.
