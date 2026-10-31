# Gamebook (JUMP Kross 2027)

Webová aplikace pro větvený gamebook, který hraje několik týmů naráz a postupuje se v něm skenováním QR kódů na fyzických místech.

- `/`: hráčská část. Tým se přihlásí QR kódem, čte uzly příběhu, volí a skenuje kódy na místech.
- `/admin`: část pro tvůrce (heslo). Graf příběhu, nastavení týmů a míst, průběh hry a tisk QR kódů.

## Vývoj

```bash
pnpm install
pnpm dev            # http://localhost:5173, API běží ve Vite (bez DATABASE_URL v paměti, heslo „admin“)
pnpm test           # Vitest: jádro (parser, engine, QR) a API
pnpm typecheck
pnpm lint
pnpm storybook      # QR komponenty na http://localhost:6006
```

Data v paměti zmizí s restartem dev serveru. Pro práci s databází nastavte `DATABASE_URL` v `.env` (vzor je v [.env.example](.env.example)).

## Struktura

| Balíček                   | Obsah                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/core`           | Čisté TS jádro bez I/O: `defineStory`, engine, graf a Mermaid, QR kódy                                          |
| `packages/story`          | Samotný příběh v TypeScriptu (jen pro server, do webu se nebundluje)                                            |
| `packages/api`            | Effect HttpApi: definice (sdílená s klientem) a server (`src/server`) s úložištěm v paměti nebo v Neon Postgres |
| `apps/web`                | Vite + React SPA (shadcn/ui, TanStack Router a Query), Storybook                                                |
| `scripts/build-vercel.ts` | Sestaví `.vercel/output` (statický web a jedna funkce pro `/api`)                                               |

## Příběh

Příběh je kód v [packages/story/src/story.ts](packages/story/src/story.ts) a mění se s deployem. Překlep v `goto`, špatný typ stavu nebo neznámé `theme` jsou chyby kompilace.

```ts
type State = { gold: number; hatColor: 'red' | 'blue' };

export const story = defineStory<State>()({
  INTRO: {
    initialState: { gold: 100, hatColor: 'red' }, // uzel s initialState je startovní
    blocks: [{ theme: 'intro', content: '# Ztracený rukopis' }],
    choices: [{ label: 'Začít', goto: 'A1' }],
  },
  A1: {
    // Každý blok je jedna obrazovka v Markdownu, mezi nimi je tlačítko „Další“.
    blocks: (s) => [
      `Máte ${s.gold} zlaťáků.`,
      s.gold > 50 && { theme: 'letter', content: 'Drahý poutníku…' }, // false se vynechá
      checkpoint(32, 'Jděte ke studni a naskenujte QR kód.'), // dál až po skenu místa 32
      'Ve studni něco leží.',
    ],
    choices: [
      {
        label: 'Koupit meč',
        goto: 'END',
        when: (s) => s.gold >= 90,
        nextState: (s) => ({ gold: s.gold - 90 }),
      },
      { label: 'Odejít', goto: 'END' },
    ],
  },
  END: { end: true, blocks: ['Konec.'] },
});
```
