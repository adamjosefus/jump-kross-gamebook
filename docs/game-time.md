# Měření času hry

Nikde neběží časovač ani plánovač. Server si jen zapisuje okamžiky, a časy z nich počítá, až když se na ně organizátor podívá.

## Co se zapisuje

- **Začátek hry týmu** je první přihlášení týmu kódem klanu po tom, co organizátoři hru spustili. Další přihlášení, ze stejného i z jiného zařízení, začátek nemění.
- **Konec hry týmu** je okamžik, kdy tým dojde do závěrečného uzlu příběhu, tedy naskenuje poslední kód.
- **Čtení** hlásí telefony: jak dlouho byl na viditelné stránce text příběhu. Obrazovka se skenerem se nepočítá, s tou tým jde na další stanoviště. Jedna obrazovka se počítá nejvýš 5 minut a čte-li víc telefonů týmu najednou, počítá se to jednou. Bez signálu čas počká v telefonu a odešle se později.

Telefon neposílá svůj čas, ale „jak dlouho“ a „před jak dlouhou dobou“; okamžik určí server. Špatně nastavené hodiny v telefonu tak výsledek nezkreslí.

## Tři časy

| Čas           | Jak vzniká                                     |
| ------------- | ---------------------------------------------- |
| Celkový čas   | konec − začátek; u týmu na cestě teď − začátek |
| Čas čtení     | součet čtení mezi začátkem a koncem            |
| Čas bez čtení | celkový čas − čas čtení (chůze a úkoly)        |

Všechny tři jsou v administraci na stránce Živě v panelu „Klany“, kde se podle nich dá i řadit, a ve výsledcích zkopírovaných jako CSV nebo JSON.

## Kdy se čas vynuluje

- **Nová hra** („Smazat postup“ na stránce Hra) vynuluje čas i postup všem týmům.
- **Restartovat hru** v dialogu týmu vynuluje čas i postup jednomu týmu.
- **Vynulovat čas** v dialogu týmu vynuluje jednomu týmu jen čas a čtení; postup mu zůstane. U týmu v cíli to nejde.

Ve všech třech případech se telefony týmu odhlásí a čas se rozběhne, až tým znovu naskenuje svůj kód.

## Výsledky

CSV i JSON mají anglické názvy. CSV: `id`, `team`, `node`, `finished`, `started_at`, `finished_at`, časy `play`, `reading` a `other` jako `h:mm:ss`, tytéž v sekundách jako `play_s`, `reading_s` a `other_s`, a za nimi sloupec `state_<klíč>` pro každou hodnotu stavu. JSON: `id`, `name`, `node`, `finished`, `startedAt`, `finishedAt`, `playSeconds`, `readingSeconds`, `otherSeconds` a `state`.
