import { IconArrowRight, IconChevronRight } from '@tabler/icons-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Part of the track the thumb has to travel before letting go confirms. */
const THRESHOLD = 0.9;

type Stage = 'idle' | 'confirmed' | 'pending';

const Label = ({ children }: { readonly children: ReactNode }) => (
  <span
    data-slot='slide-button-label'
    className='absolute inset-x-14 top-1/2 -translate-y-1/2 truncate text-center text-base font-medium'
  >
    {children}
  </span>
);

/**
 * A button that has to be slid to the end, like dismissing an alarm on a phone, so a choice is
 * never made by a stray tap. While sliding, the thumb is as high as the track and grows until it
 * fills it. After confirming, it stays full while `disabled` (the move is being sent) and returns
 * when it is enabled again. The label is always one line in the middle of the track and stays
 * readable over the thumb: a second copy in the thumb's text color is clipped to the thumb. A touch
 * hides the thumb's chevron; the arrow at the end of the track is clipped the same way, so the
 * thumb uncovers it only when it gets there.
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
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag !== undefined)
      setDrag({ ...drag, offset: Math.min(Math.max(event.clientX - drag.from, 0), drag.max) });
  };
  const onPointerUp = () => {
    if (drag === undefined) return;
    setDrag(undefined);
    if (drag.offset >= drag.max * THRESHOLD) confirm();
  };
  // Keyboards cannot slide; the right arrow or End is the deliberate equivalent.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === 'ArrowRight' || event.key === 'End') && !disabled && stage === 'idle')
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
          'pointer-events-none absolute inset-0 text-primary-foreground',
          drag === undefined && 'transition-[clip-path] duration-300 ease-out',
        )}
        style={{ clipPath: `inset(-1px calc(100% - ${thumbEnd}) -1px -1px)` }}
      >
        <Label>{children}</Label>
        <IconArrowRight className='absolute top-1/2 right-5 size-5 -translate-y-1/2' />
      </div>
    </div>
  );
};
