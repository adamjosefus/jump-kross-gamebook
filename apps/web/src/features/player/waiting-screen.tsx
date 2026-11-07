import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { OPTICAL_CENTER } from './block-look';
import { PlayerFrame } from './player-frame';
import { StoryText } from './story-text/story-text';

/** Delays of the three dots, so they light up one after another. */
const DOT_DELAYS = ['0ms', '200ms', '400ms'] as const;

/**
 * What a phone shows while the teams cannot log in yet: before the organizers start the game, or
 * while they keep it closed. The message is set like the story's text, at the same place as a
 * block, with three breathing dots above it, so the screen does not look frozen; the page asks the
 * server on its own and moves on once the game opens.
 */
export const WaitingScreen = ({
  message,
  corner,
}: {
  readonly message: string;
  /** Shown small in the top left corner, like on the first screen of the intro. */
  readonly corner?: ReactNode;
}) => (
  <PlayerFrame
    lead={
      corner !== undefined && (
        <span className='font-mono text-[0.625rem] tracking-[0.2em] text-muted-foreground/35 tabular-nums'>
          {corner}
        </span>
      )
    }
  >
    <div className={cn('flex-1', OPTICAL_CENTER)} role='status'>
      <div className='flex flex-col gap-6'>
        <div className='flex gap-2' aria-hidden='true'>
          {DOT_DELAYS.map((delay) => (
            <span
              key={delay}
              className='size-2 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none'
              style={{ animationDelay: delay }}
            />
          ))}
        </div>
        <StoryText content={message} theme='default' instant />
      </div>
    </div>
  </PlayerFrame>
);
