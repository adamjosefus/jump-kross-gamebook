import { checkpoint, defineStory } from '@gamebook/core';

type State = {
  coins: number;
  hasMap: boolean;
  courage: number;
};

/**
 * The gamebook. Every node is one step of the story: `blocks` are its screens (markdown, one
 * screen each, optionally with a `theme`), `choices` lead to other nodes. A `checkpoint` stops the
 * team until it scans the QR code of that location.
 *
 * Demo: two starts, a letter, a night screen, two checkpoints (locations 1 and 2), a choice that
 * appears only with enough coins, and two endings.
 */
export const story = defineStory<State>()({
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

  FOREST: {
    blocks: (s) => [
      s.hasMap
        ? 'Podle mapy najdete pěšinu k lesní studánce.'
        : 'Bez mapy bloudíte, ale nakonec narazíte na lesní studánku.',
      checkpoint(1, 'Dojděte ke **studánce** a naskenujte QR kód.'),
      {
        theme: 'night',
        content: 'Setmělo se. Za studánkou slyšíte šumění vody. Mlýn musí být blízko.',
      },
    ],
    choices: [
      { label: 'Jít potmě dál', goto: 'MILL', nextState: (s) => ({ courage: s.courage + 1 }) },
      { label: 'Počkat na ráno', goto: 'MILL' },
    ],
  },

  MILL: {
    blocks: (s) => [
      checkpoint(2, 'Najděte **starý mlýn** a naskenujte QR kód u kola.'),
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
    blocks: [{ theme: 'intro', content: '# Poklad je váš!\n\nPod deskou leží truhla plná mincí.' }],
  },

  HOME: {
    end: true,
    blocks: ['Vracíte se domů s prázdnou. Poklad na vás ve mlýně počká.'],
  },
});
