# OpenProjectMap GitHub Action

Builds the project map from your `ROADMAP.md`, `DECISIONS.md` and `CHANGELOG.md` on every run and
reports problems in the docs as annotations on the run.

## Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `version` | `0.4` | The `openprojectmap` version from npm, like `0.4` or `0.4.0` |
| `config` | none | Path to `opmap.config.json`; found automatically when empty |
| `strict` | `false` | Fail the run on warnings |
| `out` | `.opmap` | Where to write the map |

The output `out` is the folder with `index.html`.

## Publish the map to GitHub Pages

```yaml
name: Project map
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # full history, for git activity
      - uses: OpenProjectmap/openprojectmap/action@v0.5.0
      - uses: actions/upload-pages-artifact@v5
        with:
          path: .opmap
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

Pin every third-party action by full commit SHA in your own workflow, as this repo does.

**Privacy:** GitHub Pages sites are public on free plans, even for private repositories. Publish
only what you would put on your website. The Action prints this as a notice in the log.

## Check the roadmap on pull requests

```yaml
on: pull_request # never pull_request_target
permissions:
  contents: read
jobs:
  roadmap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # the base branch must be available
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npx --yes openprojectmap@0.5 check --format github
      - env:
          BASE_REF: ${{ github.base_ref }}
        run: npx --yes openprojectmap@0.5 diff "origin/$BASE_REF" --format markdown >> "$GITHUB_STEP_SUMMARY"
```

`check --format github` turns each problem in the docs into an annotation on the changed line.
`diff` lists status changes, new and removed deliverables, window changes, Now block changes and
decisions opened or closed between the base branch and your files, as markdown. The output starts
with `<!-- opmap-diff -->`, so a workflow with `pull-requests: write` can find and update one
comment. Pull requests from forks get a read-only token and cannot post comments, which is why the
run summary is the default.

Refs given to `diff` are branch, tag or commit names such as `origin/main`, `v0.4.0` or a SHA.

## Safety

- Inputs are read from environment variables only and are never placed in the script text.
- `version` must match `^[0-9]+(\.[0-9]+){0,2}$`; anything else stops the run before npm is called.
- The Action needs no token and no write permission. Use `pull_request`, never
  `pull_request_target`, for workflows that check out pull request code.
