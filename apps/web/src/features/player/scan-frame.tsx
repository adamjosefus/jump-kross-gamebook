import { useEffect, useEffectEvent, useRef } from 'react';

/**
 * Outline of the square, starting in the middle of the top side so every corner sits in the middle
 * of one quarter of the path (`pathLength` 100: corners at 12.5, 37.5, 62.5 and 87.5).
 */
const OUTLINE = 'M50 2H90A8 8 0 0 1 98 10V90A8 8 0 0 1 90 98H10A8 8 0 0 1 2 90V10A8 8 0 0 1 10 2Z';

/** One quarter of the path: from corner to corner. */
const QUARTER = 25;
/** Length of a corner dash at rest. */
const DASH = 9;
/** Running speed in path units per second: one corner in 1.6 s. */
const SPEED = QUARTER / 1.6;
/** Time constant of speeding up to `SPEED`, in seconds. */
const SPEED_UP = 0.5;
/** Angular frequency of the spring that stops the dashes on the corners. */
const SETTLE = 6;
/** Time constant of the dashes shrinking back, in seconds. */
const SHRINK = 0.3;

/**
 * - `aiming`: waiting for a code.
 * - `arming`: a code is in view and is sent once the outline closes, unless the player looks away.
 * - `busy`: the code is being sent.
 */
export type ScanFrameState = 'aiming' | 'arming' | 'busy';

/**
 * The scanner's aim: the outline of the scanned region drawn as one dash per corner. Once a code
 * is in view the dashes turn amber and speed up around the outline, so it is seen even on the
 * black and white camera picture; while the code is held in view they grow until the gaps close.
 * Back to aiming they slow down, stop on the corners and shrink. The motion is computed frame by
 * frame, so it never jumps when the state changes midway.
 */
export const ScanFrame = ({
  state = 'aiming',
  armMs = 3000,
}: {
  readonly state?: ScanFrameState;
  /** How long the gaps take to close while `arming`. */
  readonly armMs?: number;
}) => {
  const path = useRef<SVGPathElement>(null);
  const latest = useEffectEvent(() => ({ state, armMs }));

  useEffect(() => {
    const element = path.current;
    if (element === null) return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Where the dashes' centers are along the path (a multiple of a quarter: on the corners),
    // how fast they run and how long they are.
    let phase = 0;
    let speed = 0;
    let dash = DASH;
    let armingSince: number | undefined;
    let before = performance.now();
    const step = (now: number) => {
      const seconds = Math.min((now - before) / 1000, 0.1);
      before = now;
      const current = latest();

      if (current.state !== 'aiming' && !reducedMotion.matches)
        speed += (SPEED - speed) * (1 - Math.exp(-seconds / SPEED_UP));
      else {
        // A critically damped spring to the next corner ahead, far enough to stop smoothly.
        const target = Math.ceil((phase + speed / SETTLE) / QUARTER) * QUARTER;
        speed += (SETTLE ** 2 * (target - phase) - 2 * SETTLE * speed) * seconds;
      }
      phase += speed * seconds;

      if (current.state === 'arming') {
        armingSince ??= now;
        const progress = Math.min((now - armingSince) / current.armMs, 1);
        dash = Math.max(dash, DASH + (QUARTER - DASH) * progress);
      } else {
        armingSince = undefined;
        dash += (DASH - dash) * (1 - Math.exp(-seconds / SHRINK));
      }

      // Dashes grow from their centers and run clockwise, against the offset.
      element.style.strokeDasharray = `${dash} ${QUARTER - dash}`;
      element.style.strokeDashoffset = `${dash / 2 - QUARTER / 2 - phase}`;
      frame = requestAnimationFrame(step);
    };
    let frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg
      viewBox='0 0 100 100'
      className='scan-frame size-full overflow-visible'
      data-state={state}
      aria-hidden='true'
    >
      <path ref={path} d={OUTLINE} pathLength={100} />
    </svg>
  );
};
