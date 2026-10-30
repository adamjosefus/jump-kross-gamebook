# Gamebook (JUMP Kross 2027)

Webová aplikace pro větvený gamebook, který hraje několik týmů naráz a postupuje se v něm skenováním QR kódů na fyzických místech.

- `/`: hráčská část. Tým se přihlásí QR kódem, čte uzly příběhu, volí a skenuje kódy na místech.
- `/admin`: část pro tvůrce (heslo). Editor s grafem, nastavení týmů a míst, průběh hry a tisk QR kódů.

## Vývoj

```bash
pnpm install
pnpm dev            # http://localhost:5173, API běží ve Vite (bez DATABASE_URL v paměti, heslo „admin“)
pnpm test           # Vitest: jádro (parser, engine, QR) a API
pnpm typecheck
pnpm lint
pnpm storybook      # QR komponenty na http://localhost:6006
```

Lokálně se rozpracovaný příběh načte z [examples/demo.gamebook](examples/demo.gamebook). Data v paměti zmizí s restartem dev serveru. Pro práci s databází nastavte `DATABASE_URL` v `.env` (vzor je v [.env.example](.env.example)).

## Struktura

| Balíček | Obsah |
|---|---|
| `packages/core` | Čisté TS jádro bez I/O: parser formátu, výrazy, engine, Mermaid, QR kódy |
| `packages/api` | Effect HttpApi: definice (sdílená s klientem) a server (`src/server`) s úložištěm v paměti nebo v Neon Postgres |
| `apps/web` | Vite + React SPA (shadcn/ui, TanStack Router a Query), Storybook |
| `scripts/build-vercel.ts` | Sestaví `.vercel/output` (statický web a jedna funkce pro `/api`) |

## Formát příběhu

```
--- A1 --- {
  type: "start"
  theme: "intro"
  initialState: { hatColor: "red", gold: 100 }
}

Text v **Markdownu**, <if condition='gold >= 34'>podmíněný<else>jiný</if> text.

- Volba [B1] { hatColor: "blue" }
- Jiná volba [A2] { gold: { delta: -20 } }
- Podmíněná volba [C2] { if: 'gold >= 90' }

--- A2 --- { scan: 32 }

Jděte ke studni. Z uzlu se odchází naskenováním QR kódu místa 32.

- Pokračovat [B1]

--- C2 --- { type: "end" }
```

- Každý uzel začíná řádkem `--- ID ---` a chyba v jednom uzlu neovlivní ostatní.
- `type` je `"start"` nebo `"end"`. Bez typu jde o průchozí uzel.
- Volby jsou souvislý seznam na konci uzlu. Literál ve volbě nastaví proměnnou, `{ delta: n }` k ní přičte n, `if` je podmínka zobrazení.
- Ve výrazech fungují `== != < <= > >= && || !` a závorky.
- U uzlu se `scan` musí být dostupná právě jedna volba a ta určuje, kam sken vede.

## QR kódy

Obsah kódu je čitelný text `TYP:ID:KONTROLA`, např. `T:12:K7QM`:

- `T`: přihlášení týmu.
- `L`: postup na místě.
- `E`: cíl.

Kontrola jsou 4 znaky z HMAC se serverovým tajemstvím `QR_SECRET`, takže kód nejde v terénu vyrobit ručně. Změna `QR_SECRET` zneplatní všechny vytištěné kódy.

Grafika uprostřed kódu je v [apps/web/src/assets/qr-logo.svg](apps/web/src/assets/qr-logo.svg). Stačí ji nahradit, kódy používají korekci chyb úrovně H.

## Nasazení (Vercel + Neon)

1. Ve Vercelu založte projekt z repa. Build se řídí [vercel.json](vercel.json) a není potřeba nic dalšího nastavovat.
2. Ve Vercel Marketplace připojte Neon Postgres. Tím se nastaví `DATABASE_URL`. Tabulky se vytvoří samy při prvním požadavku.
3. Nastavte `ADMIN_PASSWORD`, `QR_SECRET` a `SESSION_SECRET` (dlouhé náhodné řetězce) pro Production i Preview. Bez nich funkce na Vercelu nenaběhne.
