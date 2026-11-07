# Text příběhu na obrazovce hráče

Jak aplikace hráčům ukazuje text příběhu: jak se objevuje, jak se sází a kdy smí hráč pokračovat. Kód je v `apps/web/src/features/player/story-text/` a v `apps/web/src/features/player/node-screens.tsx`.

## Postupné zobrazení

Text se objevuje slovo po slovu, každé slovo se plynule rozsvítí. Rychlost sleduje křivku tvaru S: první a poslední slova přicházejí pomalu, prostřední rychleji, ale vždy jedno po druhém.

| Situace                            | Pauza před prvním slovem | Rozsvícení slova | Nejdelší doba celého textu |
| ---------------------------------- | ------------------------ | ---------------- | -------------------------- |
| Běžně                              | 500 ms                   | 1 100 ms         | 6,5 s                      |
| Text, který hráč viděl před chvílí | 0 ms                     | 100 ms           | 150 ms                     |
| Obrazovka, kterou už tým viděl     | celý text hned           | —                | —                          |
| Systémové nastavení „omezit pohyb“ | celý text hned           | —                | —                          |

Dlouhý text se zrychlí tak, aby se celý objevil do 6,5 sekundy.

## Tlačítka

Tlačítka pod textem (šipka dál, volby, „Konec hry“) jsou skrytá, dokud se neobjeví poslední slovo textu. Hráč tak nepokračuje, dřív než text dočte. Místo pro ně je vyhrazené od začátku, takže se text při jejich zobrazení neposune.

Jakmile je text celý, tlačítka se plynule objeví (0,3 s) a ještě 0,5 s zůstanou neaktivní a poloprůhledná. Teprve potom se dají stisknout. Klepnutí určené textu nebo tlačítku předchozí obrazovky tak nepadne omylem na nové tlačítko.

Platí to na každé obrazovce, i na té, kterou už tým viděl a jejíž text se ukáže hned.

## Žádné přeskakování a žádné nápovědy

Klepnutí na text nic nedělá: text se nedá zobrazit celý najednou a hráč počká, až se objeví sám. Text na obrazovce hráče ani v potvrzovacím dialogu nejde označit a dlouhé podržení neotevře žádnou nabídku. Pod textem ani jinde na obrazovce se nezobrazuje žádná nápověda typu „Klepnutím zobrazíte celý text“.

Do obrazovky s textem příběhu nepřidávej žádné pomocné ani vysvětlující texty, které nejsou v příběhu, ani nové interakce. Když se zdá, že by něco takového pomohlo, nejdřív se zeptej.

## Sazba

Text se nesází prohlížečem, ale knihovnou Pretext ještě před vykreslením. Řádky jsou tak známé dopředu a nic se nepřeskupuje, zatímco se slova objevují.

- Text je zapsaný v Markdownu: nadpisy, odstavce, citace, odrážky, tučné písmo, kurzíva a vložený kód.
- Písmo je Noto Serif (u některých motivů zúžený řez). Než se načte, text se neukáže; po 4 sekundách se ukáže v náhradním písmu a po načtení správného písma se znovu vysází.
- Každý motiv (`default`, `intro`, `green`, `red`, `letter`, `description`) má vlastní velikost, zarovnání a zalamování. Například `intro` řádky vyrovnává na podobnou délku, `letter` zarovnává do bloku.
- Světlý text na tmavém pozadí má nižší váhu a mírně větší rozestupy písmen, aby nepůsobil tučněji.
- Nedělitelné mezery z textu příběhu se dodrží, řádek se na nich nezalomí. Pravidla pro psaní textu jsou v `.claude/rules/story-text.md`.
