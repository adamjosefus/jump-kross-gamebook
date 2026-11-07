import { GAME_CLOSED_MESSAGE, GAME_NOT_STARTED_MESSAGE } from '@gamebook/api';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { WaitingScreen } from './waiting-screen';

/** The screen of a phone that cannot log in yet; it moves on by itself once the game opens. */
const meta = {
  title: 'Player/WaitingScreen',
  component: WaitingScreen,
  parameters: { layout: 'fullscreen' },
  args: { message: GAME_NOT_STARTED_MESSAGE, corner: '26-11-07-345530d' },
} satisfies Meta<typeof WaitingScreen>;

export default meta;

/** Before the organizers start the game: the first thing a phone shows. */
export const NotStarted: StoryObj<typeof meta> = {};

/** The organizers closed the game for a while. */
export const Closed: StoryObj<typeof meta> = { args: { message: GAME_CLOSED_MESSAGE } };
