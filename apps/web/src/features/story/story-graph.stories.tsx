import { toGraph } from '@gamebook/core';
import { story } from '@gamebook/story';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { TooltipProvider } from '@/components/ui/tooltip';

import { StoryGraph } from './story-graph';

/** The demo story, with its chapters and stations; the scans of a station's codes have icons. */
const graph = toGraph(story);

const meta = {
  title: 'Admin/Graf příběhu',
  component: StoryGraph,
  args: { graph },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className='h-[calc(100vh-4rem)] rounded-lg border'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof StoryGraph>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The nodes of a chapter are laid out together inside a titled frame. */
export const Kapitoly: Story = {};

/** Without the frames, laid out as if the story had no chapters. */
export const BezKapitol: Story = { name: 'Bez kapitol', args: { chapters: false } };
