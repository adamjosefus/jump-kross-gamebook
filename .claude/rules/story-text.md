---
paths:
  - "packages/story/src/**"
---

# Text příběhu

Když píšeš nebo měníš text příběhu, který čtou hráči, dodrž tohle:

## Překlepy

Oprav překlepy a pravopisné chyby, i když se týkají jen okolí tvé změny. Význam, děj ani styl textu bez požádání neměň. Když narazíš na větší problém v ději nebo stylu, jen na něj upozorni.

## Nedělitelné mezery

Na těchto místech použij nedělitelnou mezeru (U+00A0) místo běžné, aby se text nezalomil na špatném místě:

- po jednopísmenných předložkách a spojkách: `k`, `s`, `v`, `z`, `o`, `u`, `a`, `i` (malá i velká písmena)
- mezi číslem a tím, co počítá: `30 mincí`, `5 km`, `10 %`
- v datech a řadových číslovkách: `1. 5. 2027`
- mezi zkratkou a číslem nebo jménem: `č. 5`, `p. Novák`
- mezi iniciálou a příjmením: `M. Novák`

## Vdovy a sirotci

Odstavec nesmí končit osamoceným krátkým slovem na posledním řádku. Spoj proto nedělitelnou mezerou poslední slovo s předchozím, když má poslední slovo nejvýš 5 písmen.

Kde se řádek zalomí, záleží na šířce telefonu, takže text nezkoušej ladit na konkrétní zalomení.

## Výpustka

Výpustku piš jedním znakem `…` (U+2026), nikdy třemi tečkami `...`. Na výpustku navazuje slovo bez mezery, pokud je výpustkou zakončené: `Počkej…`

## Zápis ve zdrojovém kódu

Nedělitelnou mezeru i výpustku piš přímo jako znak, ne jako escape `\\u00A0`. V editoru nejsou vidět, proto si je po úpravě ověř hledáním znaku U+00A0.
