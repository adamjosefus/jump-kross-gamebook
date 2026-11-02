import { defineStory } from '@gamebook/core';

type State = {
  readonly coins: number;
  readonly hasMap: boolean;
  readonly courage: number;
};

/**
 * The gamebook. Every node is one step of the story: `blocks` are its screens (markdown, one
 * screen each, optionally with a `theme`). A node leads on either by `choices` (buttons) or by
 * `scans`: the team scans the QR code of a location and goes where that location leads. The team
 * does not see which locations a node accepts, so the screens have to say where to go.
 *
 * `teams` are the teams of the game and `locations` the places with QR codes; the admin prints
 * their codes from here. `intro` is what anyone sees before scanning a team's code; then the team
 * continues where it is, or at START when it has not started yet.
 *
 * `chord` is what the slide buttons play; a choice can bring a chord of its own, like the minor
 * one of giving up at the mill.
 *
 * Demo: an intro, a letter, a description, a fork decided by which place the team walks to
 * (locations 1 and 2), a choice that appears only with enough coins, and two endings.
 */
export const story = defineStory<State>()({
  teams: {
    1: 'Vlci',
    2: 'Lišky',
    3: 'Sovy',
  },
  intro: [
    {
      theme: 'intro',
      content: `
      # Poklad starého mlýna

      Hledá se ztracený poklad mlynáře Matěje. Kdo ho najde dřív?
    `,
    },
    `
    ## Pravidla

    Hrajete jako tým. Příběh vás povede po okolí: někdy vybíráte v aplikaci, jindy musíte dojít na
    místo a naskenovat tam QR kód.

    Na začátku naskenujte přihlašovací kód svého týmu. Stejný kód může naskenovat každý telefon
    v týmu, všechny pak ukazují totéž.
    `,
  ],
  introScanTitle: 'Naskenujte kód svého týmu',
  introScanText: 'Namiřte fotoaparát na přihlašovací QR kód.',
  // Cello notes a slide button plays, entering one by one as the thumb moves.
  chord: ['C3', 'G3', 'D4', 'E4'],
  locations: {
    1: 'Lesní studánka',
    2: 'Starý mlýn',
  },
  nodes: {
    START: {
      initialState: { coins: 30, hasMap: false, courage: 0 },
      blocks: [
        {
          theme: 'letter',
          content: `
          *Milí hledači,*

          poklad jsem ukryl tam, kde se kdysi točilo kolo. Cestu vám ukáže jen ten, kdo se nebojí tmy.

          — **Matěj**
        `,
        },
      ],
      choices: [{ label: 'Vyrazit na cestu', goto: 'MARKET' }],
    },

    MARKET: {
      blocks: (state) => [
        `Na tržišti prodává stará kořenářka mapu okolí. Máte u sebe **${state.coins} mincí**.`,
        { theme: 'letter', content: '„Mapa za dvacet. A k ní rada zdarma: v lese nespěchejte.“' },
      ],
      choices: [
        {
          label: 'Koupit mapu',
          goto: 'FOREST',
          when: (state) => state.coins >= 20,
          nextState: (state) => ({ coins: state.coins - 20, hasMap: true }),
        },
        { label: 'Jít bez mapy', goto: 'FOREST' },
      ],
    },

    // The team picks the path by walking: the code it scans decides the next node.
    FOREST: {
      blocks: (state) => [
        state.hasMap
          ? 'Podle mapy vidíte, že se pěšina dělí: jedna vede ke **studánce**, druhá rovnou ke **mlýnu**.'
          : 'Bez mapy bloudíte, až dojdete k rozcestí. Jedna cesta voní vodou, druhá vede z kopce.',
        'Vydejte se jednou z cest a naskenujte QR kód tam, kam dojdete.',
      ],
      scanTitle: 'Kam jste došli?',
      scanText: 'Naskenujte QR kód na místě, kam vás cesta zavedla.',
      scans: [
        { location: 1, goto: 'WELL' },
        { location: 2, goto: 'MILL' },
      ],
    },

    WELL: {
      blocks: [
        {
          theme: 'description',
          content: 'U studánky se setmělo. Za ní slyšíte šumění vody. Mlýn musí být blízko.',
        },
      ],
      choices: [
        {
          label: 'Jít potmě dál',
          goto: 'TO_MILL',
          nextState: (state) => ({ courage: state.courage + 1 }),
        },
        { label: 'Počkat na ráno', goto: 'TO_MILL' },
      ],
    },

    TO_MILL: {
      blocks: ['Najděte **starý mlýn** a naskenujte QR kód u kola.'],
      scanTitle: 'Jste u mlýna?',
      scanText: 'QR kód najdete u kola.',
      scans: [{ location: 2, goto: 'MILL' }],
    },

    MILL: {
      blocks: (state) => [
        'Mlýnské kolo je zarostlé mechem. Pod ním je kamenná deska.',
        state.courage > 0 && {
          theme: 'description',
          content: 'Ve tmě si všimnete slabého světla pod deskou.',
        },
      ],
      choices: [
        {
          label: 'Zvednout desku',
          goto: 'TREASURE',
          when: (state) => state.courage > 0 || state.hasMap,
        },
        { label: 'Vrátit se domů', goto: 'HOME', chord: ['A2', 'E3', 'C4', 'G4'] },
      ],
    },

    TREASURE: {
      end: true,
      blocks: [
        { theme: 'green', content: '# Poklad je váš!\n\nPod deskou leží truhla plná mincí.' },
      ],
    },

    HOME: {
      end: true,
      blocks: [
        { theme: 'red', content: 'Vracíte se domů s prázdnou. Poklad na vás ve mlýně počká.' },
      ],
    },
  },
});
