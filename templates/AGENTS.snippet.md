## Project map (OpenProjectMap)

- The plan lives in `{{docsDir}}/ROADMAP.md`. Read its **Now** block before starting work.
- If a task isn't on the roadmap, add it as a deliverable in a future version (or to Parked)
  before writing code. Don't add work to the current version without asking.
- At the end of a session:
  1. update the Status cell of every deliverable you touched (`done` needs a PR or commit ref in Notes);
  2. append one `**Status YYYY-MM-DD:**` line to the current version, after the existing ones (newest last);
  3. update the Now block (`Updated`, `Current version`, `Next step`, `Why`);
  4. add user-visible changes under `## [Unreleased]` in `CHANGELOG.md`;
  5. run `npx openprojectmap check` and fix every warning in the docs.
- Open decisions in `{{docsDir}}/DECISIONS.md` past their Needed-by date: proceed with the Default,
  set Status `defaulted`, and note the date in Outcome.
- Never reuse a deliverable ID, delete status lines, or change a shipped version's rows.
