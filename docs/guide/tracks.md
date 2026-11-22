# Plan more than code with tracks

A **track** is a second (or third) roadmap file for work that is not code: finding customers,
launching, marketing, hiring. It has its own tab on the map and its own lane in the timeline, so
the whole plan sits on one page. The product roadmap stays the one with the Now block.

The `examples/two-tracks` folder is a finished example (a fictional flashlight app with a product
roadmap and a business track). Build it to see the result:

```bash
npx openprojectmap build -C examples/two-tracks --open
```

## 1. Write the track file

A track file looks like a roadmap without the Now block. Its blocks can have any short name you
like. Here they are `BM0`, `BM1` and so on ("business milestone"):

```markdown
<!-- opmap: 1 -->
# Lantern: Business track

### BM1 — Launch

**Window:** 2026-11-16 → 2027-01-31
**Goal:** The app is in the store and people find it.
**Exit:** 1,000 installs in the first month.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| BM1-S1 | **Store listing** and screenshots | doing | Needs v0.2.0 |
| BM1-S2 | **Launch post** on two forums | todo | |
```

A block counts as done when every row is done, so you do not need a changelog for a track.

## 2. Tell the tool about it

Add the track to `opmap.config.json`:

```json
"tracks": [
  {
    "id": "business",
    "title": "Business",
    "file": "docs/project/BUSINESS.md",
    "blockPattern": "^(?<id>BM\\d+) +[—–-] +(?<title>.+)$",
    "idPattern": "^(?<version>BM\\d+)-S\\d+$"
  }
]
```

- `id` is a lower-case word used in the link (`#/track/business`).
- `blockPattern` says what a block heading looks like. It needs the two named groups `id` and
  `title`. Leave it out to use the version style (`v0.3.0 — Title`).
- `idPattern` says what a row ID looks like. With a `version` group, the tool also checks that a
  row sits under the block its ID names.

Row IDs must be different across all your files. `opmap check` tells you when two rows share one.
