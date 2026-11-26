# Měření času hry

Nikde neběží časovač ani plánovač. Server si jen zapisuje okamžiky, kdy tým začal, kam a kdy došel a kdy skončil, a časy z nich počítá, až když se na ně organizátor podívá. Telefony samy nic neměří.

## Co se zapisuje

- **Začátek hry týmu** je první přihlášení týmu kódem klanu po tom, co organizátoři hru spustili. Další přihlášení, ze stejného i z jiného zařízení, začátek nemění.
- **Konec hry týmu** je okamžik, kdy tým dojde do závěrečného uzlu příběhu, ať volbou, nebo naskenováním kódu.
- **Akce** týmu: každá volba, každý sken a každý zásah organizátora, s okamžikem, kdy se stal, a uzlem, kam tým došel. Časy se počítají z akcí od posledního návratu týmu na start; starší akce zůstávají jen v záznamu.

## Kapitoly

Autor příběhu může uzly seskupit do **kapitol** (`chapters` v `packages/story/src/story.ts`, u uzlu vlastnost `chapter`). U kapitoly určí, jestli se její čas **počítá do výsledku**: `home: 'Doma'` se počítá, `home: { name: 'Doma', counts: false }` ne. Nepočítaná kapitola se hodí třeba pro úvod nebo pauzu na oběd.

Uzly bez kapitoly leží **mezi kapitolami**. Čas strávený v nich je mezera mezi kapitolou, ze které tým odešel, a kapitolou, do které přišel, třeba „Nákup → Večeře“. Mezera před první kapitolou začíná „Start“, mezera po poslední (nebo ta, ve které tým zrovna je) končí „konec“. Mezera se do výsledku počítá vždy.

## Časy

| Čas                     | Jak vzniká                                                    |
| ----------------------- | ------------------------------------------------------------- |
| Celkový čas             | konec − začátek; u týmu na cestě teď − začátek                |
| Čas kapitoly            | součet doby, kterou tým strávil v uzlech kapitoly             |
| Čas mezi kapitolami     | doba v uzlech bez kapitoly, zvlášť pro každou dvojici kapitol |
| Výsledný čas (výsledek) | celkový čas − čas kapitol, které se nepočítají                |

Kapitoly a mezery dohromady dávají přesně celkový čas. Když se tým do kapitoly vrátí (třeba ho tam přesune organizátor), časy se sečtou. Podle výsledného času se týmy řadí.

## Kde se to ukazuje

- **Telefon hráče:** v nepočítané kapitole svítí uprostřed horní lišty žlutá kapsle s knížkou. Říká hráčům, že čas stojí. Jinde se neukazuje nic.
- **Živě, panel „Klany“:** u každého klanu štítek s kapitolou, ve které tým je (nebo „Mezi kapitolami“), a jak dlouho tam je; u nepočítané kapitoly s poznámkou „nepočítá se“. Pod ním celkový čas a výsledek. Dobu na štítku počítá server, takže nezáleží na hodinách počítače organizátora.
- **Stránka Časy:** tabulka týmů s výsledkem, celkovým časem a sloupcem pro každou kapitolu a každou mezeru v pořadí, jak jdou příběhem. Zeleně je nejrychlejší a červeně nejpomalejší tým v cíli (s tímtéž slovem pod časem); týmy na cestě se do toho nepočítají, protože jejich čas ještě není konečný.
- **Graf příběhu:** kapitoly jsou v rámečcích s názvem kapitoly vlevo; nepočítaná kapitola má čárkovaný rámeček a u názvu „nepočítá se“.

## Kdy se čas vynuluje

- **Nová hra** („Smazat postup“ na stránce Hra) vynuluje čas i postup všem týmům.
- **Restartovat hru** v dialogu týmu vynuluje čas i postup jednomu týmu.
- **Vynulovat čas** v dialogu týmu vynuluje jednomu týmu jen čas; postup mu zůstane. U týmu v cíli to nejde. Vynulování se zapíše do panelu „Akce“.

Ve všech třech případech se telefony týmu odhlásí a čas se rozběhne, až tým znovu naskenuje svůj kód. Po nové hře to jde až poté, co organizátoři hru znovu spustí.

## Výsledky

„Kopírovat výsledky“ na stránce Živě zkopíruje výsledky jako CSV nebo JSON s anglickými názvy.

- **CSV:** `id`, `team`, `node_id`, `finished`, `started_at`, `finished_at`, časy `playtime` a `result` jako `h:mm:ss`, tytéž v sekundách jako `playtime_s` a `result_s`. Za nimi sloupec `chapter_<id>_s` pro každou kapitolu, `gap_<odkud>_<kam>_s` pro každou mezeru (začátek hry je `start`, konec `end`) a nakonec `state_<klíč>` pro každou hodnotu stavu.
- **JSON:** `id`, `name`, `nodeId`, `finished`, `startedAt`, `finishedAt`, `playtimeDuration`, `resultDuration`, `chapters` (sekundy podle id kapitoly), `gaps` (sekundy podle `odkud>kam`, se `start` a `end`) a `state`.

Každý tým má všechny klíče, všechny kapitoly i všechny mezery, kterými prošel aspoň jeden tým. Časy jsou vždy celé sekundy, u týmu, který se nepřihlásil, nula. Co ještě není známé (u týmu, který se nepřihlásil, uzel a začátek, u týmu na cestě konec), má hodnotu `null`; v CSV je taková buňka prázdná.

Časy po kapitolách se načítají zvlášť, každých 15 sekund; u týmu na cestě proto mohou za celkovým časem o chvíli zaostávat.
