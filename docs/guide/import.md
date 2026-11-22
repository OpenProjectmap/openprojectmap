# Start from the issues you already have

If your work already lives in GitHub issues or in a spreadsheet, you do not have to retype it.
`opmap import` reads it and writes a **draft** roadmap for you to review. It never touches your real
`ROADMAP.md`: the draft is a separate file, `ROADMAP.import.md`, next to it.

## From GitHub

```bash
gh auth login                      # once, if you have not
npx openprojectmap import github   # reads the repository your git remote points to
npx openprojectmap import github --repo acme/app
```

Milestones become versions (their due date becomes the Window), and issues become deliverables:
closed issues are `done` with their date, "not planned" issues are `parked`, issues labelled
`in progress` or `blocked` get that status. Issues that belong to no milestone go to the Parked
table. Pull requests are left out. Add `--milestones` to import only the milestones.

The tool reads GitHub through the `gh` command you already log in with. It never asks for, sees or
stores a token.

## From a spreadsheet or another tool

Export your tasks as CSV (Jira, Trello, Linear, Notion and Google Sheets all can) and run:

```bash
npx openprojectmap import csv tasks.csv
```

It finds the columns by their names: a title (or summary), a status, a version (or milestone,
sprint, release), notes, an owner and an ID. A status it does not know becomes `todo`, with the
original word kept in the notes.

## Then: review the draft

Open `ROADMAP.import.md`. Every version has a `TODO` where the Exit goes, and probably no Window.
Fill those in, move what you want into your `ROADMAP.md`, and delete the draft. Use `--dry-run`
to see the draft without writing it, and `--force` to replace an earlier draft.

Text that comes from the other tool is cleaned to plain single lines (no tables, headings or
special characters), so nothing in an old issue title can change the structure of your roadmap.
