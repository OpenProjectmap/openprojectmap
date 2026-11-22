# Translate the map into your language

The map's interface (tab names, headings, buttons, messages) lives in one file of English text.
A translation is another file with the same keys. You do not need to be a programmer: if you can
edit a text file and open a pull request, you can add a language.

## What the language setting does

Set the language of a project's map in `opmap.config.json`:

```json
{ "locale": "ar" }
```

- The page's `lang` is set to it, and right-to-left languages (Arabic, Hebrew, Persian, Urdu and
  a few more) also get `dir="rtl"`, so the layout mirrors.
- Dates are shown in that language's usual form (English keeps `2026-11-25`, the form used in the
  documents). The timeline's month names follow too.
- The interface uses the translation for that language when there is one, and English otherwise.
  `opmap doctor` tells you which it is.

Your roadmap's own text is never translated: it is shown as you wrote it.

## Add a language

1. Copy `src/render/client/i18n/en.ts` to `src/render/client/i18n/<tag>.ts` (for example `pt-BR.ts`
   or `ar.ts`), keep only the `export const` line's shape, and translate the values:

   ```ts
   import type { Messages } from './en.js';
   export const ar: Messages = {
     'tab.overview': 'نظرة عامة',
     // ...
   };
   ```

2. Leave out any key you are not sure about: it falls back to English.
3. Keep every `{name}` exactly as it is; it is filled in at run time. Plural messages have a
   `.one` and a `.other` form (add `.zero`, `.two`, `.few` or `.many` if your language needs them).
4. Register it in `src/render/client/i18n/index.ts`: one `import` and one line in `TRANSLATIONS`.
5. Run `pnpm test`. A test checks that you used only existing keys and the same placeholders.
6. Open a pull request. A second native speaker's review is how we keep translations good; we do
   not add machine translations without one.

## Test the layout without a translation

Two built-in test languages need no files: set `"locale": "en-XA"` to see accented, longer
English (it shows text that is cut off, and text that does not come from the catalogue), and
`"locale": "ar-XB"` to see right-to-left layout with English-like text.

The projects index page made by `opmap hub` is in English for now.
