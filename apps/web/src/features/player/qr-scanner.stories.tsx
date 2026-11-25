import type { Meta, StoryObj } from '@storybook/react-vite';

import { ScanScreen, type ScanOutcome } from './qr-scanner';

/**
 * The real scan screen with the device's camera. The button to switch cameras shows only on a
 * device with more than one camera; open the story on a phone to try it.
 */
const meta = {
  title: 'Player/ScanScreen',
  component: ScanScreen,
  parameters: { layout: 'padded' },
  args: {
    busy: false,
    // Every code is accepted, so the whole scan can be watched.
    onCode: async (): Promise<ScanOutcome> => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return 'accepted';
    },
  },
  decorators: [
    (Story) => (
      <div className='@container/player mx-auto flex h-[90svh] max-w-md flex-col'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScanScreen>;

export default meta;

export const Default: StoryObj<typeof meta> = {};

/** Every code is refused with an exclamation mark. */
export const Rejected: StoryObj<typeof meta> = {
  args: { onCode: async (): Promise<ScanOutcome> => 'rejected' },
};
