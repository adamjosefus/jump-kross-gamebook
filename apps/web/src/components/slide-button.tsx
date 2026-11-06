import { IconArrowRight, IconChevronRight } from '@tabler/icons-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { PLAYER_BUTTON_HEIGHT } from '@/components/action-button';
import { hapticLight, hapticStrong } from '@/lib/haptics';
import { cn } from '@/lib/utils';

/** Part of the track the thumb has to travel before letting go confirms. */
const THRESHOLD = 0.9;

type Stage = 'idle' | 'confirmed' | 'pending';

const Label = ({ children }: { readonly children: ReactNode }) => (
  <span
    data-slot='slide-button-label'
    className='flex-1 px-16 py-2 text-center text-xl leading-tight font-medium text-pretty'
  >
    {children}
  </span>
);

/**
 * A button that has to be slid to the end, like dismissing an alarm on a phone, so a choice is
 * never made by a stray tap. While sliding, the thumb is as high as the track and grows until it
 * fills it. After confirming, it stays full while `disabled` (the move is being sent) and returns
 * when it is enabled again. A long label wraps and the track grows with it; at rest the thumb stays
 * a circle in the middle of its height. The label stays readable over the thumb: a second copy in
 * the thumb's text color is clipped to the thumb. A touch hides the thumb's chevron; the arrow at
 * the end of the track is clipped the same way, so the thumb uncovers it only when it gets there.
 * The thumb can be grabbed a little beyond its visible edge.
 */
export const SlideButton = ({
  children,
  onConfirm,
  disabled = false,
  className,
}: {
  readonly children: ReactNode;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}) => {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    readonly from: number;
    readonly max: number;
    readonly offset: number;
  }>();
  const [stage, setStage] = useState<Stage>('idle');
  // So the click at the end comes once per arrival, not on every move past the threshold.
  const atEnd = useRef(false);
  // Waits for the move to start and to finish; then the thumb can return.
  if (stage === 'confirmed' && disabled) setStage('pending');
  if (stage === 'pending' && !disabled) setStage('idle');

  const progress =
    stage === 'idle' ? (drag === undefined ? 0 : drag.offset / Math.max(drag.max, 1)) : 1;

  const confirm = () => {
    setStage('confirmed');
    onConfirm();
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || stage !== 'idle' || track.current === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const max = track.current.clientWidth - event.currentTarget.offsetWidth - 8;
    setDrag({ from: event.clientX, max, offset: 0 });
    atEnd.current = false;
    hapticLight();
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag === undefined) return;
    const offset = Math.min(Math.max(event.clientX - drag.from, 0), drag.max);
    setDrag({ ...drag, offset });
    const arrived = offset >= drag.max * THRESHOLD;
    if (arrived && !atEnd.current) hapticStrong();
    atEnd.current = arrived;
  };
  const onPointerUp = () => {
    if (drag === undefined) return;
    setDrag(undefined);
    if (drag.offset >= drag.max * THRESHOLD) confirm();
  };
  // Keyboards cannot slide; the right arrow or End is the deliberate equivalent.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === 'ArrowRight' || event.key === 'End') && !disabled && stage === 'idle') {
      hapticStrong();
      confirm();
    }
  };

  const active = drag !== undefined || stage !== 'idle';
  // Where the thumb ends, from the left edge of the track; a sliding thumb covers its border too.
  // At rest the thumb is 0.25rem from the edge and fills the track's height but 0.25rem on each side.
  const thumbEnd = `(3.875rem + ${progress} * (100% + 1px - 3.875rem))`;

  return (
    <div
      ref={track}
      className={cn(
        PLAYER_BUTTON_HEIGHT,
        'relative flex items-center rounded-full border bg-muted/40 select-none',
        disabled && stage === 'idle' && 'opacity-50',
        className,
      )}
    >
      <Label>{children}</Label>
      <button
        type='button'
        aria-label='Posuňte doprava pro potvrzení'
        disabled={disabled && stage === 'idle'}
        className={cn(
          'absolute flex cursor-grab touch-none items-center justify-end rounded-full bg-primary pr-4.75 text-primary-foreground shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed',
          // An invisible margin around the thumb, so a finger catches it even slightly off.
          "before:absolute before:-inset-4 before:rounded-full before:content-['']",
          active
            ? '-top-px -bottom-px -left-px'
            : 'top-[calc(50%-1.8125rem)] bottom-[calc(50%-1.8125rem)] left-1',
          drag === undefined
            ? 'transition-[top,bottom,left,right] duration-300 ease-out'
            : 'transition-[top,bottom,left] duration-150 ease-out',
        )}
        // The end is set directly, so a touch moves only the other three sides, not this one.
        style={{ right: `calc(100% - ${thumbEnd})` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(undefined)}
        onKeyDown={onKeyDown}
      >
        <IconChevronRight
          className={cn('size-5 transition-opacity duration-150', active && 'opacity-0')}
        />
      </button>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center text-primary-foreground',
          drag === undefined && 'transition-[clip-path] duration-300 ease-out',
        )}
        style={{ clipPath: `inset(-1px calc(100% - ${thumbEnd}) -1px -1px)` }}
      >
        <Label>{children}</Label>
        <span className='absolute inset-y-0 right-0 flex aspect-square items-center justify-center'>
          <IconArrowRight className='size-5' />
        </span>
      </div>
    </div>
  );
};
