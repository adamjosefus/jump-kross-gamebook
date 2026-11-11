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

/** When the phone last asked the server and when it asks again, in epoch milliseconds. */
export type NextCheck = { readonly from: number; readonly at: number };

/** Delays of the three dots, so they light up one after another. */
const DOT_DELAYS = ['0ms', '200ms', '400ms'] as const;

/** How long the full arc takes to drain after a check, before it fills again. */
const DRAIN_MS = 900;

/** Size of each of the three dots and of the pie. */
const CIRCLE = 'size-3.5';

/**
 * The fourth circle after the dots: a pie chart that slowly turns while its slice grows clockwise
 * until the phone asks the server again, with nothing drawn behind it. After every answer the slice drains,
 * its tail chasing its head, and grows again, so the team sees the screen is alive and when it may
 * move on. The slice is a stroke as wide as the radius of its circle, so it covers the disc from
 * the center to the edge.
 */
const CheckPie = ({ from, at }: NextCheck) => {
  const arc = useRef<SVGCircleElement>(null);
  const running = useRef<Animation | null>(null);
  useEffect(() => {
    const element = arc.current;
    if (element === null) return;
    const now = Date.now();
    const previous = running.current;
    // Where the arc stands right now, before the old animation is dropped.
    const current = Number.parseFloat(getComputedStyle(element).strokeDashoffset) || 0;
    previous?.cancel();
    const remaining = Math.max(at - now, 1);
    if (previous === null) {
      // The first check: the arc starts as full as the time already gone.
      const done = Math.min(Math.max((now - from) / Math.max(at - from, 1), 0), 1);
      running.current = element.animate(
        [{ strokeDashoffset: String(1 - done) }, { strokeDashoffset: '0' }],
        { duration: remaining, easing: 'linear', fill: 'forwards' },
      );
      return;
    }
    const split = Math.min(DRAIN_MS, remaining / 2) / remaining;
    running.current = element.animate(
      [
        { strokeDashoffset: String(current), easing: 'ease-in-out' },
        { strokeDashoffset: '-1', offset: split },
        // Empty at -1 and at 1 alike, so the jump does not show.
        { strokeDashoffset: '1', offset: split },
        { strokeDashoffset: '0' },
      ],
      { duration: remaining, easing: 'linear', fill: 'forwards' },
    );
  }, [from, at]);
  useEffect(() => () => running.current?.cancel(), []);
  return (
    <svg viewBox='0 0 14 14' className={cn(CIRCLE, 'waiting-pie')}>
      <circle
        ref={arc}
        cx='7'
        cy='7'
        r='3.5'
        fill='none'
        strokeWidth='7'
        pathLength={1}
        strokeDasharray='1'
        strokeDashoffset='1'
        transform='rotate(-90 7 7)'
        className='stroke-muted-foreground'
      />
    </svg>
  );
};

/**
 * What a phone shows while the teams cannot play: before the organizers start the game, or while
 * they keep it paused, whether the phone is logged in to a team or not yet. The message is set
 * like the story's text, at the same place as a block, with three dots lighting up above it, so
 * the screen does not look frozen; the page asks the server on its own and moves on once the game
 * opens. A pie after the dots fills up until the next time it asks.
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
  /** When the page asks the server again; without it, only the dots are shown. */
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
        <div className='flex items-center gap-2.5' aria-hidden='true'>
          {DOT_DELAYS.map((delay) => (
            <span
              key={delay}
              className={cn(CIRCLE, 'waiting-dot rounded-full bg-muted-foreground')}
              style={{ animationDelay: delay }}
            />
          ))}
          {nextCheck !== undefined && <CheckPie {...nextCheck} />}
        </div>
        <StoryText content={message} theme='default' instant />
      </div>
    </div>
  </PlayerFrame>
);
