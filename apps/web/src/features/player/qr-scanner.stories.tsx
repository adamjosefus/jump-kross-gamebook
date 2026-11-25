import type { Meta, StoryObj } from '@storybook/react-vite';

import { PlayerFrame } from './player-frame';
import { ScanScreen, type ScanOutcome } from './qr-scanner';

/**
 * The real scan screen with the device's camera. The button to switch cameras shows only on a
 * device with more than one camera; open the story on a phone to try it.
 */
const meta = {
  title: 'Player/ScanScreen',
  component: ScanScreen,
  parameters: { layout: 'fullscreen' },
  args: {
    busy: false,
    // Every code is accepted, so the whole scan can be watched.
    onCode: async (): Promise<ScanOutcome> => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return 'accepted';
    },
  },
  // The player's own frame across the whole screen, as in the game: the camera square's corners
  // depend on the frame's width, so the padding of the preview (`p-8`) is taken back.
  decorators: [
    (Story) => (
      <div className='-m-8 flex min-h-svh flex-col'>
        <PlayerFrame>
          <Story />
        </PlayerFrame>
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
