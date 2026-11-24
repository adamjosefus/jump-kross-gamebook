# Měření času hry

Nikde neběží časovač ani plánovač. Server si jen zapisuje okamžiky, a časy z nich počítá, až když se na ně organizátor podívá.

## Co se zapisuje

- **Začátek hry týmu** je první přihlášení týmu kódem klanu po tom, co organizátoři hru spustili. Další přihlášení, ze stejného i z jiného zařízení, začátek nemění.
- **Konec hry týmu** je okamžik, kdy tým dojde do závěrečného uzlu příběhu, ať volbou, nebo naskenováním kódu.
- **Kroky** týmu: každá volba a každý sken s okamžikem, kdy se stal, a uzlem, kam tým došel.
- **Čtení** hlásí telefony: jak dlouho byl na viditelné stránce text kterého uzlu příběhu. Obrazovka se skenerem se nepočítá, s tou tým jde na další stanoviště, a závěrečný uzel taky ne, hra už skončila. Čtení se ořízne na dobu hry; co přesahuje konec, se nepočítá. Telefon se starší verzí aplikace uzel neposílá; jeho čtení se připíše uzlu, kde tým podle kroků byl. Jedna obrazovka se počítá nejvýš 5 minut a čte-li víc telefonů týmu najednou, počítá se to jednou. Bez signálu čas počká v telefonu a odešle se později.

Telefon neposílá svůj čas, ale „jak dlouho“ a „před jak dlouhou dobou“; okamžik určí server. Špatně nastavené hodiny v telefonu tak výsledek nezkreslí.

## Tři časy

| Čas           | Jak vzniká                                     |
| ------------- | ---------------------------------------------- |
| Celkový čas   | konec − začátek; u týmu na cestě teď − začátek |
| Čas čtení     | součet čtení mezi začátkem a koncem            |
| Čas bez čtení | celkový čas − čas čtení (cesta a úkoly)        |

Všechny tři jsou v administraci na stránce Živě v panelu „Klany“, kde se podle nich dá i řadit, a ve výsledcích zkopírovaných jako CSV nebo JSON. Při řazení podle času jsou týmy v cíli vždy před týmy na cestě, protože jejich čas už se nemění.

## Stanoviště, role kódů a kapitoly

Příběh (`packages/story/src/story.ts`) může čas týmu dělit podrobněji:

- **Stanoviště** (`stations`) jsou místa, kde tým plní úkol, třeba `bakery: 'Pekárna'`.
- **Role kódu** říká, co sken znamená pro čas. Kód zapsaný jen názvem (`4: 'Autobusová zastávka'`) je **navigační**: jen ukazuje cestu. Kód `{ name, role: 'arrival', station }` je **příchod**: visí na stanovišti a jeho sken začíná úkol. Kód `{ name, role: 'reward', station }` je **odměna**: dá ho týmu organizátor stanoviště po splnění úkolu a jeho sken úkol končí. Každé stanoviště potřebuje kód příchodu i odměny.
- **Kapitoly** (`chapters`) jsou pojmenované části příběhu. Uzel do kapitoly patří vlastností `chapter`; uzly bez ní jsou v přehledech jako „Bez kapitoly“.

Kontrola příběhu (`pnpm test:story`) ohlásí kód neznámého stanoviště, stanoviště bez příchodu nebo odměny, uzel neznámé kapitoly a kapitolu bez uzlů.

## Čtení, cesta a úkol

Čas týmu od začátku do konce se skládá ze tří druhů úseků:

- **Čtení**: telefon hlásí, že je vidět text příběhu. Čtení má přednost: když tým čte během cesty nebo úkolu, počítá se ta chvíle jako čtení. Při čtení tedy herní čas stojí.
- **Úkol**: od skenu kódu příchodu do skenu kódu odměny, bez čtení. Patří stanovišti z kódu příchodu.
- **Cesta**: všechno ostatní, včetně navigačních kódů. Cesta, která skončí příchodem na stanoviště, patří i tomu stanovišti.

Úseky se sčítají po uzlech (jen čtení), po kapitolách (čtení, cesta a úkol podle uzlu, ve kterém tým byl) a po stanovištích (úkol a cesta k němu). Součet všech úseků je celkový čas a součet čtení je čas čtení. Návrat na start (restart týmu nebo nová hra) i přesun týmu organizátorem do jiného uzlu (třeba když se ztratila karta odměny) případný úkol ukončí; pouhá oprava stavu, při které tým zůstane v uzlu, úkol nechá běžet. Okamžik mezi prvním přihlášením a přesunem na start patří startovnímu uzlu.

## Kde se to ukazuje

- **Telefon hráče**: když se počítá čas čtení, má horní okraj obrazovky barevný pruh. Neukazuje žádné číslo ani text, jen dává týmu najevo, že čte v klidu a herní čas mu stojí.
- **Živě, panel „Klany“**: u týmu na cestě štítek „Cesta“, u týmu na stanovišti „Úkol: Pekárna“, vždy s tím, jak dlouho to trvá. Čtení se tu neukazuje, protože ho telefony hlásí až po dočtení obrazovky. Panel „Kroky“ u skenu ukazuje název a roli kódu, třeba „příchod: Pekárna (kód 1)“.
- **Stránka Časy**: tabulka týmy × kapitoly (celkem a pod tím čtení · cesta · úkol), nebo týmy × stanoviště (úkol a cesta k němu). Zeleně je nejrychlejší a červeně nejpomalejší tým v cíli; týmy na cestě se do toho nepočítají, protože jejich čas ještě není konečný.
- **Graf příběhu** (stránky Příběh, Test a Živě): uzly jedné kapitoly jsou pohromadě v rámečku v barvě kapitoly a s jejím názvem. Šipky skenů kódů stanovišť mají ikonu dveří (příchod) nebo dárku (odměna).
- **Tisk QR kódů**: karta kódu příchodu nebo odměny má pod názvem malým písmem „Příchod · Pekárna“ nebo „Odměna · Pekárna“, aby organizátoři karty nepopletli.

## Kdy se čas vynuluje

- **Nová hra** („Smazat postup“ na stránce Hra) vynuluje čas i postup všem týmům.
- **Restartovat hru** v dialogu týmu vynuluje čas i postup jednomu týmu.
- **Vynulovat čas** v dialogu týmu vynuluje jednomu týmu jen čas a čtení; postup mu zůstane. U týmu v cíli to nejde. Vynulování se zapíše do panelu „Kroky“.

Ve všech třech případech se telefony týmu odhlásí a čas se rozběhne, až tým znovu naskenuje svůj kód. Po nové hře to jde až poté, co organizátoři hru znovu spustí.

## Výsledky

CSV i JSON mají anglické názvy. CSV: `id`, `team`, `node_id`, `finished`, `started_at`, `finished_at`, časy `playtime`, `story` a `live_action` jako `h:mm:ss`, tytéž v sekundách jako `playtime_s`, `story_s` a `live_action_s`. Za nimi pro každou kapitolu `chapter_<id>_s`, `chapter_<id>_story_s`, `chapter_<id>_travel_s` a `chapter_<id>_task_s` (uzly bez kapitoly jako `no_chapter_s`, `no_chapter_story_s` atd.), pro každé stanoviště `station_<id>_travel_s` a `station_<id>_task_s`, a nakonec sloupec `state_<klíč>` pro každou hodnotu stavu. JSON: `id`, `name`, `nodeId`, `finished`, `startedAt`, `finishedAt`, `playtimeDuration`, `storyDuration`, `liveActionDuration`, `chapters` (podle id kapitoly `duration`, `storyDuration`, `travelDuration` a `taskDuration`; uzly bez kapitoly pod klíčem `""`), `stations` (podle id stanoviště `travelDuration` a `taskDuration`) a `state`. Každý tým má v JSON všechny klíče, všechny kapitoly i všechna stanoviště. Časy jsou vždy celé sekundy, u týmu, který se nepřihlásil, nula. Co ještě není známé (u týmu, který se nepřihlásil, uzel a začátek, u týmu na cestě konec), má hodnotu `null`; v CSV je taková buňka prázdná.

Časy po kapitolách a stanovištích se načítají zvlášť, každých 15 sekund; u týmu na cestě proto mohou za celkovým časem o chvíli zaostávat.
