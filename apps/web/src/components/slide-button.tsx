import { ChevronRight } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Part of the track the thumb has to travel before letting go confirms. */
const THRESHOLD = 0.9;

type Stage = 'idle' | 'confirmed' | 'pending';

/**
 * A button that has to be slid to the end, like dismissing an alarm on a phone, so a choice is
 * never made by a stray tap. After confirming, the thumb stays at the end while `disabled` (the
 * move is being sent) and returns when it is enabled again.
 */
export const SlideButton = ({
  children,
  onConfirm,
  disabled = false,
  className,
}: {
  children: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) => {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; max: number; offset: number }>();
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

  return (
    <div
      ref={track}
      className={cn(
        'relative flex min-h-14 items-center rounded-xl border bg-muted/40 py-1 pr-4 pl-16 select-none',
        disabled && stage === 'idle' && 'opacity-50',
        className,
      )}
    >
      <span
        className='flex-1 py-2 text-center text-base font-medium'
        style={{ opacity: Math.max(1 - progress * 1.5, 0) }}
      >
        {children}
      </span>
      <button
        type='button'
        aria-label='Posuňte doprava pro potvrzení'
        disabled={disabled && stage === 'idle'}
        className={cn(
          'absolute top-1 bottom-1 flex w-12 cursor-grab touch-none items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing disabled:cursor-not-allowed',
          drag === undefined && 'transition-[left] duration-300 ease-out',
        )}
        style={{ left: `calc(0.25rem + ${progress} * (100% - 3.5rem))` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(undefined)}
        onKeyDown={onKeyDown}
      >
        <ChevronRight className='size-5' />
      </button>
    </div>
  );
};
