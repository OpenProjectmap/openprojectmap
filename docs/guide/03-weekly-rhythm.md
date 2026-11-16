# 3. The weekly rhythm

A plan helps only if it's true. Keeping it true costs about 5 minutes a session, and your AI agent
can do most of it.

## Start of a session (1 minute)

1. Read the **Now** block. Is the next step still right?
2. Set that deliverable to `doing`.
3. Tell your agent: "Work on 0.2.0-D2 only."

## During a session

- **A new idea shows up?** Write one line on the Parked list or in a future version, then carry on.
  Don't let it into the current version unless you also remove something.
- **Blocked?** Set the status to `blocked` and write why in Notes. If it's a question, add a decision.
- **Made a decision?** Update its row in DECISIONS.md (Status `decided`, plus the Outcome).

## End of a session: the close-out (5 minutes)

1. **Statuses.** Update every deliverable you touched. `done` only if it's verified, with the PR
   or commit in Notes.
2. **Status line.** Add one dated line to the current version, at the **end**:
   `**Status 2026-11-18:** permission flow merged; reminders next.`
3. **Now block.** Update `Updated`, `Next step` and `Why`.
4. **Changelog.** Add anything users would notice under `## [Unreleased]`.
5. **Check.** Run `npx openprojectmap check` and fix what it lists.

Or tell your agent: "Do the OpenProjectMap close-out."

## Shipping a version

- [ ] Every deliverable is `done` or `parked` (with the reason in Notes)
- [ ] Exit criteria met, with the evidence in the last status line
- [ ] Tests pass; it's deployed where users can get it
- [ ] CHANGELOG.md: move `[Unreleased]` items under `## [0.2.0] - <date>`
- [ ] The Now block points at the next version
- [ ] If this version completes a milestone, fill in its `Reached on` date
- [ ] Celebrate (seriously: small wins keep solo founders going)

## Weekly review (15 minutes, once a week)

1. **Dates.** Is the current version still on track for its window? If not, re-plan now.
2. **Decisions.** Anything due this week? Decide, or accept the default.
3. **Risks.** Has anything become more likely? Update the rating and mitigation.
4. **Parked.** Has a "revisit when" condition become true?
5. **Map.** Open the map and look at it as an outsider would. Does it tell the truth?

## When you slip (you will)

Slipping is normal. Hiding it is the problem.

1. Move the window on the version that slipped, and on the ones after it.
2. Add a status line saying why: `**Status 2026-11-25:** slipped 1 week; store review took 6 days.`
3. If the slip threatens a milestone, cut scope: move deliverables to `parked` or to the next
   version. Don't quietly push the milestone back without saying so.
4. Never delete history. Old status lines stay; IDs are never reused.
