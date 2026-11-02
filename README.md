# Gamebook (JUMP Kross 2027)

Webová aplikace pro větvený gamebook, který hraje několik týmů naráz a postupuje se v něm skenováním QR kódů na fyzických místech.

- `/`: hráčská část. Tým se přihlásí QR kódem, čte uzly příběhu, volí a skenuje kódy na místech.
- `/admin`: část pro tvůrce (heslo). Graf příběhu, nastavení týmů a míst, průběh hry a QR kódy ke stažení (SVG, PDF na A4 a A5).

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
| `packages/core`           | Čisté TS jádro bez I/O: `defineStory`, engine, graf s náhledy, QR kódy                                          |
| `packages/story`          | Samotný příběh v TypeScriptu (jen pro server, do webu se nebundluje)                                            |
| `packages/api`            | Effect HttpApi: definice (sdílená s klientem) a server (`src/server`) s úložištěm v paměti nebo v Neon Postgres |
| `apps/web`                | Vite + React SPA (shadcn/ui, TanStack Router a Query), Storybook                                                |
| `scripts/build-vercel.ts` | Sestaví `.vercel/output` (statický web a jedna funkce pro `/api`)                                               |

## Příběh

Příběh je kód v [packages/story/src/story.ts](packages/story/src/story.ts) a mění se s deployem. Patří k němu i týmy a místa s QR kódy, admin z nich tiskne kódy. Překlep v `goto`, neznámé místo ve `scans`, špatný typ stavu nebo neznámé `theme` jsou chyby kompilace. Co typy nevidí (nedosažitelné uzly, víc startů, nepoužité volby a místa, prázdný obsah), hlídá test `validateStory`.

Hra začíná úvodem (`intro`), který vidí kdokoli bez přihlášení. Na jeho konci hráč naskenuje kód svého týmu. Tým, kterému hra ještě nezačala, začne na startu (jediný uzel s `initialState`) s výchozím stavem. Jinak se telefon přenese tam, kde tým právě je, takže všechny telefony týmu ukazují totéž.

```ts
type State = { gold: number; hatColor: 'red' | 'blue' };

export const story = defineStory<State>()({
  // Týmy: číslo → název. Každý tým má přihlašovací QR kód se svým číslem.
  teams: { 1: 'Vlci', 2: 'Lišky' },
  // Místa s QR kódy: číslo → název. Ve `scans` smí být jen tato čísla.
  locations: { 32: 'Studna na nádvoří', 33: 'Brána' },
  // Úvod před přihlášením, pro všechny stejný. Po něm se skenuje kód týmu.
  intro: [{ theme: 'intro', content: '# Ztracený rukopis' }, 'Pravidla hry…'],
  // Tóny violoncella, které hraje posuvné tlačítko: první se ozve s dotykem, další postupně
  // cestou, na konci zní celý akord. Noty C2 až C5, křížky jako `F#3`. Bez `chord` jsou tlačítka tichá.
  chord: ['C3', 'G3', 'D4', 'E4'],
  nodes: {
    START: {
      initialState: { gold: 100, hatColor: 'red' }, // jediný start, tady začíná každý tým
      blocks: ['Stojíte před branou kláštera.'],
      choices: [{ label: 'Začít', goto: 'A1' }],
    },
    A1: {
      // Každý blok je jedna obrazovka v Markdownu, mezi nimi je tlačítko „Další“.
      blocks: (s) => [
        `Máte ${s.gold} zlaťáků.`,
        s.gold > 50 && { theme: 'letter', content: 'Drahý poutníku…' }, // false se vynechá
        'Jděte ke **studni**, nebo k **bráně**, a naskenujte tam QR kód.',
      ],
      // Titulek a text obrazovky skeneru; bez nich se ukážou výchozí.
      // Pro přihlašovací sken jsou `introScanTitle` a `introScanText` vedle `intro`.
      scanTitle: 'Kam jste došli?',
      scanText: 'Naskenujte QR kód na místě, kam vás cesta zavedla.',
      // QR volby: kam tým pokračuje, rozhodne naskenované místo. Hráč vidí jen tlačítko Naskenovat.
      scans: [
        { location: 32, goto: 'A2' },
        { location: 33, goto: 'END', when: (s) => s.gold >= 90 },
      ],
    },
    A2: {
      blocks: ['Ve studni něco leží.'],
      // Tlačítka. Uzel má buď choices, nebo scans, nikdy obojí.
      choices: [
        {
          label: 'Koupit meč',
          goto: 'END',
          when: (s) => s.gold >= 90,
          nextState: (s) => ({ gold: s.gold - 90 }),
        },
        // Vlastní akord jedné volby, místo toho z `chord` příběhu.
        { label: 'Odejít', goto: 'END', chord: ['A2', 'E3', 'C4'] },
      ],
    },
    END: { end: true, blocks: ['Konec.'] },
  },
});
```
