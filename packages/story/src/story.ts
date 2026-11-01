import { defineStory } from '@gamebook/core';

type State = {
  coins: number;
  hasMap: boolean;
  courage: number;
};

/**
 * The gamebook. Every node is one step of the story: `blocks` are its screens (markdown, one
 * screen each, optionally with a `theme`). A node leads on either by `choices` (buttons) or by
 * `scans`: the team scans the QR code of a location and goes where that location leads. The team
 * does not see which locations a node accepts, so the screens have to say where to go.
 *
 * `locations` are the places with QR codes; the admin prints their codes from here.
 *
 * Demo: two starts, a letter, a night screen, a fork decided by which place the team walks to
 * (locations 1 and 2), a choice that appears only with enough coins, and two endings.
 */
export const story = defineStory<State>()({
  locations: {
    1: 'Lesní studánka',
    2: 'Starý mlýn',
  },
  nodes: {
    START: {
      initialState: { coins: 30, hasMap: false, courage: 0 },
      blocks: [
        {
          theme: 'intro',
          content: `
          # Poklad starého mlýna

          Hledá se ztracený poklad mlynáře Matěje. Kdo ho najde dřív?
        `,
        },
        {
          theme: 'letter',
          content: `
          *Milí hledači,*

          poklad jsem ukryl tam, kde se kdysi točilo kolo. Cestu vám ukáže jen ten, kdo se nebojí tmy.

          — **Matěj**
        `,
        },
      ],
      choices: [{ label: 'Vyrazit na cestu', goto: 'MARKET' }],
    },

    // Second start for teams that should skip the market (e.g. to spread teams across locations).
    START_FOREST: {
      initialState: { coins: 10, hasMap: true, courage: 1 },
      blocks: [
        { theme: 'intro', content: '# Poklad starého mlýna\n\nZačínáte rovnou s mapou v ruce.' },
      ],
      choices: [{ label: 'Do lesa', goto: 'FOREST' }],
    },

    MARKET: {
      blocks: (s) => [
        `Na tržišti prodává stará kořenářka mapu okolí. Máte u sebe **${s.coins} mincí**.`,
        { theme: 'letter', content: '„Mapa za dvacet. A k ní rada zdarma: v lese nespěchejte.“' },
      ],
      choices: [
        {
          label: 'Koupit mapu (20 mincí)',
          goto: 'FOREST',
          when: (s) => s.coins >= 20,
          nextState: (s) => ({ coins: s.coins - 20, hasMap: true }),
        },
        { label: 'Jít bez mapy', goto: 'FOREST' },
      ],
    },

    // The team picks the path by walking: the code it scans decides the next node.
    FOREST: {
      blocks: (s) => [
        s.hasMap
          ? 'Podle mapy vidíte, že se pěšina dělí: jedna vede ke **studánce**, druhá rovnou ke **mlýnu**.'
          : 'Bez mapy bloudíte, až dojdete k rozcestí. Jedna cesta voní vodou, druhá vede z kopce.',
        'Vydejte se jednou z cest a naskenujte QR kód tam, kam dojdete.',
      ],
      scans: [
        { location: 1, goto: 'WELL' },
        { location: 2, goto: 'MILL' },
      ],
    },

    WELL: {
      blocks: [
        {
          theme: 'night',
          content: 'U studánky se setmělo. Za ní slyšíte šumění vody. Mlýn musí být blízko.',
        },
      ],
      choices: [
        { label: 'Jít potmě dál', goto: 'TO_MILL', nextState: (s) => ({ courage: s.courage + 1 }) },
        { label: 'Počkat na ráno', goto: 'TO_MILL' },
      ],
    },

    TO_MILL: {
      blocks: ['Najděte **starý mlýn** a naskenujte QR kód u kola.'],
      scans: [{ location: 2, goto: 'MILL' }],
    },

    MILL: {
      blocks: (s) => [
        'Mlýnské kolo je zarostlé mechem. Pod ním je kamenná deska.',
        s.courage > 0 && {
          theme: 'night',
          content: 'Ve tmě si všimnete slabého světla pod deskou.',
        },
      ],
      choices: [
        { label: 'Zvednout desku', goto: 'TREASURE', when: (s) => s.courage > 0 || s.hasMap },
        { label: 'Vrátit se domů', goto: 'HOME' },
      ],
    },

    TREASURE: {
      end: true,
      blocks: [
        { theme: 'intro', content: '# Poklad je váš!\n\nPod deskou leží truhla plná mincí.' },
      ],
    },

    HOME: {
      end: true,
      blocks: ['Vracíte se domů s prázdnou. Poklad na vás ve mlýně počká.'],
    },
  },
});
