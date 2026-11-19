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

## Safety

- Inputs are read from environment variables only and are never placed in the script text.
- `version` must match `^[0-9]+(\.[0-9]+){0,2}$`; anything else stops the run before npm is called.
- The Action needs no token and no write permission. Use `pull_request`, never
  `pull_request_target`, for workflows that check out pull request code.
