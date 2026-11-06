---
name: typography-css
description: CSS rules for how text renders — wrapping, hyphenation, vertical trim, underlines, numerals, quotes, variable fonts, and how to scope them so they stay overridable. Use whenever writing, editing or reviewing CSS that styles text (font-*, text-*, line-height, headings, prose, links, tables of numbers). To add a full text reset to a project, run /typography-css-reset instead. For how Czech text itself is written, use typography-czech.
---

# CSS Text

Rules for styling text with modern CSS. Apply them whenever you touch text styling; flag violations you notice in code you're editing.

## Hard Rules

1. **Progressive enhancement only.** Every property below must degrade to acceptable text when unsupported. Never make layout or meaning depend on `text-box`, `text-wrap`, `hanging-punctuation`, hyphenation or font features.
2. **Never put a possibly-unsupported selector in a plain selector list.** One unknown selector (e.g. `:heading`) drops the whole rule, including `p` and `li`. Wrap it in `:is()`/`:where()` (forgiving lists) or guard with `@supports selector(...)`.
3. **Defaults go in `:where()`** (zero specificity) or the lowest `@layer`, so one class can override them. Use `:is()` only to shorten a selector list where normal specificity is intended.
4. **Prose rules stay scoped to prose** (`.prose`, article body, CMS content). Hyphenation, text-box trim, old-style numerals and a reading measure break app UI (buttons, tables, nav, forms).
5. **Never hyphenate** code (`pre, code, kbd, samp, var`), headings, URLs, or identifiers.
6. **Don't hard-code quote characters** in content for `<q>`. Set the correct `lang` and let `quotes: auto` (the initial value) pick locale quotes. Override `quotes` only when the default is wrong, and then use typographic quotes (`“ ” ‘ ’`, `« »`), never straight `" '`.
7. **Don't fight user text size.** Use `text-size-adjust: 100%`, not `none`. Size type in `rem`, not `px`.

## Wrapping

- Headings, blockquotes, captions: `text-wrap: balance` (short blocks, a few lines).
- Paragraphs and list items: `text-wrap: pretty` (avoids a lone last word without rebalancing the block).
- Editable text (`[contenteditable]`, textareas): `text-wrap: stable`, so earlier lines don't reflow while typing.
- Reading measure for prose: `max-inline-size: 65ch` on `p, ul, ol, dl` (whole lists, not `li`, so bullets line up).
- No JavaScript orphan/widow fixers when `text-wrap` covers it.

## Vertical trim

`text-box: trim-both cap alphabetic` removes half-leading above caps and below the baseline, so text aligns flush with neighbouring boxes. Use it instead of negative margins, in prose or in components where optical alignment matters (icon + label, cards). It changes spacing, so don't add it globally to an existing design without checking.

## Hyphenation (prose only)

- Requires a correct `lang` attribute: the browser uses that language's dictionary.
- Declare the standard and Safari's prefixed properties together:
  `hyphens: auto; -webkit-hyphens: auto; hyphenate-limit-chars: 6 3 3; -webkit-hyphenate-limit-before: 3; -webkit-hyphenate-limit-after: 3;`
- `hyphenate-limit-chars: 6 3 3` means: only words of 6+ characters, at least 3 before and 3 after the break.

## Links

`text-decoration-thickness: from-font; text-underline-offset: 0.15em; text-decoration-skip-ink: auto;`: use the font's own underline thickness, keep the underline clear of descenders, and break it around them.

## Numerals and font features

- Tables, prices, stats, counters, timers: `font-variant-numeric: tabular-nums lining-nums`, so digits line up and don't jitter when values change.
- Running prose (only if the font supports it): `oldstyle-nums proportional-nums`.
- `font-kerning` and common/contextual ligatures are on by default. Don't redeclare them; never disable them on body text.
- `font-synthesis: none` only when every weight and style used is actually loaded. Otherwise bold/italic silently disappear.
- Real sub/superscripts (`font-variant-position: sub|super` with `vertical-align: baseline; font-size: 100%`) only after verifying the font has those glyphs. Most fonts have them for digits only. Guard with `@supports (font-variant-position: sub)`.
- Emoji presentation (`font-variant-emoji: emoji|text`) is set per component, never on `body`.

## Fonts and fallbacks

- `font-size-adjust: from-font` on `body` keeps fallback fonts close to the web font's x-height, reducing the shift when the web font loads.
- Mixing a monospace font into body text: use the `size-adjust` descriptor in its `@font-face` to match x-heights, rather than changing `font-size` everywhere it's used.

## Optical weight in dark mode

Light text on a dark background looks heavier than dark text on light at the same weight (irradiation: bright strokes appear to spread into the dark surround). Text should look equally heavy in both schemes, so reduce weight in dark mode, in this order of preference:

1. **Grade axis (`GRAD`), if the font has one.** Lower it in dark mode, e.g. `-25` to `-50` (check the font's axis range). Grade changes stroke thickness without changing glyph widths, so nothing reflows when the theme switches.
2. **Weight axis (`wght`), if the font is variable but has no grade.** Lower it by about 50: 400 → 350, 700 → 650. Widths change, so text may rewrap when the theme switches. That's acceptable, but check tight UI (buttons, tabs, truncation).
3. **Static fonts:** don't swap to a lighter file just for dark mode. Reduce glare instead: use off-white on off-black, never pure `#fff` on `#000`.

- Apply it with the same switch the project uses for dark mode (`prefers-color-scheme`, `[data-theme="dark"]`, `.dark`), not only the media query.
- Drive it with one custom property (`--font-grade` / `--font-weight-shift`) set on `:root`. Set `font-variation-settings` on `body` so it inherits, never on `*`.
- `font-variation-settings` replaces rather than merges: a component that sets its own must repeat the grade value.
- The numbers are a starting point, not a standard. Compare both schemes side by side and tune by eye.

## Punctuation

`hanging-punctuation: first allow-end last` on prose blocks hangs opening and closing punctuation outside the text edge. Optional polish with limited support; never rely on it.

## Before shipping

- Check support for each property against the project's browser targets (MDN / Can I use). Several of the properties above ship in only some engines.
- Test with long words, long unbroken strings (URLs), RTL/other `lang` values and 200% zoom.
