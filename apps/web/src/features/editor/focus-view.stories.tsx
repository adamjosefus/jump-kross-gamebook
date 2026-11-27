import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { Draft } from './draft';
import { FocusView } from './focus-view';
import { SAMPLE_DRAFT } from './sample-draft';

/** The sample draft in the detail: a neighbour opens in place and the edits are kept. */
const Reading = ({
  start,
  draft: initial = SAMPLE_DRAFT,
}: {
  readonly start: string;
  readonly draft?: Draft;
}) => {
  const [draft, setDraft] = useState<Draft>(initial);
  const [id, setId] = useState(start);
  /** How many nodes were opened, so a rename keeps the text editor, as in the dialog. */
  const [opening, setOpening] = useState(0);
  return (
    <FocusView
      className='h-[calc(100vh-4rem)]'
      draft={draft}
      id={id}
      onOpen={(next) => {
        setId(next);
        setOpening(opening + 1);
      }}
      opening={opening}
      onChange={setDraft}
      // The open node keeps open under its new id.
      onRename={(_from, to) => {
        setId(to);
      }}
    />
  );
};

const meta = {
  title: 'Editor/Detail',
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

/** Choices of the same text are allowed, but marked: the players could not tell them apart. */
export const SameLabels: Story = {
  name: 'Volby se stejným textem',
  args: {
    start: 'cesta_domu',
    draft: {
      ...SAMPLE_DRAFT,
      nodes: SAMPLE_DRAFT.nodes.map((node) => {
        if (node.id !== 'cesta_domu') {
          return node;
        }

        return {
          ...node,
          choices: [
            { label: '', to: 'vecere' },
            { label: '', to: 'konec_hry' },
            { label: 'Park', to: 'vecere' },
            { label: 'park', to: 'sousede_klepou' },
          ],
        };
      }),
    },
  },
};
