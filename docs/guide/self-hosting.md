# Putting your maps on one private page

You have a map for one project. Sooner or later you have several, and you want one address where you
(and maybe a partner or an investor) can see all of them, kept fresh without you doing anything.
This page shows how to set that up on a small server, behind a password.

Read the next section first: it tells you whether you need any of this.

## Which option fits?

| You want | Use | Cost of getting it wrong |
| --- | --- | --- |
| To look at your own map while you edit | `opmap serve` on your computer | None. It only listens on your machine. |
| A public page that anyone can open | The GitHub Action and GitHub Pages (`action/README.md`) | **GitHub Pages is public on free plans, even for a private repository.** Publish only what you would put on your website. |
| One private page for several projects, always fresh | This page: the Docker image with a password in front | You must set the password up. Without it, anyone with the address can read your plans. |
| A folder of maps to copy somewhere yourself | `opmap hub hub.json --out site` | The folder is plain files. Whoever can open them can read them. |

If you work in a Coder workspace and only need the page for yourself, skip the rest: run
`opmap serve --hub opmap.hub.json` and open it through Coder's private port forwarding.

## What you need

- A small server (a VPS) with Docker and Docker Compose installed.
- A domain name, such as `map.example.com`, with an `A` record pointing at the server. Caddy gets the
  HTTPS certificate for you, which needs ports 80 and 443 open to the internet.
- Your projects in git (GitHub or anywhere else), each with its `ROADMAP.md` (see chapter 2).

## 1. Copy the example files

The repository has a ready folder, `examples/self-host/`. Copy it to your server:

```
opmap.hub.json        the list of projects (you edit this)
docker-compose.yml    runs the page and Caddy
Caddyfile             your domain and your password (you edit this)
ssh/config            which key opens which repository (only for private repositories)
```

## 2. List your projects

Edit `opmap.hub.json`. Each project is one line:

```json
{ "name": "Tidepool", "repo": "git@github-tidepool:acme/tidepool.git", "branch": "main" }
```

- `name` is what people see on the card. It also becomes the address, `/tidepool/`.
- `repo` is where the project lives. For a public project use its `https://` address. For a private
  one use the `git@` form (next step).
- `branch` is the branch that holds your current roadmap, usually `main`.

The page rebuilds itself every five minutes (it fetches each repository first), so a roadmap you
push shows up on the page within about five minutes.

## 3. Let the server read your private repositories

The server needs permission to read, and only to read. GitHub calls this a **deploy key**, and it works
for one repository. Do this once per private repository:

1. On your server, make a key with no passphrase (the server uses it by itself, so there is nobody to
   type one): `ssh-keygen -t ed25519 -f ssh/tidepool_key -N ""`
2. On GitHub open the repository, then **Settings, Deploy keys, Add deploy key**. Paste the contents of
   `ssh/tidepool_key.pub`. **Leave "Allow write access" unticked.**
3. In `ssh/config` give the repository a short name (the example has `github-tidepool`) and point it at
   that key. Write that short name in `opmap.hub.json`, as in the line above.

Then make the server trust GitHub, so it cannot be tricked into talking to someone pretending to be
GitHub:

```
ssh-keyscan github.com > ssh/known_hosts
```

Compare what is in that file with the fingerprints GitHub publishes (search for "GitHub's SSH key
fingerprints") before you go on. The server refuses to talk to any host that is not in this file.

Last, the page runs as a normal user inside the container (user number 1000), so the key files must
belong to that user and nobody else:

```
sudo chown 1000:1000 ssh/tidepool_key ssh/known_hosts ssh/config
chmod 600 ssh/tidepool_key
```

## 4. Set the password

Make a password hash (this is not your password, it is a scrambled version of it):

```
docker run --rm caddy caddy hash-password
```

Type your password when it asks, then copy the line it prints into `Caddyfile`, replacing the
`REPLACE_WITH_THE_OUTPUT_OF_caddy_hash-password` text. In the same file put your own domain name instead
of `map.example.com`.

## 5. Start it

```
docker compose up -d
docker compose logs -f opmap
```

The first start clones every repository, so it can take a minute or two. The log says `hub ready` when
the page is up. Open your domain, type the user name and password from the `Caddyfile`, and you should see
a card for each project. `docker compose ps` should show the page as `healthy`.

## When something is wrong

A project that cannot be built still gets a card, and the card says why. The log has the same words.

| The card or log says | What it means | What to do |
| --- | --- | --- |
| `git could not clone ...` | The key, the address or the network is wrong | Check the `repo` line, that the deploy key is on that repository, and `ssh/known_hosts` |
| `git could not fetch ...` | It cloned once but cannot update now | Same checks; also check the `branch` exists |
| `... was cloned from a different remote` | You changed a `repo` address | Remove the cache with `docker compose down -v`, then start again |
| `The roadmap file could not be read` | The repository has no roadmap where the config says | Run `opmap doctor` in that project |
| The page asks for a password and then shows nothing | The hash is wrong | Make it again (step 4) and `docker compose restart caddy` |
| `UNPROTECTED PRIVATE KEY FILE` in the log | The key file can be read by others | `chmod 600 ssh/tidepool_key` |
| `Permission denied (publickey)` | The key does not match the repository, or cannot be read by user 1000 | Repeat step 3 for that repository, including the `chown` |

## Good to know

- **Nothing needs a backup.** Everything lives in your git repositories. The `opmap-data` volume is only a
  cache, and deleting it is safe: the next start clones again.
- **Do not publish port 4173.** Only Caddy should reach the page, and Caddy asks for the password. The
  compose file uses `expose`, not `ports`, for exactly this reason.
- **To update**, change the version number after the image name in `docker-compose.yml`, then
  `docker compose pull && docker compose up -d`.
- **The image is signed.** Each release is signed with cosign and carries build provenance and an SBOM.
  To check that an image was built from this repository's release workflow (needs
  [cosign](https://docs.sigstore.dev/cosign/system_config/installation/)):

  ```
  cosign verify ghcr.io/openprojectmap/openprojectmap:0.5 \
    --certificate-identity-regexp '^https://github.com/OpenProjectmap/openprojectmap/\.github/workflows/docker\.yml@refs/tags/v' \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com
  ```
- **Projects on the same server** (not in git) can be listed with `"path": "/projects/mine"` if you mount
  the folder into the container. If git refuses the folder ("dubious ownership"), the map still builds but
  shows no git activity. Cloning with `repo` avoids this.
