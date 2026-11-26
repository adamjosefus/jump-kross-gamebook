import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';

import { NodeSegments } from './node-segments';
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
 * In a chapter that does not count towards the team's result, such as the introduction, the game
 * time stands still: a yellow capsule with a book says so at the top, on the text and on the
 * scanner alike. Elsewhere there is nothing.
 */
const meta = {
  title: 'Player/Čas stojí',
  component: NodeSegments,
  parameters: { layout: 'fullscreen' },
  args: {
    revision: 0,
    visitScope: 'storybook',
    busy: false,
    animated: false,
    onCode: () => undefined,
    onPick: () => undefined,
    node: {
      id: 'START',
      type: 'start',
      scan: true,
      timeStops: true,
      scanTitle: 'Kam na nákup?',
      scanText: 'Naskenujte kód obchodu, do kterého jdete.',
      choices: [],
      segments: [
        {
          theme: 'intro',
          content:
            'Hra vám měří čas od naskenování kódu klanu až do konce. Tenhle úvod se do výsledku nepočítá: dokud nahoře na obrazovce svítí knížka, čas stojí.',
        },
      ],
    },
  },
} satisfies Meta<typeof NodeSegments>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A chapter that does not count: the game time stands still and the capsule shows. */
export const CasStoji: Story = { name: 'Nepočítaná kapitola: kapsle' };

/** The scanner in the same chapter: the time still stands, the capsule stays. */
export const Skener: Story = { name: 'Skener v nepočítané kapitole', args: { initialIndex: 1 } };

/** A chapter that counts: the time runs and there is nothing. */
export const CasBezi: Story = {
  name: 'Počítaná kapitola: nic',
  args: { node: { ...meta.args.node, id: 'NAKUP', type: 'passage', timeStops: false } },
};

/** The capsule coming and going on its own every two seconds, to see how it appears. */
export const Prechod: Story = {
  name: 'Objevení kapsle',
  render: () => <Switching />,
};
