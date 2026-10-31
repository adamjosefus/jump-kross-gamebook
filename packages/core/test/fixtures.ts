import { checkpoint, defineStory } from '../src/index.ts';

type State = { gold: number; hatColor: 'red' | 'blue' | 'green' };

/** Small story covering checkpoints, conditional blocks and choices, and both kinds of end. */
export const SAMPLE = defineStory<State>()({
  A1: {
    initialState: { gold: 100, hatColor: 'red' },
    blocks: [
      {
        theme: 'intro',
        content: `
          # Začátek

          Adipisicing commodo veniam **aliqua**.
        `,
      },
    ],
    choices: [
      { label: 'Možnost jedna', goto: 'B1', nextState: () => ({ hatColor: 'blue' }) },
      {
        label: 'Možnost dvě',
        goto: 'A2',
        nextState: (s) => ({ hatColor: 'green', gold: s.gold - 20 }),
      },
    ],
  },
  A2: {
    blocks: [
      'Jděte ke studni na nádvoří.',
      checkpoint(32, 'Naskenujte QR kód u studny.'),
      { theme: 'night', content: 'Ve studni něco leží.' },
      checkpoint(33, { theme: 'night', content: 'Teď ke bráně.' }),
    ],
    choices: [{ label: 'Pokračovat', goto: 'B1' }],
  },
  B1: {
    blocks: (s) => {
      const rich = s.hatColor === 'red' && s.gold >= 34;
      return [
        `Pohodlně si nosil svoji ${rich ? 'červenou čepici' : 'chudou pokrývku hlavy'}.`,
        rich && { theme: 'letter', content: 'Drahý poutníku…' },
      ];
    },
    choices: [
      { label: 'Bojovat', goto: 'C1' },
      {
        label: 'Koupit meč',
        goto: 'C2',
        when: (s) => s.gold >= 90,
        nextState: (s) => ({ gold: s.gold - 90 }),
      },
    ],
  },
  C1: { end: true, blocks: ['Prohráli jste.'] },
  C2: { end: true, blocks: ['Vyhráli jste.'] },
});
