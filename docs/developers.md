# Pro vývojáře

Jak je aplikace postavená a jak na ní pracovat. Spuštění, testy a nasazení stručně shrnuje také [README](../README.md).

## Přehled

Monorepo s pnpm. TypeScript všude, Effect na serveru, React na klientu.

| Balíček          | Obsah                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `packages/core`  | Model příběhu (`defineStory`), engine, který ho hraje, graf pro administraci, QR kódy, validace. |
| `packages/story` | Samotný příběh (`story.ts`). Mění se jen s nasazením.                                            |
| `packages/api`   | HTTP API (Effect `HttpApi`), herní logika, úložiště (Postgres přes Neon, nebo paměť).            |
| `apps/web`       | Aplikace pro hráče a administrace (React, TanStack Query a Router, Tailwind, React Flow + ELK).  |

Server nedrží žádný stav mimo databázi a neběží v něm časovač: každá odpověď se spočítá z uložených dat.

## Core

- **`story.ts`:** typy příběhu a `defineStory`. Typy hlídají, že volby vedou do existujících uzlů a skeny používají známé kódy; kapitoly jsou `{ id, name, counts }`.
- **`engine.ts`:** pozice týmu je `{ node, state }`. `renderNode` vrátí obrazovky, dostupné volby, jestli uzel čeká na sken a `timeStops` (uzel patří do nepočítané kapitoly). `applyChoice` a `applyScan` vrátí novou pozici nebo chybu.
- **`graph.ts`:** `toGraph` projde příběh od startu a připraví graf pro administraci s náhledy textu a kapitolami.
- **`validate.ts`:** `validateStory` vrátí seznam problémů česky (dosažitelnost, slepé uličky, kódy, kapitoly, stav). Spouští ji `pnpm test:story`.
- **`qr.ts`:** kód má tvar `DRUH-ID-KONTROLA` (`T` přihlášení týmu, `L` herní kód) s HMAC podpisem klíčem `QR_SECRET`.

## API

Endpointy jsou definované v `packages/api/src/api.ts` a typově sdílené s klientem.

- **`/api/player`:** `intro`, `login`, `state`, `choose`, `scan`, `logout`. Hráč se drží cookie `gb_session`. Souběh telefonů jednoho týmu řeší `expectedStep`: tah se provede, jen když tým je pořád na očekávaném kroku, jinak `StepConflict`.
- **`/api/admin`:** přihlášení heslem (cookie `gb_admin`), graf příběhu, test, přehled (`overview`), časy po kapitolách (`time-breakdown`), spuštění a pozastavení hry, zařízení a blokování, reset a přesun týmů, kódy k tisku.

Logika je v `server/game.ts`, obsluha požadavků v `server/handlers.ts`. `server/vercel.ts` a `server/node.ts` jsou vstupní body pro Vercel a pro dev server.

### Úložiště

`server/store.ts` popisuje rozhraní, `store-postgres.ts` a `store-memory.ts` ho implementují. Jediný zápis na horké cestě je `moveTeam`; je atomický a zapisuje i řádek do `step_log`.

Schéma (`server/schema.ts`) je idempotentní SQL, které se pustí při prvním požadavku každé instance; migrace se nepíší zvlášť. Tabulky: `team`, `step_log`, `session`, `game`, `admin_login`, `device_ban`.

### Čas

`server/team-timeline.ts` počítá z kroků týmu (`listSteps`, jen od posledního návratu na start) časy po kapitolách, mezery mezi nimi, výsledný čas a fázi, ve které tým je. Pravidla popisuje [Měření času hry](game-time.md).

## Web

- `features/player` – obrazovka hráče: postupný text (`story-text`), skener (`qr-scanner`), čekací obrazovka, kapsle „čas stojí“ (`reading-chip`). Pravidla obrazovky hráče jsou v `.claude/rules/player-screen.md` a [Text příběhu na obrazovce hráče](story-text.md).
- `features/admin` – stránky administrace, výpočty výsledků (`results.ts`) a řazení (`team-sort.ts`).
- `features/story` – graf příběhu (React Flow, rozložení ELK, rámečky kapitol).
- Administrace se načítá až na vyžádání, takže telefony stahují jen část pro hráče.

## Vývoj

```sh
pnpm install
pnpm dev          # aplikace s API na http://localhost:5173, data v paměti
pnpm storybook    # komponenty na http://localhost:6006
```

Bez `DATABASE_URL` drží dev server hru v paměti (zmizí s restartem serveru) a používá známé záložní klíče; heslo administrace je pak `admin`. Změna v `packages/` dev server sám znovu načte.

## Kontroly

```sh
pnpm typecheck
pnpm lint            # oxlint s typovými pravidly
pnpm format:check    # oxfmt; pnpm format opraví
pnpm test            # vitest; Postgres úložiště běží na vestavěném PGlite
pnpm test:story      # jen kontrola příběhu
pnpm build:vercel    # sestavení pro Vercel
```

CI (`.github/workflows/ci.yml`) pouští totéž u každého pull requestu.

## Nasazení

Aplikace běží na Vercelu, databáze je Neon (Postgres). Potřebné proměnné prostředí (`DATABASE_URL`, `ADMIN_PASSWORD`, `QR_SECRET`, `SESSION_SECRET`) a práce s větvemi databáze jsou popsané v README. Změna `QR_SECRET` zneplatní všechny vytištěné kódy.

## Pravidla projektu

- Kód, komentáře, commity a pull requesty anglicky; texty pro hráče a organizátory a dokumentace česky (`CLAUDE.md`).
- Větve, commity a pull requesty podle `.claude/rules/git.md`.
- Neměnné typy a čitelné názvy podle `.claude/rules/typescript.md`.
- Text příběhu podle `.claude/rules/story-text.md`.
