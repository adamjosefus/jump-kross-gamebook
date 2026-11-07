import type { ReactNode } from 'react';

import { PlayerFrame } from './player-frame';

/** Delays of the three dots, so they light up one after another. */
const DOT_DELAYS = ['0ms', '200ms', '400ms'] as const;

/**
 * What a phone shows while the teams cannot log in yet: before the organizers start the game, or
 * while they keep it closed. Three dots breathe above the message, so the screen does not look
 * frozen; the page asks the server on its own and moves on once the game opens.
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
    <div
      className='flex min-h-[60dvh] flex-1 flex-col items-center justify-center gap-6'
      role='status'
    >
      <div className='flex gap-2' aria-hidden='true'>
        {DOT_DELAYS.map((delay) => (
          <span
            key={delay}
            className='size-2 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none'
            style={{ animationDelay: delay }}
          />
        ))}
      </div>
      <p className='max-w-xs text-center text-balance'>{message}</p>
    </div>
  </PlayerFrame>
);
