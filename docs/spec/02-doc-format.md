# 02: Doc format v1

This is the contract between a user's markdown and the tool. Anything not described here is
ignored, so users can write any prose they like around the structured parts. The format must stay
readable on GitHub without the tool.

## 1. Files

| Role | Default path | Required | Purpose |
| --- | --- | --- | --- |
| roadmap | `docs/project/ROADMAP.md` | yes | Now block, phases, versions, deliverables, milestones, Parked |
| decisions | `docs/project/DECISIONS.md` | no | Open decisions and risks |
| changelog | `CHANGELOG.md` | no | Released versions with dates (Keep a Changelog) |
| tracks | (config) | no | Extra roadmaps, e.g. business and marketing (v0.6, §10) |

Paths are set in `opmap.config.json` (spec 04 §3). The Decisions and Risks sections may also live
inside ROADMAP.md: the parser looks for them in every file.

## 2. General rules

- **Format marker.** The first non-blank line of ROADMAP.md *should* be `<!-- opmap: 1 -->`.
  Missing → `OPM-I001` (version 1 assumed). A higher number → `OPM-E002`.
- **Sections** are H2 headings (`## `). Names are matched case-insensitively after trimming.
  Unknown H2 sections are ignored, along with all their content.
- **Fields** are lines of the form `**Key:** value`. They belong to the nearest enclosing section
  or version. A value is the rest of the line (single line in v1).
- **Tables** are GFM pipe tables. Columns are found **by header name**, case-insensitively, in any
  order. Extra columns are kept as `extra` (spec 03) and shown in the map.
- **Dashes** in headings: ` — ` (em dash), ` – ` (en dash) and ` - ` (hyphen) are all accepted.
- **Inline markdown** in values and cells (bold, italic, code, links) is kept raw and rendered by
  the safe inline renderer (spec 05 §3). Raw HTML is shown as text, never rendered.
- **Comments** `<!-- … -->` and fenced code blocks are ignored everywhere, so templates can carry guidance.

## 3. ROADMAP.md

### 3.1 Title

The first H1 is the project title. Missing → the config `name` is used (`OPM-I003`).

### 3.2 Now block

```markdown
## Now

**Updated:** 2026-11-16
**Current version:** v0.2.0
**Next step:** Finish the timeline view (0.2.0-D5).
**Why:** The timeline is the last view blocking the public alpha.
**Target:** Public alpha (M2) by 2027-01-17
**Live:** v0.1.0 on npm
```

| Key (aliases) | Meaning | Rules |
| --- | --- | --- |
| `Updated` (`Last updated`) | When this block was last true | ISO date; drives staleness (spec 03 §3.6) |
| `Current version` (`Version`) | What is being worked on | Must match a version id, else `OPM-W103` |
| `Next step` (`Next`) | The single next action | Required, else `OPM-W102` |
| `Why` | Why that is next | Optional |
| `Target` (`Launch target`) | The next big date or milestone | Optional, free text |
| *anything else* | A free "fact" (Live, Staging, Users, MRR…) | Shown as key/value chips in source order |

The section names `Now`, `Status` and `Current state` all start the Now block. Missing → `OPM-W101`.

### 3.3 Phases (optional)

```markdown
## Phase 2 — Public alpha
```

Grammar: `^## +Phase +(?<id>[\w.]+) +[—–-] +(?<title>.+)$`. Every version heading that follows
belongs to this phase until the next H2. Versions under any other H2 (for example `## Versions`)
have `phaseId: null`.

### 3.4 Version blocks

```markdown
### v0.2.0 — Safe renderer and views

**Window:** 2026-12-14 → 2027-01-03
**Milestone:** M2
**State:** shipped
**Goal:** One sentence: what this version achieves for users.
**Exit:** Measurable conditions that prove it is done.
**Status 2026-12-20:** timeline view merged; filters next.
**Status 2026-12-28:** all views merged; accessibility pass running.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.2.0-D1 | **DOM helper**: allow-listed attributes | done 2026-12-16 (#41) | |
| 0.2.0-D2 | Inline rich text | doing | |
```

- **Heading** grammar: `^### +v?(?<semver>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) +[—–-] +(?<title>.+)$`.
  The version id is `v` + semver. A duplicate id → `OPM-W208`.
- A block ends at the next H2 or H3. H4 and deeper headings inside are allowed (for grouping tables).
- **Fields** inside a version:

| Field | Rules |
| --- | --- |
| `Window` | Date window (§6). Missing → `OPM-W201`; unparseable → `OPM-W202` |
| `Milestone` | A milestone id (`M2`). Unknown → `OPM-W401`. This version *completes* that milestone |
| `State` | Optional explicit `planned` · `active` · `shipped`. Wins over derivation (§5) |
| `Goal` | One sentence. Missing → `OPM-I205` |
| `Exit` | Measurable exit criteria. Missing → `OPM-W207` |
| `Status <date>` | A dated progress note, many allowed. Must be in ascending date order (newest **last**), else `OPM-W205`. Without a date (`**Status:**`) the line is kept with `date: null` |

- **Deliverable tables**: every table in the block whose header has the columns **ID**,
  **Deliverable** (aliases `Title`, `What`) and **Status**. Several tables are concatenated in
  order. Optional known columns: `Owner`, `Ref` (alias `PR`), `Notes`. Other columns → `extra`.
  A version with no such table → `OPM-W206`. A table missing the Status column → `OPM-W701`.
- **Deliverable ID**: must match the config `idPattern`, default
  `^(?<version>\d+\.\d+\.\d+)-D\d+$`. No match → `OPM-W304`. If the pattern has a `version`
  group and it differs from the block's semver → `OPM-W303`. Duplicate across the file → `OPM-W302`.
  **IDs are never reused**: a cut item stays as `parked`.
- **Deliverable title**: the first bold span in the cell if there is one (`**DOM helper**: …` →
  "DOM helper"), else the whole cell; truncated to 96 characters for display, the full text kept as `detail`.

### 3.5 Milestones

```markdown
## Milestones

| ID | Milestone | Reached when | Reached on |
| --- | --- | --- | --- |
| M1 | Works on one repo | v0.1.0 on npm; check passes on 2 repos | 2026-12-13 |
```

Required columns: `ID`, `Milestone` (alias `Name`), `Reached when` (alias `Definition`).
Optional: `Reached on` (an ISO date, which means reached), `Depends on`. A milestone with no version
pointing at it → `OPM-I402`.

### 3.6 Parked

Section names: `Parked`, `Not doing`, `Parking lot`, `Later`. Table with `Item` and `Why` required,
and `Revisit when` optional. Parked items have no IDs: they are ideas, not commitments.

## 4. Statuses

A status cell is `<word> [<date>] [<anything>]`. The first word or phrase is matched against the
aliases, case-insensitively; an ISO date anywhere in the cell becomes `statusDate`; `#123` or a
URL becomes `ref` if there is no Ref column.

| Status | Means | Aliases |
| --- | --- | --- |
| `todo` | Not started | `to do`, `planned`, `not started`, `open`, `next` |
| `doing` | Being worked on | `in progress`, `wip`, `started`, `active`, `building` |
| `review` | Built, being checked or tested | `in review`, `testing`, `qa`, `built`, `staging` |
| `blocked` | Can't move until something else happens | `waiting`, `on hold`, `stuck` |
| `done` | Finished and verified | `shipped`, `merged`, `complete`, `completed`, `✅`, `[x]` |
| `parked` | Deliberately not doing in this version | `deferred`, `cut`, `dropped`, `won't do`, `moved` |

An unknown word → status `todo` + `OPM-W301`, with the closest alias suggested (Levenshtein ≤ 2).

## 5. Version state (when `State` is absent)

1. `shipped` if CHANGELOG.md has a dated release whose semver equals the version's semver.
2. `active` if `Now.Current version` names it, or any deliverable is `doing`, `review`, `blocked` or `done`.
3. otherwise `planned`.

Checks: `shipped` with deliverables in `todo`, `doing`, `review` or `blocked` → `OPM-W204`
(mark them `done` or `parked`). An explicit `State: shipped` with no changelog entry → `OPM-I601`.

## 6. Dates

```
window    := point | point ws* arrow ws* point [ws+ note]
arrow     := "→" | "->" | ".." | "–" | "to"
point     := day | month | quarter | year
day       := YYYY "-" MM "-" DD
month     := YYYY "-" MM
quarter   := YYYY "-Q" [1-4]
year      := YYYY
note      := "(" any ")" | any        # kept as window.note; "tentative" or "?" sets tentative: true
```

- A point's start is its first day and its end is its last day (`2027-Q2` → 2027-04-01 … 2027-06-30).
- A single point covers its whole span (`2027-02` → Feb 1 … Feb 28).
- All dates are calendar dates without time or timezone. "Today" is `options.now` as a UTC date,
  or local midnight in the CLI when `--tz local` is set (default `UTC`).
- `start > end` → `OPM-W203`.

## 7. DECISIONS.md

### 7.1 Decisions

Section names: `Decisions`, `Open decisions`, `Needs your call`.

| Column | Required | Notes |
| --- | --- | --- |
| `ID` | yes | e.g. `D4`; duplicates → `OPM-W503` |
| `Decision` (`Question`) | yes | The question, phrased so a yes/no or a pick answers it |
| `Options` | no | Separated with `·`, `/` or `;` |
| `Default` (`Proposed default`) | yes | What happens if nobody decides. Empty → `OPM-W502` |
| `Needed by` | no | ISO date |
| `Status` | yes | `open` · `decided` · `defaulted` (aliases `closed`/`done` → decided, `proceeding` → defaulted) |
| `Outcome` | no | What was decided, by whom, when |

An `open` decision whose `Needed by` is before today → `OPM-W501` ("proceeding with the default
since the Needed-by date; record it as defaulted").

### 7.2 Risks

Section name `Risks`. Columns: `ID`, `Risk`, `Likelihood`, `Impact` (each `L`/`M`/`H` or
`low`/`medium`/`high`) required; `Mitigation`, `Owner`, `Status` (`open`/`closed`) optional.
Score = L(1)/M(2)/H(3) likelihood × impact. A bad level → `OPM-W504`.

## 8. CHANGELOG.md

Keep a Changelog 1.1 plus the common variants:

```
## [Unreleased]
## [0.2.0] - 2027-01-03
## 0.2.0 - 2027-01-03
## v0.2.0 (2027-01-03)
## [0.2.0] — 2027-01-03 — Safe renderer      (anything after the date is kept as title)
```

H3 headings inside a release (`### Added`, `### Fixed`, …) become sections; `-` / `*` bullets
become items (inline markdown kept raw). Link reference definitions at the bottom are ignored.
A release whose semver has no version block → `OPM-I602`.

## 9. Diagnostic catalogue

Severity: **E** error (build fails), **W** warning (fails only with `--strict`), **I** info.

| Code | Sev | Condition | Hint |
| --- | --- | --- | --- |
| OPM-E001 | E | Roadmap file not found or unreadable | Set `docs.roadmap` in opmap.config.json or run `opmap init` |
| OPM-E002 | E | Format marker version higher than supported | Upgrade openprojectmap |
| OPM-E003 | E | Config invalid (each problem listed) | The message names the key and expected type |
| OPM-I001 | I | No format marker | Add `<!-- opmap: 1 -->` as the first line |
| OPM-I003 | I | No H1 title | Add `# <Project name>` |
| OPM-W101 | W | No Now block | Add a `## Now` section (see template) |
| OPM-W102 | W | Now block without `Next step` | Add `**Next step:** …` |
| OPM-W103 | W | `Current version` does not match any version | Use an id such as `v0.2.0` |
| OPM-W104 | W | Now block stale (spec 03 §3.6) | Update the Now block and `**Updated:**` |
| OPM-W105 | W | `Updated` is not an ISO date | Use `YYYY-MM-DD` |
| OPM-W201 | W | Version without `Window` | Add `**Window:** 2026-12-01 → 2026-12-14` |
| OPM-W202 | W | Window not parseable | Use ISO dates (spec 02 §6) |
| OPM-W203 | W | Window start after end | Swap the dates |
| OPM-W204 | W | Shipped version has unfinished deliverables | Mark them `done` or `parked` |
| OPM-W205 | W | Status lines not in ascending date order | Move the newest line to the end |
| OPM-W206 | W | Version without a deliverables table | Add a table `ID \| Deliverable \| Status` |
| OPM-W207 | W | Version without `Exit` | Add measurable exit criteria |
| OPM-I205 | I | Version without `Goal` | Add a one-sentence goal |
| OPM-W208 | W | Duplicate version id | Merge or renumber the blocks |
| OPM-W301 | W | Unknown status word | Use todo, doing, review, blocked, done or parked |
| OPM-W302 | W | Duplicate deliverable ID | IDs are never reused: pick the next free number |
| OPM-W303 | W | Deliverable ID version differs from its block | Move the row or fix the ID |
| OPM-W304 | W | ID doesn't match `idPattern` | e.g. `0.2.0-D7` |
| OPM-W305 | W | `done` without a date or reference (only with `requireDoneRef: true`) | Add `(#PR)` or a commit SHA |
| OPM-W401 | W | Version references an unknown milestone | Add it to `## Milestones` |
| OPM-I402 | I | Milestone that no version completes | Add `**Milestone:** Mx` to a version |
| OPM-W501 | W | Open decision past its Needed-by date | Decide, or set Status `defaulted` |
| OPM-W502 | W | Decision without a default | Every open question needs a default |
| OPM-W503 | W | Duplicate decision or risk ID | Renumber |
| OPM-W504 | W | Risk level not L/M/H | Use L, M or H |
| OPM-I601 | I | `State: shipped` with no changelog release | Add `## [x.y.z] - date` to CHANGELOG.md |
| OPM-I602 | I | Changelog release with no version block | Add the version to the roadmap |
| OPM-W701 | W | Table missing a required column | The message names the column |
| OPM-I702 | I | Table row has more cells than the header | Check for an unescaped `\|` |
| OPM-I801 | I | Not a git repository, or git missing | Git facts are skipped |
| OPM-I802 | I | Shallow clone, so activity is incomplete | Use `fetch-depth: 0` in CI |
| OPM-W803 | W | Configured branch not found | Fix `git.branches` or run with `--fetch` |

Codes are stable: a retired code is never reused.

## 10. Tracks (v0.6)

A track file uses the same grammar as ROADMAP.md (phases, versions or stages, deliverables,
milestones), with three differences: (1) its heading grammar for blocks is configurable
(`blockPattern`, default the version grammar; e.g. `^### +(?<id>BM\d+) +[—–-] +(?<title>.+)$`);
(2) its `idPattern` is its own; (3) it has no Now block (the project has one Now). It is rendered
as its own tab and as a lane in the timeline.

## 11. Format versioning

- `<!-- opmap: N -->` names the format version. v1 is frozen at openprojectmap 1.0.
- Within v1, changes are additive only: new aliases, new optional fields, new info codes.
- A conformance suite (`conformance/`, 1.0.0-D1) pins inputs → expected ProjectData for other
  implementations.

## 12. Complete minimal example

```markdown
<!-- opmap: 1 -->
# Tidepool

## Now

**Updated:** 2026-11-16
**Current version:** v0.2.0
**Next step:** Ship streak reminders (0.2.0-D2).

## Versions

### v0.2.0 — Reminders

**Window:** 2026-11-10 → 2026-11-30
**Exit:** 50 beta users receive a reminder and 30% open it.

| ID | Deliverable | Status |
| --- | --- | --- |
| 0.2.0-D1 | Push permission flow | done 2026-11-14 (#12) |
| 0.2.0-D2 | Streak reminder at the user's chosen time | doing |

## Milestones

| ID | Milestone | Reached when |
| --- | --- | --- |
| M1 | Beta | 50 weekly active beta users |
```
