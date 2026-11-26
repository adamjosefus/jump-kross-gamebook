import type { Meta, StoryObj } from '@storybook/react-vite';

import { NodeSegments } from './node-segments';

const MILL = `<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M40 72V34h40v38M34 34l26-16 26 16M60 34V6M60 34 38 12M60 34l22-22M52 72V54h16v18"/></svg>`;

const meta = {
  title: 'Player/NodeSegments',
  component: NodeSegments,
  parameters: { layout: 'fullscreen' },
  args: {
    revision: 0,
    visitScope: 'storybook',
    busy: false,
    onCode: () => undefined,
    onPick: () => undefined,
    node: {
      id: 'MILL',
      type: 'passage',
      scan: false,
      timeStops: false,
      choices: [{ index: 0, label: 'Vejít dovnitř' }],
      segments: [
        {
          theme: 'default',
          svg: MILL,
          content: '## Starý mlýn\n\nKolo se dávno netočí, ale ze dveří je cítit čerstvá mouka.',
        },
      ],
    },
  },
} satisfies Meta<typeof NodeSegments>;

export default meta;

export const WithSvg: StoryObj<typeof meta> = {};

/** No text in the story, missing or empty: a round button with only the arrow. */
export const ArrowOnlyNextButton: StoryObj<typeof meta> = {
  args: {
    node: {
      id: 'LETTER',
      type: 'passage',
      scan: false,
      timeStops: false,
      choices: [{ index: 0, label: 'Vyrazit na cestu' }],
      segments: [
        { theme: 'default', content: 'Na stole leží zapečetěný dopis.' },
        { theme: 'letter', content: '*Milí hledači,* poklad je blízko.' },
      ],
    },
  },
};

/** A choice without a text: the team moves on by the same round arrow as between segments. */
export const PlainNextAction: StoryObj<typeof meta> = {
  args: {
    node: {
      id: 'CESTA',
      type: 'passage',
      scan: false,
      timeStops: false,
      choices: [{ index: 0, label: '' }],
      segments: [{ theme: 'default', content: 'Cesta vede dál lesem k mlýnu.' }],
    },
  },
};

/** The first segment's button has the story's own text. */
export const CustomNextButton: StoryObj<typeof meta> = {
  args: {
    node: {
      id: 'LETTER',
      type: 'passage',
      scan: false,
      timeStops: false,
      choices: [{ index: 0, label: 'Vyrazit na cestu' }],
      segments: [
        { theme: 'default', content: 'Na stole leží zapečetěný dopis.', next: 'Otevřít dopis' },
        { theme: 'letter', content: '*Milí hledači,* poklad je blízko.' },
      ],
    },
  },
};

/** A later segment: „Zpět“ is a small circle with an arrow in the top left corner. */
export const BackButton: StoryObj<typeof meta> = {
  args: { ...ArrowOnlyNextButton.args, initialIndex: 1 },
};
