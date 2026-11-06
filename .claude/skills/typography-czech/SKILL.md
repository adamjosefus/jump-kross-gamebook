---
name: typography-czech
description: Czech typographic rules (ČSN 01 6910) — quotes „ “, dash vs hyphen, non-breaking spaces after one-letter prepositions and in numbers, units, dates and abbreviations, percent and degree spacing, numerals, slashes, © ® ™. Use whenever writing or editing Czech text (copy, UI strings, docs, articles, translations), and when asked to check, proofread or fix the typography of Czech texts or files. For CSS styling of text, use typography-css.
---

# Czech Typography

Writes Czech text correctly, and fixes existing Czech text to match. It changes typography only: characters, spaces and punctuation. It never rewrites wording, style or grammar beyond the few spelling fixes listed in [RULES.md](RULES.md) (e.g. `18ti` → `18`, `viz.` → `viz`).

The full rule set with examples is in [RULES.md](RULES.md). Read it before fixing a text.

## Two modes

- **Writing.** Whenever you produce Czech text, follow the rules from the start. Don't announce it.
- **Fixing.** When asked to check or fix Czech text, files or a folder, follow the steps below and report what changed.

## Hard Rules

1. **Only Czech text.** Leave English and other languages alone; their quote and spacing rules differ. In mixed files, fix only the Czech passages.
2. **Never touch code.** Skip code blocks, inline code, identifiers, URLs, e-mail addresses, file paths, HTML/JSX attributes and tags, front-matter keys, translation keys, ICU/printf placeholders (`{count}`, `%s`) and template syntax.
3. **Non-breaking spaces in the file's own form.** Use whatever the file already uses (`&nbsp;`, ` `, `{' '}`, the literal U+00A0 character). If it uses none, use the literal U+00A0 in plain text, Markdown and JSON, and `&nbsp;` in HTML.
4. **Pick one dash style per text.** Default to the en dash `–`. Keep the em dash `—` only if the text already uses it consistently.
5. **Ask when meaning decides.** `30 %` (thirty percent) vs `30%` (thirty-percent), `12 °` vs `12°`, and hyphen vs dash in unclear compounds depend on meaning. If the context doesn't settle it, list the case instead of guessing.

## Fixing: steps

1. Find the target files. If the user named none, ask. For UI projects, look at locale files (`cs.json`, `cs/*.po`, `messages/cs.*`) and content folders.
2. For each file, identify Czech prose and the protected regions from Hard Rule 2.
3. Apply [RULES.md](RULES.md) section by section: quotes and apostrophes, dashes and hyphens, spaces around punctuation, numbers/units/dates, non-breaking spaces, abbreviations, symbols.
4. Keep diffs minimal: change nothing but the typography, and preserve line breaks and formatting.
5. Report per file: the number of changes by kind (quotes, dashes, nbsp, …), plus any ambiguous cases left for the user, with line numbers.
