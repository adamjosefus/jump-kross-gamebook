import { IconArrowLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The frame of every player screen: the same column and a navigation bar of a fixed height above
 * the content, so „Zpět“ is at the same place on all of them. The colors of the screen blend into
 * those of the next one. No text can be selected, so a long press while reading or scanning does
 * not open the selection or the iOS callout.
 */
export const PlayerFrame = ({
  onBack,
  lead,
  aside,
  className,
  children,
}: {
  /** Where „Zpět“ leads; without it, its place has `lead` or stays empty. */
  readonly onBack?: (() => void) | undefined;
  /** Shown at the left end of the bar when there is no „Zpět“. */
  readonly lead?: ReactNode;
  /** Shown at the right end of the bar. */
  readonly aside?: ReactNode;
  /** Colors of the whole screen. */
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) => (
  <div
    className={cn(
      'flex flex-1 flex-col transition-colors duration-700 ease-in-out select-none [-webkit-touch-callout:none] motion-reduce:transition-none',
      className,
    )}
  >
    <div className='safe-area-padding mx-auto flex w-full max-w-xl flex-1 flex-col gap-6'>
      <nav className='flex h-8 shrink-0 items-center justify-between text-sm text-muted-foreground'>
        {onBack === undefined ? (
          <span>{lead}</span>
        ) : (
          <Button
            variant='secondary'
            size='icon'
            aria-label='Zpět'
            className='rounded-full'
            onClick={onBack}
          >
            {/* The arrowhead weighs the glyph to the left; a pixel to the right centers it. */}
            <IconArrowLeft className='size-4 translate-x-px' />
          </Button>
        )}
        {aside}
      </nav>
      {children}
    </div>
  </div>
);
