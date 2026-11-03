import { defineStory } from '../src/index.ts';

type State = { readonly gold: number; readonly hatColor: 'red' | 'blue' | 'green' };

/** Small story covering QR choices, conditional blocks and choices, and both kinds of end. */
export const SAMPLE = defineStory<State>()({
  teams: { 1: 'Vlci', 2: 'Lišky' },
  intro: [
    {
      theme: 'intro',
      content: `
      # Hra

      Naskenujte kód svého týmu.
    `,
    },
  ],
  locations: { 32: 'Místo 32', 33: 'Místo 33' },
  nodes: {
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
          nextState: (state) => ({ hatColor: 'green', gold: state.gold - 20 }),
        },
      ],
    },
    A2: {
      blocks: [
        'Jděte ke studni na nádvoří, nebo k bráně.',
        { theme: 'description', content: 'Setmělo se.' },
      ],
      scans: [
        { location: 32, goto: 'B1' },
        { location: 33, goto: 'B1', nextState: (state) => ({ gold: state.gold + 50 }) },
      ],
    },
    B1: {
      blocks: (state) => {
        const rich = state.hatColor === 'red' && state.gold >= 34;
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
          when: (state) => state.gold >= 90,
          nextState: (state) => ({ gold: state.gold - 90 }),
        },
      ],
    },
    C1: { end: true, blocks: (_state, team) => [`Prohráli jste, týme ${team.name}.`] },
    C2: { end: true, blocks: ['Vyhráli jste.'] },
  },
});
