---
name: typography-css-reset
description: Adds a modern CSS text reset to the current project — balanced and pretty wrapping, link underlines, tabular numbers, and a scoped prose layer with hyphenation and text-box trim — adapted to the project's fonts, tokens and stylesheet setup.
disable-model-invocation: true
---

# CSS Text Reset

Installs [reset.css](reset.css) into the current project, adapted to it. It does not restyle the existing design; it adds overridable defaults.

## Hard Rules

1. **Adapt, don't paste.** The file is a starting point. Every OPTIONAL section must be kept or removed based on the project's actual fonts.
2. **Reuse existing tokens.** If the project already has a type scale, measure or prose class, map the reset onto those names instead of adding parallel ones.
3. **Keep it overridable.** Everything stays in `:where()`. If the project uses `@layer`, put the reset in the lowest layer (e.g. `reset` or `base`).
4. **Don't change existing visuals silently.** If a rule would alter spacing or wrapping of existing components (text-box trim, measure), list it in the summary.

## Steps

1. **Find the stylesheet setup.** Global CSS entry (e.g. `globals.css`, `app.css`, `main.scss`), any existing reset (`modern-normalize`, Tailwind preflight, custom), `@layer` order, and CSS framework.
2. **Check `lang`.** Confirm `<html lang="…">` is set and correct. Hyphenation and quotes depend on it. If it's missing, add it or flag it.
3. **Inspect the fonts.** For each family, check whether it's variable, which axes it has (`GRAD`, `wght`) and their ranges, whether it has old-style figures, and whether it has sub/superscript glyphs (font files, the foundry page, or the Google Fonts axis list). Remove the OPTIONAL blocks that don't apply. For dark-mode weight, keep variant A if the font has `GRAD`, else variant B if it has `wght`, else neither.
4. **Find the dark-mode switch** (`prefers-color-scheme`, `[data-theme="dark"]`, `.dark`, …) and use it in place of the media query in the dark-mode block.
5. **Map tokens and scope.** Rename `--measure` to the project's existing token if there is one. Replace `.prose` with the project's prose/content class (or Tailwind Typography's `.prose` if present).
6. **Write the file** next to the other global styles and import it right after the existing reset, before component styles.
7. **Tailwind:** put the rules in `@layer base` and don't duplicate what preflight already sets.
8. **Verify** in the browser if the project can run: a prose page and a dense UI screen, light and dark, at 200% zoom.

## Summary to the user

End with: the file path, where it's imported, which OPTIONAL sections were kept or removed and why, and any existing components whose spacing or wrapping changed.
