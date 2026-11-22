# 05: Renderer

The renderer produces one HTML file that works from `file://`, from any static host, and offline.

## 1. Document skeleton

```html
<!doctype html>
<html lang="en" data-theme="auto" data-density="comfortable">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; img-src data:; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <meta name="generator" content="openprojectmap 0.2.0">
  <title>Tidepool · Project map</title>
  <style>/* styles.css + :root{--accent:#2f6fed} */</style>
</head>
<body>
  <div id="app">
    <noscript><!-- static summary, rendered at build time with escapeHtml --></noscript>
  </div>
  <script type="application/json" id="opmap-data">{…escaped ProjectData…}</script>
  <script>/* client IIFE */</script>
</body>
</html>
```

- **Data embedding**: `JSON.stringify(data)` followed by replacing `<` → `<`, `>` → `>`,
  `&` → `&`, U+2028 → ` `, U+2029 → ` `. The client reads it with
  `JSON.parse(document.getElementById('opmap-data').textContent)`.
- **Static summary** in `<noscript>`: title, Now block, and the version list with progress, built
  with a build-time `escapeHtml` (`& < > " '`). It also helps search engines and screen readers
  when scripts are blocked.
- **Hub child mode** (`mode: 'hub-child'`) adds a "← All projects" link to `../index.html`.

## 2. Client architecture (no framework)

- `h(tag, props, ...children)` creates elements. Allowed props: `class`, `id`, `role`,
  `aria-*`, `data-*`, `tabindex`, `href` (only through `safeHref`), `type`, `value`, `checked`,
  `disabled`, `for`, `name`, `viewBox` and SVG geometry attributes. `title` and `style` are not
  allowed (use the tooltip component and classes). Event listeners are attached with `onClick`-style props that must be
  functions (a string throws). Children are nodes or strings (strings become text nodes).
- `safeHref(url)`: allows `https:`, `http:`, `mailto:`, a fragment (`#…`), or relative paths that
  don't start with `//` or `\` and contain no control characters; anything else returns `null`
  and the link renders as plain text.
- **State**: `{ view, versionId?, filters: { status: Status[], q: string } }` serialised in the
  hash: `#/versions/v0.2.0?status=doing,blocked&q=timeline`. `hashchange` re-renders the view
  (a full replace of `#main`, which is fast enough at 1,000 deliverables, so no diffing).
- Files: `main.ts` (boot, theme, router), `router.ts`, `h.ts`, `safe.ts`, `rich.ts`, `theme.ts`,
  `views/*.ts` (each exports `render(data, state): Node`), `components/*.ts` (chip, progress bar,
  card, table, tooltip, tabs).

## 3. Inline rich text (`rich()`)

A tokenizer shared with `src/core/inline.ts`. Supported: `**bold**`, `*italic*` / `_italic_`,
`` `code` ``, `[text](url)`, `<https://autolink>`, bare `https://…` URLs, `~~strike~~`, and
deliverable IDs such as `0.2.0-D5`, which become internal links to that row. Everything else,
including any HTML tag, stays literal text. The output is DOM nodes only; there is no string path
to `innerHTML`.

## 4. Views

Tabs (ARIA tabs pattern): **Overview · Timeline · Versions · Decisions · History · Parked**.
Each track (v0.6, spec 02 §10) adds one tab after Versions, at `#/track/<id>` (a single block at
`#/track/<id>/<block>`). It is the Versions view of that track's blocks, with the same filters. A
hash naming a track the page does not have shows the Overview. The Timeline draws the roadmap and
then one lane per track, headed by the track's title.

### 4.1 Overview

- **Header**: project title, current version chip (state colour), `Updated <date>`, stale badge.
- **Now card**: Next step (large), Why, facts as chips, Target.
- **Progress**: the current version's bar (done / review / doing / todo / blocked segments) plus
  overall progress.
- **Milestone strip**: M1…Mn as steps showing reached (date), in progress (%) or open; click goes to
  the Timeline.
- **Needs your call**: open decisions in derived order; overdue ones show "Proceeding with default
  since the Needed-by date"; each shows the question, the default and the needed-by date.
- **Top risks**: score ≥ 6.
- **Activity**: an inline-SVG sparkline of weekly commits plus the live/staging branch heads (sha,
  date, subject).
- **Latest release** from the changelog.

### 4.2 Timeline

- Inline SVG, width = container; x axis = months (or quarters at the "quarter" zoom); rows grouped
  by phase.
- A version bar spans its window; its fill shows progress; its colour shows state (planned outline,
  active accent, shipped muted/ok); `tentative` windows are dashed.
- A milestone diamond sits at the end of the version that completes it.
- A "today" line with a label.
- Bars are focusable (`tabindex=0`, `role=link`), and Enter opens that version.
- Below the chart, an "Unscheduled" list of versions without windows.
- No chart library. Text is rendered as SVG `<text>`, so it inherits CSS variables.

### 4.3 Versions

- A list grouped by phase; each card shows id, title, window, state, progress bar, goal, exit,
  and the **latest** status line (the last one); "History" expands all status lines.
- A deliverables table: ID, title, status chip (with date/ref), owner, notes; extra columns shown;
  at narrow widths, rows become stacked cards.
- Filters: status chips (multi-select) and a text search (ID, title, notes, detail) apply across
  versions; a count is shown; empty states are explained.

### 4.4 Decisions

The decisions table (status, default, needed by, outcome) and a 3×3 risk matrix (likelihood ×
impact) with risk IDs placed in cells; a list beneath.

### 4.5 History

Releases from the changelog (version, date, title, sections), linked to their roadmap version;
git activity by area (bar list) for the last 4 weeks; branch heads.

### 4.6 Parked

A table of Item, Why, Revisit when. An explanation line: "Parked items are ideas you've decided not
to do yet. Revisit them when the condition is met."

### 4.7 "Open docs…" (v0.4)

A button in the footer opens a file picker or accepts drag-and-drop of `.md` files. The embedded
core re-parses them in the browser (roles guessed by filename: `ROADMAP`, `DECISIONS`, `CHANGELOG`)
and re-renders. Nothing leaves the browser. Git facts are unavailable there.

## 5. Theming and layout

Tokens on `:root`, redefined for dark mode:

```css
:root {
  --bg: #fbfbfa; --surface: #ffffff; --surface-2: #f3f3f1; --text: #1b1b1a; --muted: #5f5f5b;
  --border: #e3e3df; --accent: #2f6fed; --ok: #1f8a4c; --warn: #b26a00; --danger: #c2372b; --info: #3c6db3;
  --s-todo: var(--muted); --s-doing: var(--accent); --s-review: var(--info); --s-blocked: var(--danger);
  --s-done: var(--ok); --s-parked: #8a8a85;
  --radius: 10px; --gap: 16px;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root[data-theme="auto"] { /* dark values */ } }
:root[data-theme="dark"] { /* dark values */ }
body { background: var(--bg); color: var(--text); }
```

- The accent comes from config (validated `#rrggbb`); text on accent picks black or white by
  contrast ratio, computed at build time.
- The theme toggle cycles auto → light → dark and is stored in `localStorage` inside try/catch
  (it fails silently on `file://` in some browsers).
- Layout: max width 1200 px, a 16 px gutter on phones, CSS grid for cards; no horizontal page scroll
  at 360 px; wide tables scroll inside their own container.
- Status is never shown by colour alone: chips carry the word, and the timeline has a legend.
- The print stylesheet hides the tabs and prints every view in sequence.

## 6. CSP

- At build time: `sha256` of the exact inline script text and the exact style text →
  `'sha256-<base64>'` in the meta CSP.
- No `unsafe-inline` and no `unsafe-eval`. The JSON data block is not executed, so it needs no hash.
- `serve` also sends the CSP as an HTTP header, plus `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer` and `Cross-Origin-Opener-Policy: same-origin`.

## 7. Accessibility (WCAG 2.2 AA)

- Landmarks (`header`, `nav`, `main`, `footer`), one `h1`, a logical heading order.
- Tabs: arrow keys move between tabs, Home/End jump, `aria-selected`, `aria-controls`.
- Visible focus rings (`:focus-visible`, 2 px accent outline + offset).
- Contrast ≥ 4.5:1 for text and ≥ 3:1 for UI, in both themes (checked in CI with axe).
- `prefers-reduced-motion`: no transitions.
- The SVG timeline has `role="img"` with an `aria-label` summary, plus the focusable bars.
- Tested in CI: Playwright + `@axe-core/playwright` on every view, light and dark.

## 8. i18n (v0.6)

UI strings live in `client/i18n/en.ts` (a key → string map); the page language comes from config
`locale` (default `en`, a tag like `ar` or `pt-BR`). The renderer sets `<html lang>` and, for a
right-to-left language (ar, he, fa, ur, ps, sd, ug, yi, ckb, dv), `dir="rtl"`; the client reads the
language from `<html lang>`. The layout uses logical properties (`margin-inline-start`) so RTL
needs no rewrite; the timeline chart stays left to right. A translation is `client/i18n/<tag>.ts`
with a subset of the keys (a missing key shows English); `{name}` placeholders must match, and plural
keys end in `.one`/`.other` and are chosen with `Intl.PluralRules`. Dates are formatted with
`Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })`, except in English, which
keeps the ISO form the documents use. Two locales are generated from English for tests: `en-XA`
(accented, 30% longer) and `ar-XB` (right to left). The hub index page is English only.
