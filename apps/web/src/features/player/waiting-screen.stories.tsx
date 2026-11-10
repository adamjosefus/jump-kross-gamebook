import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useEffect, useState } from 'react';

import { CLOSED_TEXT, type NextCheck, NOT_STARTED_TEXT, WaitingScreen } from './waiting-screen';

/** How long the story waits between two pretend checks of the server. */
const STORY_POLL_MS = 15_000;

/** The waiting screen with a pretend poll that starts over every 15 s, a third of it gone. */
const Polling = (props: ComponentProps<typeof WaitingScreen>) => {
  const [check, setCheck] = useState<NextCheck>(() => {
    const now = Date.now();
    return { from: now - STORY_POLL_MS / 3, at: now + (STORY_POLL_MS * 2) / 3 };
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      const now = Date.now();
      setCheck({ from: now, at: now + STORY_POLL_MS });
    }, check.at - Date.now());
    return () => clearTimeout(timer);
  }, [check]);
  return <WaitingScreen {...props} nextCheck={check} />;
};

/** The screen of a phone that cannot log in yet; it moves on by itself once the game opens. */
const meta = {
  title: 'Player/WaitingScreen',
  component: WaitingScreen,
  parameters: { layout: 'fullscreen' },
  args: { message: NOT_STARTED_TEXT, corner: '26-11-07-345530d' },
} satisfies Meta<typeof WaitingScreen>;

export default meta;

/** Before the organizers start the game: the first thing a phone shows. */
export const NotStarted: StoryObj<typeof meta> = {};

/** The organizers closed the game for a while. */
export const Closed: StoryObj<typeof meta> = { args: { message: CLOSED_TEXT } };

/** The line under the dots fills up until the phone asks the server again. */
export const WithNextCheck: StoryObj<typeof meta> = {
  args: { message: CLOSED_TEXT },
  render: (args) => <Polling {...args} />,
};
