import type { Meta, StoryObj } from '@storybook/react-vite';

import { NodeScreens } from './node-screens';

const MILL = `<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M40 72V34h40v38M34 34l26-16 26 16M60 34V6M60 34 38 12M60 34l22-22M52 72V54h16v18"/></svg>`;

const meta = {
  title: 'Player/NodeScreens',
  component: NodeScreens,
  parameters: { layout: 'fullscreen' },
  args: {
    step: 0,
    visitScope: 'storybook',
    busy: false,
    onCode: () => undefined,
    onPick: () => undefined,
    node: {
      id: 'MILL',
      type: 'passage',
      scan: false,
      choices: [{ index: 0, label: 'Vejít dovnitř' }],
      screens: [
        {
          theme: 'default',
          svg: MILL,
          content: '## Starý mlýn\n\nKolo se dávno netočí, ale ze dveří je cítit čerstvá mouka.',
        },
      ],
    },
  },
} satisfies Meta<typeof NodeScreens>;

export default meta;

export const WithSvg: StoryObj<typeof meta> = {};

/** No text in the story, missing or empty: a round button with only the arrow. */
export const ArrowOnlyNextButton: StoryObj<typeof meta> = {
  args: {
    node: {
      id: 'LETTER',
      type: 'passage',
      scan: false,
      choices: [{ index: 0, label: 'Vyrazit na cestu' }],
      screens: [
        { theme: 'default', content: 'Na stole leží zapečetěný dopis.' },
        { theme: 'letter', content: '*Milí hledači,* poklad je blízko.' },
      ],
    },
  },
};

/** The first screen's button has the story's own text. */
export const CustomNextButton: StoryObj<typeof meta> = {
  args: {
    node: {
      id: 'LETTER',
      type: 'passage',
      scan: false,
      choices: [{ index: 0, label: 'Vyrazit na cestu' }],
      screens: [
        { theme: 'default', content: 'Na stole leží zapečetěný dopis.', next: 'Otevřít dopis' },
        { theme: 'letter', content: '*Milí hledači,* poklad je blízko.' },
      ],
    },
  },
};
