import { GAME_CLOSED_MESSAGE, GAME_NOT_STARTED_MESSAGE } from '@gamebook/api';
import { type ReactNode, useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import { OPTICAL_CENTER } from './block-look';
import { PlayerFrame } from './player-frame';
import { StoryText } from './story-text/story-text';

/** The waiting screen before the start; it also says the phone needs nothing more from the team. */
export const NOT_STARTED_TEXT = `${GAME_NOT_STARTED_MESSAGE}\n\nAž hra začne, sama se načte.`;

/**
 * The waiting screen while the organizers keep the game paused, before the login and in the middle
 * of the game alike; the team goes on where it stopped once the game runs again.
 */
export const CLOSED_TEXT = `${GAME_CLOSED_MESSAGE}\n\nAž bude hra pokračovat, sama se načte.`;

/** Delays of the three dots, so they light up one after another. */
const DOT_DELAYS = ['0ms', '200ms', '400ms'] as const;

/** When the phone last asked the server and when it asks again, in epoch milliseconds. */
export type NextCheck = { readonly from: number; readonly at: number };

/**
 * A hairline that fills up until the phone asks the server again whether the game runs, so the
 * team sees the screen is alive and when it may move on. It starts again with every answer.
 */
const NextCheckBar = ({ from, at }: NextCheck) => {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (element === null) return undefined;
    const total = Math.max(at - from, 1);
    const done = Math.min(Math.max((Date.now() - from) / total, 0), 1);
    const animation = element.animate(
      [{ transform: `scaleX(${done})` }, { transform: 'scaleX(1)' }],
      { duration: Math.max(at - Date.now(), 0), easing: 'linear', fill: 'forwards' },
    );
    return () => animation.cancel();
  }, [from, at]);
  return (
    <span
      className='block h-0.5 w-14 overflow-hidden rounded-full bg-muted-foreground/20'
      aria-hidden='true'
    >
      <span
        ref={bar}
        className='block h-full origin-left bg-muted-foreground'
        // Not Tailwind's scale-x-0: it sets `scale`, which would multiply the animated transform.
        style={{ transform: 'scaleX(0)' }}
      />
    </span>
  );
};

/**
 * What a phone shows while the teams cannot play: before the organizers start the game, or while
 * they keep it paused, whether the phone is logged in to a team or not yet. The message is set
 * like the story's text, at the same place as a block, with three breathing dots above it, so the
 * screen does not look frozen; the page asks the server on its own and moves on once the game
 * opens. A line under the dots fills up until the next time it asks.
 */
export const WaitingScreen = ({
  message,
  corner,
  aside,
  nextCheck,
}: {
  /** Markdown, set like the story's text. */
  readonly message: string;
  /** Shown small in the top left corner, like on the first screen of the intro. */
  readonly corner?: ReactNode;
  /** Shown at the right end of the bar, like the sign of a lost connection. */
  readonly aside?: ReactNode;
  /** When the page asks the server again; without it, no line is shown. */
  readonly nextCheck?: NextCheck | undefined;
}) => (
  <PlayerFrame
    lead={
      corner !== undefined && (
        <span className='font-mono text-[0.625rem] tracking-[0.2em] text-muted-foreground/35 tabular-nums'>
          {corner}
        </span>
      )
    }
    aside={aside}
  >
    <div className={cn('flex-1', OPTICAL_CENTER)} role='status'>
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-3'>
          <div className='flex gap-2' aria-hidden='true'>
            {DOT_DELAYS.map((delay) => (
              <span
                key={delay}
                className='size-2 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none'
                style={{ animationDelay: delay }}
              />
            ))}
          </div>
          {nextCheck !== undefined && <NextCheckBar {...nextCheck} />}
        </div>
        <StoryText content={message} theme='default' instant />
      </div>
    </div>
  </PlayerFrame>
);
