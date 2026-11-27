import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { TooltipProvider } from '@/components/ui/tooltip';

import type { Draft } from './draft';
import { DraftCanvas } from './draft-canvas';
import { SAMPLE_DRAFT } from './sample-draft';

/** The canvas over a draft kept in the story, so drawn out nodes and edges stay. */
const Editing = ({
  initial,
  onOpen,
}: {
  readonly initial: Draft;
  readonly onOpen?: (id: string) => void;
}) => {
  const [draft, setDraft] = useState(initial);
  return (
    <DraftCanvas draft={draft} onChange={setDraft} {...(onOpen === undefined ? {} : { onOpen })} />
  );
};

const meta = {
  title: 'Editor/Plátno',
  component: Editing,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className='h-[calc(100vh-4rem)] rounded-lg border'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  args: { onOpen: fn() },
  parameters: {
    docs: {
      description: {
        component:
          'Klik uzel vycentruje, dvojklik ho i přiblíží. Tečku volby nebo „+ volba“ přetáhněte na uzel, nebo do prázdna pro nový uzel.',
      },
    },
  },
} satisfies Meta<typeof Editing>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sample: Story = {
  name: 'Ukázkový koncept',
  args: { initial: SAMPLE_DRAFT },
};

export const OneNode: Story = {
  name: 'Jeden uzel',
  args: {
    initial: {
      version: 1,
      nodes: [{ id: 'uzel', summary: 'První uzel', segments: [{ text: '' }], choices: [] }],
    },
  },
};
