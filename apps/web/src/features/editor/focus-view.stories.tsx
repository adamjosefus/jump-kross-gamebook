import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { Draft } from './draft';
import { FocusView } from './focus-view';
import { SAMPLE_DRAFT } from './sample-draft';

/** The sample draft read in focus: a neighbour opens in place and the edits are kept. */
const Reading = ({ start }: { readonly start: string }) => {
  const [draft, setDraft] = useState<Draft>(SAMPLE_DRAFT);
  const [id, setId] = useState(start);
  return (
    <FocusView
      className='h-[calc(100vh-4rem)]'
      draft={draft}
      id={id}
      onOpen={setId}
      onChange={(node) => {
        setDraft({
          ...draft,
          nodes: draft.nodes.map((current) => {
            return current.id === node.id ? node : current;
          }),
        });
      }}
    />
  );
};

const meta = {
  title: 'Editor/Soustředění',
  component: Reading,
} satisfies Meta<typeof Reading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Middle: Story = {
  name: 'Uprostřed příběhu',
  args: { start: 'cesta_domu' },
};

export const Start: Story = {
  name: 'Začátek',
  args: { start: 'patek_odpoledne_doma' },
};

export const End: Story = {
  name: 'Konec',
  args: { start: 'konec_hry' },
};
