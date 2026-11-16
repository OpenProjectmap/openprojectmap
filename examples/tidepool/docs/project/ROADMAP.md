<!-- opmap: 1 -->
# Tidepool

Tidepool helps people who keep breaking habits stay consistent with tiny daily check-ins.
*(Fictional example project for OpenProjectMap.)*

## Now

**Updated:** 2026-11-16
**Current version:** v0.2.0
**Next step:** Finish the streak reminder at the user's chosen time (0.2.0-D2).
**Why:** Reminders are the core of the beta test: without them we can't measure whether nudges improve retention.
**Target:** Private beta (M1) by 2026-12-20
**Live:** v0.1.0 on TestFlight
**Beta users:** 23

## Phase 1 — Private beta

### v0.1.0 — Check-ins

**Window:** 2026-10-20 → 2026-11-09
**Goal:** A user can create a habit and check in once a day, and see their streak.
**Exit:** 20 testers checked in on 5 or more days in the first week.
**Status 2026-11-02:** check-in and streak logic merged; TestFlight build in review.
**Status 2026-11-09:** shipped to 23 testers; 21 checked in on 5 or more days.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.1.0-D1 | **Habit creation**: name, emoji, daily goal | done 2026-10-27 (#3) | |
| 0.1.0-D2 | **Daily check-in** with undo | done 2026-10-30 (#5) | |
| 0.1.0-D3 | **Streak counter** and calendar | done 2026-11-02 (#8) | |
| 0.1.0-D4 | Widgets for the home screen | parked | Moved to Parked: not needed for the beta |
| 0.1.0-D5 | **TestFlight release** | done 2026-11-09 | build 14 |

### v0.2.0 — Reminders

**Window:** 2026-11-10 → 2026-11-30
**Milestone:** M1
**Goal:** Users get a nudge before they break a streak.
**Exit:** 50 beta users received a reminder and 30% opened it.
**Status 2026-11-14:** permission flow merged; reminder scheduling in progress.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.2.0-D1 | **Push permission flow** with a pre-prompt explaining why | done 2026-11-14 (#12) | |
| 0.2.0-D2 | **Streak reminder** at the user's chosen time | doing | Android exact alarms need a permission on 14+ |
| 0.2.0-D3 | **Quiet hours** setting | todo | |
| 0.2.0-D4 | **Reminder analytics**: delivered, opened | todo | Needed for the exit criteria |
| 0.2.0-D5 | Invite 30 more testers | blocked | Waiting on D2; see decision D2 |

### v0.3.0 — Beta polish

**Window:** 2026-12-01 → 2026-12-20
**Goal:** The beta feels finished enough that testers recommend it to a friend.
**Exit:** Crash-free sessions of 99.5% or more; 10 testers invite someone.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.3.0-D1 | **Onboarding**: 3 screens + first habit suggestion | todo | |
| 0.3.0-D2 | **Invite link** with a deep link into onboarding | todo | |
| 0.3.0-D3 | Crash and performance fixes from beta feedback | todo | |

## Phase 2 — Launch

### v0.4.0 — Accounts and sync

**Window:** 2027-01
**Goal:** Habits survive a phone change.
**Exit:** Sign in on a second device and see the same streaks within 5 seconds.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.4.0-D1 | **Sign in with Apple / Google** | todo | |
| 0.4.0-D2 | **Sync** with conflict handling (last check-in wins) | todo | |

### v1.0.0 — Public launch

**Window:** 2027-Q1
**Milestone:** M2
**Goal:** Tidepool is in both app stores and anyone can download it.
**Exit:** Approved on the App Store and Google Play; 1,000 sign-ups in the first 30 days.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 1.0.0-D1 | **Store listings**: screenshots, copy, privacy labels | todo | |
| 1.0.0-D2 | **Pricing**: free + Plus subscription | todo | See decision D1 |
| 1.0.0-D3 | **Launch page** with a waitlist | todo | |

## Milestones

| ID | Milestone | Reached when | Reached on |
| --- | --- | --- | --- |
| M1 | Private beta | 50 people use it weekly for 3 weeks | |
| M2 | Public launch | In both stores; 1,000 sign-ups in 30 days | |
| M3 | First revenue | 100 paying Plus subscribers | |

## Parked

| Item | Why | Revisit when |
| --- | --- | --- |
| Home-screen widgets | Not needed to test retention | After M1, if 5 or more testers ask |
| Social sharing of streaks | Privacy questions; not core | After M2 |
| Apple Watch app | Expensive; small audience | After M3 |
