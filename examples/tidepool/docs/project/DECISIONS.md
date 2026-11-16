<!-- opmap: 1 -->
# Tidepool: Decisions and risks

## Decisions

| ID | Decision | Options | Default | Needed by | Status | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | How do we charge for Plus? | monthly · yearly · both | Both; yearly = 2 months free | 2027-01-10 | open | |
| D2 | Invite more testers before reminders work? | wait · invite now | Wait for 0.2.0-D2 | 2026-11-20 | open | |
| D3 | Which analytics tool? | self-hosted · hosted free tier | Self-hosted (privacy promise) | 2026-11-12 | defaulted | Nobody decided by 2026-11-12, so we're proceeding with the default |
| D4 | Platforms for the beta | iOS only · iOS + Android | iOS + Android | 2026-10-20 | decided | Both, decided 2026-10-18 |

## Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | Store review rejects reminders as marketing | M | H | Reminders opt-in only; follow review guideline 4.5.4; TestFlight first | founder |
| R2 | Android battery optimisation kills reminders | H | M | Exact alarms + an in-app guide for the top 3 OEMs | founder |
| R3 | Testers stop using it after week 2 | M | H | Weekly check-in survey; fix the top complaint each version | founder |
