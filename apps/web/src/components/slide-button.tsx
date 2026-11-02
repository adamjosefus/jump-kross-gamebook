import { IconArrowRight, IconChevronRight } from '@tabler/icons-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import { preloadChord, startChord, type ChordNotes, type ChordPlayer } from '@/lib/chord-sound';
import { cn } from '@/lib/utils';

/** Part of the track the thumb has to travel before letting go confirms. */
const THRESHOLD = 0.9;
/** How long the chord rings after a confirmed slide, and after a slide let go halfway. */
const RELEASE_SECONDS = 1.8;
const CANCEL_SECONDS = 0.3;

type Stage = 'idle' | 'confirmed' | 'pending';

const Label = ({ children }: { readonly children: ReactNode }) => (
  <span
    data-slot='slide-button-label'
    className='absolute inset-x-14 top-1/2 -translate-y-1/2 truncate text-center text-base font-medium'
  >
    {children}
  </span>
);

const TargetArrow = ({ visible }: { readonly visible: boolean }) => (
  <IconArrowRight
    className={cn(
      'absolute top-1/2 right-5 size-5 -translate-y-1/2 transition-opacity duration-150',
      !visible && 'opacity-0',
    )}
  />
);

/**
 * A button that has to be slid to the end, like dismissing an alarm on a phone, so a choice is
 * never made by a stray tap. While sliding, the thumb is as high as the track and grows until it
 * fills it. After confirming, it stays full while `disabled` (the move is being sent) and returns
 * when it is enabled again. The label is always one line in the middle of the track and stays
 * readable over the thumb: a second copy in the thumb's text color is clipped to the thumb. A touch
 * swaps the thumb's chevron for an arrow at the end of the track, where the slide leads.
 *
 * With a `chord`, the slide is heard too: its first note starts with the touch, the others join
 * as the thumb passes their share of the track, and the whole chord sounds where letting go
 * confirms. A confirmed slide lets it ring out; a slide given up fades quickly.
 */
export const SlideButton = ({
  children,
  onConfirm,
  disabled = false,
  chord,
  className,
}: {
  readonly children: ReactNode;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  /** Notes played along the track, lowest first; silent without them. */
  readonly chord?: ChordNotes | undefined;
  readonly className?: string;
}) => {
  const track = useRef<HTMLDivElement>(null);
  // The chord of the slide in progress; a ref, as it is audio state, not something to render.
  const sound = useRef<ChordPlayer>(undefined);
  useEffect(() => {
    if (chord !== undefined) preloadChord(chord);
  }, [chord]);
  const [drag, setDrag] = useState<{
    readonly from: number;
    readonly max: number;
    readonly offset: number;
  }>();
  const [stage, setStage] = useState<Stage>('idle');
  // Waits for the move to start and to finish; then the thumb can return.
  if (stage === 'confirmed' && disabled) setStage('pending');
  if (stage === 'pending' && !disabled) setStage('idle');

  const progress =
    stage === 'idle' ? (drag === undefined ? 0 : drag.offset / Math.max(drag.max, 1)) : 1;

  const confirm = () => {
    setStage('confirmed');
    onConfirm();
  };
  const silence = (seconds: number) => {
    sound.current?.release(seconds);
    sound.current = undefined;
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || stage !== 'idle' || track.current === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const max = track.current.clientWidth - event.currentTarget.offsetWidth - 8;
    setDrag({ from: event.clientX, max, offset: 0 });
    if (chord !== undefined) {
      silence(CANCEL_SECONDS);
      // Started here, in the gesture, which is when a browser lets a page make sound.
      sound.current = startChord(chord, THRESHOLD);
      sound.current.setProgress(0);
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag === undefined) return;
    const offset = Math.min(Math.max(event.clientX - drag.from, 0), drag.max);
    setDrag({ ...drag, offset });
    sound.current?.setProgress(offset / Math.max(drag.max, 1));
  };
  const onPointerUp = () => {
    if (drag === undefined) return;
    setDrag(undefined);
    const confirmed = drag.offset >= drag.max * THRESHOLD;
    silence(confirmed ? RELEASE_SECONDS : CANCEL_SECONDS);
    if (confirmed) confirm();
  };
  const onPointerCancel = () => {
    setDrag(undefined);
    silence(CANCEL_SECONDS);
  };
  // Keyboards cannot slide; the right arrow or End is the deliberate equivalent, with the whole
  // chord at once.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key !== 'ArrowRight' && event.key !== 'End') || disabled || stage !== 'idle') return;
    if (chord !== undefined) {
      const player = startChord(chord, THRESHOLD);
      player.setProgress(1);
      player.release(RELEASE_SECONDS);
    }
    confirm();
  };

  const active = drag !== undefined || stage !== 'idle';
  // Where the thumb ends, from the left edge of the track; a sliding thumb covers its border too.
  const thumbEnd = `(3.25rem + ${progress} * (100% + 1px - 3.25rem))`;

  return (
    <div
      ref={track}
      className={cn(
        'relative h-14 rounded-full border bg-muted/40 select-none',
        disabled && stage === 'idle' && 'opacity-50',
        className,
      )}
    >
      <Label>{children}</Label>
      <TargetArrow visible={active} />
      <button
        type='button'
        aria-label='Posuňte doprava pro potvrzení'
        disabled={disabled && stage === 'idle'}
        className={cn(
          'absolute flex cursor-grab touch-none items-center justify-end rounded-full bg-primary pr-3.5 text-primary-foreground shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed',
          active ? '-top-px -bottom-px -left-px' : 'top-1 bottom-1 left-1',
          drag === undefined
            ? 'transition-[top,bottom,left,right] duration-300 ease-out'
            : 'transition-[top,bottom,left] duration-150 ease-out',
        )}
        // The end is set directly, so a touch moves only the other three sides, not this one.
        style={{ right: `calc(100% - ${thumbEnd})` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <IconChevronRight
          className={cn('size-5 transition-opacity duration-150', active && 'opacity-0')}
        />
      </button>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 text-primary-foreground',
          drag === undefined && 'transition-[clip-path] duration-300 ease-out',
        )}
        style={{ clipPath: `inset(-1px calc(100% - ${thumbEnd}) -1px -1px)` }}
      >
        <Label>{children}</Label>
        <TargetArrow visible={active} />
      </div>
    </div>
  );
};
