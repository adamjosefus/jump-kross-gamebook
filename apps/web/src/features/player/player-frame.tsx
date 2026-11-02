import { IconChevronLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The frame of every player screen: the same column and a navigation bar of a fixed height above
 * the content, so „Zpět“ is at the same place on all of them. The colors of the screen blend into
 * those of the next one. `dark` keeps the frame in the dark palette in the light mode as well, for
 * the scanner.
 */
export const PlayerFrame = ({
  onBack,
  aside,
  dark = false,
  className,
  children,
}: {
  /** Where „Zpět“ leads; its place stays empty without it. */
  onBack?: (() => void) | undefined;
  /** Shown at the right end of the bar. */
  aside?: ReactNode;
  dark?: boolean;
  /** Colors of the whole screen. */
  className?: string | undefined;
  children: ReactNode;
}) => (
  <div
    className={cn(
      'flex flex-1 flex-col transition-colors duration-700 ease-in-out motion-reduce:transition-none',
      dark && 'dark bg-background text-foreground',
      className,
    )}
  >
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
            <IconChevronLeft /> Zpět
          </Button>
        )}
        {aside}
      </nav>
      {children}
    </div>
  </div>
);
