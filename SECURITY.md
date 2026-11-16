# Security policy

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** ("Security" tab → "Report a
vulnerability"). Don't open a public issue. We aim to reply within 7 days and to ship a fix for
confirmed high-severity issues within 30 days.

## In scope

- Script execution or HTML injection in a generated map, caused by document, config or git content.
- Reading files outside the repository root through config paths or symlinks.
- Command injection through git refs, config values or the GitHub Action inputs.
- `opmap serve` serving files outside its output directory, or other path traversal.
- Supply-chain issues in the published npm package or Docker image.

## Out of scope

- A map you chose to publish publicly showing what your own docs contain.
- Denial of service caused by a config you wrote yourself (for example a slow `idPattern` regex).

The threat model is in [docs/spec/07-security.md](docs/spec/07-security.md).
