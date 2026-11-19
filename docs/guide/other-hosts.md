# Other places to publish your map

The GitHub Action and GitHub Pages are covered in `action/README.md`, and one private page for many
projects is in [self-hosting](self-hosting.md). This page covers the rest: GitLab, Netlify, Cloudflare
Pages and Vercel.

Every one of them does the same thing: run one command that writes a folder, then serve that folder.

```
npx --yes openprojectmap@0.5 build --out public
```

## Read this first: who can open the page?

A published map shows your roadmap, your decisions and your next step. Most of these hosts make a new
site **public by default**, and what protects a site (a password, a login) depends on the host and on
your plan. If you are not sure who can open the page, **treat it as public** and publish only what you
would put on your website. For a private page, use [self-hosting](self-hosting.md).

## About the git history

The map shows when your project last changed, which it reads from git. Some hosts download only the latest
commit. The map still builds; it just leaves out the activity (the build prints a note about a shallow
clone). The GitLab recipe below asks for the full history. On the other hosts you can leave it as it is.

## GitLab (Pages and merge requests)

Copy the jobs from `examples/ci/gitlab-ci.yml` into your `.gitlab-ci.yml`.

- `pages` builds the map on every push to the default branch and publishes the `public` folder to GitLab
  Pages.
- `roadmap-check` runs on merge requests. It fails if your docs have problems (`check --strict`) and
  prints what the merge request changes in the roadmap (`diff`).

## Netlify

Put `examples/ci/netlify.toml` in the root of your repository, then add the repository as a site in
Netlify. It runs the command above and serves `public`.

## Cloudflare Pages

Cloudflare Pages needs no file. When you create the project from your repository, set:

| Setting | Value |
| --- | --- |
| Build command | `npx --yes openprojectmap@0.5 build --out public` |
| Build output directory | `public` |
| Environment variable | `NODE_VERSION` = `22` |

Cloudflare has a separate access feature (Cloudflare Access) that can put a login in front of a Pages
site. Check what it offers on your plan before relying on it.

## Vercel

Put `examples/ci/vercel.json` in the root of your repository and import the repository in Vercel. It
runs the command above and serves `public`.

## If a build fails

Run the same command on your computer first (`npx --yes openprojectmap@0.5 build --out public`) and
read what it says. The most common causes are a roadmap that is not at the path in `opmap.config.json`
(run `npx openprojectmap doctor`) and an old Node version on the host: use Node 22.
