# Czech Typographic Rules

Based on ČSN 01 6910 (2014) and the Internetová jazyková příručka ÚJČ AV ČR. In the examples, `⍽` marks a non-breaking space (U+00A0). Write the real character or entity, never `⍽`.

## Quotes and apostrophes

| Use            | Correct                                 | Wrong                  |
| -------------- | --------------------------------------- | ---------------------- |
| Primary quotes | „text“ (U+201E, U+201C)                 | "text", “text”, ”text” |
| Nested quotes  | „venku ‚uvnitř‘ venku“ (U+201A, U+2018) | „venku „uvnitř“ venku“ |
| Alternative    | »text« (reversed French)                |                        |
| Apostrophe     | ’ (U+2019): lek’, O’Reilly              | '                      |

- `"` is only for inches, seconds or code. Leave it in code, measurements and coordinates.
- Punctuation goes **inside** the quotes when the whole sentence is quoted: „Ano, to je ona.“
- Punctuation goes **outside** when only a word or phrase is quoted: tzv. „uvozovek“. The same applies to parentheses.
- No spaces inside quotes or parentheses: (z udírny), not ( z udírny ).

## Dash vs hyphen

**Hyphen `-`** joins parts of one expression and never has spaces around it: chcete-li, Brno-město, česko-anglický, Anežka Hodinová-Spurná, e-mail, on-line, ISBN 3-8252-2197-0.

**En dash `–`** (one style per text, see SKILL.md):

| Meaning                          | Spacing                                | Example                                      |
| -------------------------------- | -------------------------------------- | -------------------------------------------- |
| Pause, inserted phrase           | spaces around; no line break before it | ale⍽– jak se dalo čekat⍽– přednášející       |
| Range "od–do", "až"              | no spaces                              | 8.00–20.00, 70–90 kg, 1900–1974              |
| "versus", relation               | no spaces                              | Česko–Maďarsko, trasa Praha–Berlín           |
| Range of multi-word items        | spaces around                          | 12. září – 15. října 2000 (but 12.–13. září) |
| Whole money amount               | —                                      | rarely; prefer 50 Kč over 50,– Kč            |
| Bullet or repeated item in lists | dash + nbsp                            | –⍽sádlo                                      |

- Punctuation directly after a dash, with no space: nebo⍽–!
- A spaced dash must not start a line: put a non-breaking space before it.
- A range dash (`8–20`) must not end or start a line. If a reflowing layout can't guarantee that, write it in words: 8 až 20.
- Never use a hyphen `-` for any dash role, and never `--`.

## Spaces around punctuation

- `. , : ; ? !` attach to the preceding word, followed by a normal space.
- Two marks in a row get no space between them: „Ano!“, atd.).
- A sentence ending in an abbreviation gets one period, not two: …klobásky atd.
- A colon as a math operator gets spaces on both sides: 4⍽:⍽2⍽=⍽2. As a score or time, no spaces: 2:1, 22:12,56.
- Ellipsis is the single character `…` (U+2026), not `...`. Attach it to a truncated word; put a space after it when it stands for omitted words („… a tyto“).

## Slash

- No spaces around it: 65 km/h, 2000/2001, strana 1/4. Abbreviations around a slash lose their period.
- Spaces on both sides when it separates multi-word items: šunka / ovarové koleno / líčko.

## Numbers

- Thousands separator is a non-breaking space: 29⍽000, 10⍽000⍽€. Not in years (1989) or codes.
- Decimal separator is a comma: 3,14 (not 3.14 in Czech prose).
- Ordinals take a period: 16. řada.
- Number + suffix: write **18 let**, never 18ti or 18-ti. Compounds attach directly: 19letý, 5hodinový, 22letý.
- Sub/superscripts use real formatting or Unicode (H₂O, m²), not H2O or m2, where the format allows.

## Units, percent, degrees, money

| Meaning         | Correct                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| Noun (quantity) | 30⍽% (třicet procent), 4⍽‰, 155⍽m, 7⍽°C                                    |
| Adjective       | 30% (třicetiprocentní), 2km (dvoukilometrový), 12° pivo (dvanáctistupňové) |
| Angle           | 45° (no space), 75°26′40″ (prime ′ and double prime ″, not quotes)         |
| Money           | 50⍽Kč, 50,00⍽Kč, 10⍽000⍽€, Kč⍽50,00; avoid 50,– Kč and 50,— Kč             |

## Dates and times

| Use           | Correct                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| In text       | 6.⍽12.⍽2014, 9.⍽září⍽2015                                                |
| Records, data | 2015-05-01 (ISO, hyphens)                                                |
| Time          | 15.30 or 15:30 (pick one per text); with seconds and hundredths 22:12,56 |
| Year          | 1989 (no space)                                                          |
| Life dates    | *⍽1900, †⍽1974, or 1900–1974                                             |

## Non-breaking spaces

Put a non-breaking space where a line must not break:

- after one-letter prepositions and conjunctions: k, s, v, z, o, u, a, i (and capitals K, S, V, Z, O, U, A, I): v⍽Praze, a⍽proto
- between a number and its unit or currency: 155⍽m, 20⍽Kč, 30⍽%
- inside dates: 12.⍽7.⍽1982
- inside multi-part abbreviations: s.⍽r.⍽o., a.⍽s.
- after an initial or title: A.⍽Lustig, Ing.⍽Kopal
- in thousands separators: 29⍽000
- before a spaced dash, and after a list/dialogue dash
- after `©` and before `§`/`č.` + number: ©⍽Firma, §⍽5, č.⍽3

## Abbreviations

- **viz** has no period. It is a verb (imperative of "vidět"), not an abbreviation.
- Legal forms are spaced: a.⍽s., s.⍽r.⍽o., spol.⍽s⍽r.⍽o., k.⍽s., v.⍽o.⍽s. The unspaced form (s.r.o.) is acceptable only when copying an official registered company name.

## Symbols

- `©` goes before the owner's name, followed by a space: ©⍽Název firmy, 2015.
- `®` and `™` attach directly after the name: LOGO®, LOGO™.
- Multiplication sign `×` (2⍽×⍽3, 1920×1080), not `x`; minus `−` in math, not a hyphen.
