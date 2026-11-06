import { useEffect, useEffectEvent, useRef } from 'react';

/** A point in the camera square, 0 to 1 from its top left corner. */
export interface ScanPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The aim at rest: the middle two thirds of the square, where the library scans, with a little
 * room, clockwise from the top left.
 */
const LOW = 1 / 6 + 0.015;
const HIGH = 1 - LOW;
const REST: readonly ScanPoint[] = [
  { x: LOW, y: LOW },
  { x: HIGH, y: LOW },
  { x: HIGH, y: HIGH },
  { x: LOW, y: HIGH },
];
/** Corner radius of the aim. */
const RADIUS = 0.055;
/** The aim around a code is this much larger than the code, so it does not cover it. */
const MARGIN = 1.15;
/** How far the hole in the shade reaches beyond the aim. */
const HOLE = 0.02;
/** Time constant of the aim following its target, in seconds. */
const FOLLOW = 0.15;

/** One quarter of the path (`pathLength` 100): from corner to corner. */
const QUARTER = 25;
/** Length of a corner dash at rest. */
const DASH = 9;
/** Running speed in path units per second: one corner in 1.6 s. */
const SPEED = QUARTER / 1.6;
/** Time constant of speeding up to `SPEED`, in seconds. */
const SPEED_UP = 0.5;
/** Angular frequency of the spring that stops the dashes on the corners. */
const SETTLE = 6;
/** Time constant of the dashes shrinking back or closing up, in seconds. */
const SHRINK = 0.3;

const distance = (from: ScanPoint, to: ScanPoint) => Math.hypot(to.x - from.x, to.y - from.y);

const around = <T,>(items: readonly T[], index: number, fallback: T) =>
  items[(index + items.length) % items.length] ?? fallback;

/** The code's corners grown from their center by `MARGIN`. */
const grow = (corners: readonly ScanPoint[]): readonly ScanPoint[] => {
  const center = {
    x: corners.reduce((sum, point) => sum + point.x, 0) / corners.length,
    y: corners.reduce((sum, point) => sum + point.y, 0) / corners.length,
  };
  return corners.map((point) => ({
    x: center.x + (point.x - center.x) * MARGIN,
    y: center.y + (point.y - center.y) * MARGIN,
  }));
};

/** The clockwise outline moved outwards by `by` on every side. */
const offset = (points: readonly ScanPoint[], by: number) => {
  // Outward normal of the side from a point to the next one (clockwise with y down).
  const normal = (from: ScanPoint, to: ScanPoint) => {
    const length = distance(from, to) || 1;
    return { x: (to.y - from.y) / length, y: -(to.x - from.x) / length };
  };
  return points.map((point, index) => {
    const before = normal(around(points, index - 1, point), point);
    const after = normal(point, around(points, index + 1, point));
    const scale = by / Math.max(1 + before.x * after.x + before.y * after.y, 0.2);
    return { x: point.x + (before.x + after.x) * scale, y: point.y + (before.y + after.y) * scale };
  });
};

/**
 * The corners in the order nearest to `from`, so a code turned upside down does not twist the
 * aim on its way: the code reports its own top left first, wherever it is on the screen.
 */
const nearestOrder = (corners: readonly ScanPoint[], from: readonly ScanPoint[]) => {
  const turns = corners.map((_, shift) => [...corners.slice(shift), ...corners.slice(0, shift)]);
  const cost = (points: readonly ScanPoint[]) =>
    points.reduce((sum, point, index) => sum + distance(point, from[index] ?? point) ** 2, 0);
  return turns.reduce((best, turn) => (cost(turn) < cost(best) ? turn : best));
};

/**
 * A closed path through the points with rounded corners, starting in the middle of the first side
 * so every corner sits in the middle of one quarter of a square's path.
 */
const roundedPath = (points: readonly ScanPoint[], radius: number) => {
  // Where the rounding of a corner meets its side, and its control point: a cubic curve with
  // handles 0.5523 of the radius long is a quarter circle, so the outline and the hole around it
  // have arcs with the same center at right angles.
  const along = (point: ScanPoint, other: ScanPoint, length: number) => {
    const share = Math.min(length / (distance(point, other) || 1), 0.5);
    return { x: point.x + (other.x - point.x) * share, y: point.y + (other.y - point.y) * share };
  };
  const text = (point: ScanPoint) => `${point.x} ${point.y}`;
  const first = around(points, 0, REST[0] ?? { x: 0, y: 0 });
  const second = around(points, 1, first);
  const corners = points.map((_, index) => {
    const point = around(points, index + 1, first);
    const previous = around(points, index, point);
    const next = around(points, index + 2, point);
    const handle = radius * (1 - 0.5523);
    return `L${text(along(point, previous, radius))}C${text(along(point, previous, handle))} ${text(
      along(point, next, handle),
    )} ${text(along(point, next, radius))}`;
  });
  return `M${(first.x + second.x) / 2} ${(first.y + second.y) / 2}${corners.join('')}Z`;
};

/**
 * - `aiming`: waiting for a code.
 * - `arming`: a code is in view and is sent once the outline closes, unless the player looks away.
 * - `busy`: the code was held long enough and is being sent.
 * - `accepted`: the game took the code.
 * - `rejected`: the code was read but does not work, or could not be sent.
 */
export type ScanFrameState = 'aiming' | 'arming' | 'busy' | 'accepted' | 'rejected';

/**
 * The scanner's aim over the whole camera square: medium gray with a hole and an outline drawn as
 * one dash per corner. At rest it marks the middle, where the library scans; once a code is found
 * it glides onto the code. The dashes then turn amber and speed up around the outline, so it is
 * seen even on the black and white camera picture, and while the code is held in view they grow
 * until the gaps close. Then the outline stops and stays closed while the code is sent, and its
 * middle shows the answer: a check mark when the game took the code, an exclamation mark when not. Back to aiming the dashes slow down, stop on the corners and shrink.
 * The motion is computed frame by frame, so it never jumps when anything changes midway.
 */
export const ScanFrame = ({
  state = 'aiming',
  armMs = 3000,
  corners,
}: {
  readonly state?: ScanFrameState;
  /** How long the gaps take to close while `arming`. */
  readonly armMs?: number;
  /** The found code's corners, in any order around it; none while no code is in view. */
  readonly corners?: readonly ScanPoint[] | undefined;
}) => {
  const shade = useRef<SVGPathElement>(null);
  const line = useRef<SVGPathElement>(null);
  const icon = useRef<HTMLDivElement>(null);
  const latest = useEffectEvent(() => ({ state, armMs, corners }));

  useEffect(() => {
    const shadeElement = shade.current;
    const lineElement = line.current;
    const iconElement = icon.current;
    if (shadeElement === null || lineElement === null || iconElement === null) return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Where the aim is, where the dashes' centers are along it (a multiple of a quarter: on the
    // corners), how fast they run and how long they are.
    let points = REST;
    let phase = 0;
    let speed = 0;
    let dash = DASH;
    let armingSince: number | undefined;
    let before = performance.now();
    const step = (now: number) => {
      const seconds = Math.min((now - before) / 1000, 0.1);
      before = now;
      const current = latest();

      const follow = 1 - Math.exp(-seconds / FOLLOW);
      const target =
        current.corners?.length === 4 ? nearestOrder(grow(current.corners), points) : REST;
      points = points.map((point, index) => {
        const goal = target[index] ?? point;
        return {
          x: point.x + (goal.x - point.x) * follow,
          y: point.y + (goal.y - point.y) * follow,
        };
      });

      if (current.state === 'arming' && !reducedMotion.matches)
        speed += (SPEED - speed) * (1 - Math.exp(-seconds / SPEED_UP));
      else {
        // A critically damped spring to the next corner ahead, far enough to stop smoothly.
        const corner = Math.ceil((phase + speed / SETTLE) / QUARTER) * QUARTER;
        speed += (SETTLE ** 2 * (corner - phase) - 2 * SETTLE * speed) * seconds;
      }
      phase += speed * seconds;

      if (current.state === 'arming') {
        armingSince ??= now;
        const progress = Math.min((now - armingSince) / current.armMs, 1);
        dash = Math.max(dash, DASH + (QUARTER - DASH) * progress);
      } else {
        armingSince = undefined;
        const goal = current.state === 'aiming' ? DASH : QUARTER;
        dash += (goal - dash) * (1 - Math.exp(-seconds / SHRINK));
      }

      shadeElement.setAttribute(
        'd',
        `M0 0H1V1H0Z${roundedPath(offset(points, HOLE), RADIUS + HOLE)}`,
      );
      lineElement.setAttribute('d', roundedPath(points, RADIUS));
      const middle = {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      };
      iconElement.style.left = `${middle.x * 100}%`;
      iconElement.style.top = `${middle.y * 100}%`;
      // Dashes grow from their centers and run clockwise, against the offset.
      lineElement.style.strokeDasharray = `${dash} ${QUARTER - dash}`;
      lineElement.style.strokeDashoffset = `${dash / 2 - QUARTER / 2 - phase}`;
      frame = requestAnimationFrame(step);
    };
    let frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className='scan-frame pointer-events-none absolute inset-0' data-state={state}>
      <svg viewBox='0 0 1 1' preserveAspectRatio='none' className='size-full' aria-hidden='true'>
        <path ref={shade} className='scan-frame-shade' fillRule='evenodd' />
        <path ref={line} className='scan-frame-line' pathLength={100} />
      </svg>
      <div ref={icon} className='absolute' aria-hidden='true'>
        <svg viewBox='0 0 24 24' className='scan-frame-icon size-12' data-icon='accepted'>
          <circle cx='12' cy='12' r='11' />
          <path d='m7.5 12.5 3 3 6-6.5' />
        </svg>
        <svg viewBox='0 0 24 24' className='scan-frame-icon size-12' data-icon='rejected'>
          <circle cx='12' cy='12' r='11' />
          <path d='M12 6.75v6.5M12 17.25v.01' />
        </svg>
      </div>
    </div>
  );
};
