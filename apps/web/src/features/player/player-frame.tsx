import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The frame of every player screen: the same column and a navigation bar of a fixed height above
 * the content, so „Zpět“ is at the same place on all of them. `camera` turns the whole frame
 * black, for the scanner.
 */
export const PlayerFrame = ({
  onBack,
  aside,
  camera = false,
  children,
}: {
  /** Where „Zpět“ leads; its place stays empty without it. */
  onBack?: (() => void) | undefined;
  /** Shown at the right end of the bar. */
  aside?: ReactNode;
  camera?: boolean;
  children: ReactNode;
}) => (
  <div className={cn('flex flex-1 flex-col', camera && 'dark bg-black text-white')}>
    <div className='safe-area-padding mx-auto flex w-full max-w-xl flex-1 flex-col gap-6'>
      <nav className='flex h-8 shrink-0 items-center justify-between text-sm text-muted-foreground'>
        {onBack === undefined ? (
          <span />
        ) : (
          <Button
            variant='ghost'
            size='sm'
            className='-ml-3 text-muted-foreground'
            onClick={onBack}
          >
            <ChevronLeft /> Zpět
          </Button>
        )}
        {aside}
      </nav>
      {children}
    </div>
  </div>
);
