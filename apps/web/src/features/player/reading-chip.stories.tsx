import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';

import { NodeScreens } from './node-screens';
import { ReadingChip } from './reading-chip';

/** The capsule coming and going every two seconds, on a light and a dark background. */
const Switching = () => {
  const [reading, setReading] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setReading((current) => !current), 2000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className='grid min-h-svh grid-cols-2'>
      <div className='flex h-20 items-start justify-center bg-white pt-8'>
        {reading && <ReadingChip />}
      </div>
      <div className='flex h-20 items-start justify-center bg-neutral-900 pt-8'>
        {reading && <ReadingChip />}
      </div>
    </div>
  );
};

/**
 * While a text of the story is on, the team reads and its game time stands still: a yellow capsule
 * with a book says so at the top. The scanner and the outro have none; a test run in the admin
 * shows it, though it measures nothing.
 */
const meta = {
  title: 'Player/Čtení',
  component: NodeScreens,
  parameters: { layout: 'fullscreen' },
  args: {
    step: 0,
    visitScope: 'storybook',
    busy: false,
    animated: false,
    onCode: () => undefined,
    onPick: () => undefined,
    // A logged-in team measures its reading; a test run or the intro passes nothing.
    onRead: () => undefined,
    node: {
      id: 'PEKARNA',
      type: 'passage',
      scan: true,
      scanTitle: 'Uhodli jste?',
      scanText: 'Naskenujte kód, který vám dala pekařka.',
      choices: [],
      screens: [
        {
          theme: 'default',
          content:
            'Voní to tu čerstvým chlebem. Pekařka se usměje: „Prodám vám, až uhodnete, kolik druhů pečiva mám ve vitríně.“\n\nSpočítejte to a řekněte jí výsledek. Za správnou odpověď vám dá kód.',
        },
      ],
    },
  },
} satisfies Meta<typeof NodeScreens>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The team reads: the game time stands still and the capsule shows. */
export const Cteni: Story = { name: 'Čtení: kapsle s knihou' };

/** The scanner after the text: the team is on its way or at its task, the game time runs. */
export const Skener: Story = { name: 'Skener: nic', args: { initialIndex: 1 } };

/** The outro: the game is over, so nothing is measured and there is no capsule. */
export const Zaver: Story = {
  name: 'Závěr: neměří se',
  args: {
    node: {
      id: 'OUTRO',
      type: 'end',
      scan: false,
      choices: [],
      screens: [{ theme: 'default', content: '## Dobrou chuť!\n\nKonec ukázky.' }],
    },
  },
};

/** A test run in the admin measures nothing, yet shows the capsule as the team sees it. */
export const TestovaciBeh: Story = {
  name: 'Test v administraci',
  render: ({ onRead: _measured, ...args }) => <NodeScreens {...args} showReading />,
};

/** The capsule coming and going on its own every two seconds, to see how it appears. */
export const Prechod: Story = {
  name: 'Objevení kapsle',
  render: () => <Switching />,
};
