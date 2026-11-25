import { IconArrowLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The frame of every player screen: the same column and a navigation bar of a fixed height above
 * the content, so „Zpět“ is at the same place on all of them. The colors of the screen blend into
 * those of the next one. No text can be selected, so a long press while reading or scanning does
 * not open the selection or the iOS callout.
 *
 * While the team's reading time counts, a strip along the top edge of the screen says so: the game
 * time stands still and the team can read at ease. It has no text, only the color.
 */
export const PlayerFrame = ({
  onBack,
  lead,
  aside,
  reading = false,
  className,
  children,
}: {
  /** Where „Zpět“ leads; without it, its place has `lead` or stays empty. */
  readonly onBack?: (() => void) | undefined;
  /** Shown at the left end of the bar when there is no „Zpět“. */
  readonly lead?: ReactNode;
  /** Shown at the right end of the bar. */
  readonly aside?: ReactNode;
  /** The team's reading time counts now; shows the reading strip. */
  readonly reading?: boolean;
  /** Colors of the whole screen. */
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) => (
  <>
    {/* Outside the container below: in older browsers a size container holds `fixed` children
        in itself, and the strip would scroll away with a long text. */}
    <div
      aria-hidden
      data-reading={reading}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-(--safe-area-inset-top) z-10 h-1 bg-reading transition-opacity duration-700 ease-in-out motion-reduce:transition-none',
        reading ? 'opacity-100' : 'opacity-0',
      )}
    />
    <div
      className={cn(
        '@container/player flex flex-1 flex-col transition-colors duration-700 ease-in-out select-none [-webkit-touch-callout:none] motion-reduce:transition-none',
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
  </>
);
