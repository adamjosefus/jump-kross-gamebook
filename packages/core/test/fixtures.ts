import { defineStory } from '../src/index.ts';

type State = { readonly gold: number; readonly hatColor: 'red' | 'blue' | 'green' };

/** Small story covering QR choices, conditional blocks and choices, and an outro that depends on the state. */
export const SAMPLE = defineStory<State>()({
  teams: { 1: 'Vlci', 2: 'Lišky' },
  locations: { 32: 'Místo 32', 33: 'Místo 33' },
  introNode: 'INTRO',
  outroNode: 'OUTRO',
  nodes: {
    INTRO: {
      blocks: [
        {
          theme: 'intro',
          content: `
          # Hra

          Naskenujte kód svého týmu.
        `,
        },
      ],
    },
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
        { label: 'Bojovat', goto: 'OUTRO' },
        {
          label: 'Koupit meč',
          goto: 'OUTRO',
          when: (state) => state.gold >= 90,
          nextState: (state) => ({ gold: state.gold - 90 }),
        },
      ],
    },
    // Whoever bought the sword has less than 50 left and won; fighting keeps the gold and loses.
    OUTRO: {
      blocks: (state, team) =>
        state.gold < 50 ? ['Vyhráli jste.'] : [`Prohráli jste, týme ${team.name}.`],
    },
  },
});
