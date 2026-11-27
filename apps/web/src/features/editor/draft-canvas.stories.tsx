import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { TooltipProvider } from '@/components/ui/tooltip';

import { DraftCanvas } from './draft-canvas';
import { SAMPLE_DRAFT } from './sample-draft';

const meta = {
  title: 'Editor/Plátno',
  component: DraftCanvas,
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
} satisfies Meta<typeof DraftCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sample: Story = {
  name: 'Ukázkový koncept',
  args: { draft: SAMPLE_DRAFT },
};

export const OneNode: Story = {
  name: 'Jeden uzel',
  args: {
    draft: {
      version: 1,
      nodes: [{ id: 'uzel', summary: 'První uzel', segments: [{ text: '' }], choices: [] }],
    },
  },
};
