import { defineStory } from '../src/index.ts';

type State = { gold: number; hatColor: 'red' | 'blue' | 'green' };

/** Small story covering QR choices, conditional blocks and choices, and both kinds of end. */
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
      'Jděte ke studni na nádvoří, nebo k bráně.',
      { theme: 'night', content: 'Setmělo se.' },
    ],
    scans: [
      { location: 32, goto: 'B1' },
      { location: 33, goto: 'B1', nextState: (s) => ({ gold: s.gold + 50 }) },
    ],
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
