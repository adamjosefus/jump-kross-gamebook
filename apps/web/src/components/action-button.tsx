import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The least height of the big player buttons, `ActionButton` and `SlideButton` alike: two lines of
 * their text (`text-xl leading-tight`, 2 × 25px), the `py-2` padding and a 1px border, 68px in all.
 * A third line makes the button taller.
 */
export const PLAYER_BUTTON_HEIGHT = 'min-h-17';

/**
 * The big button of a player screen: the text in the middle, the icon at the edge. The text is as
 * big as the story text (`typography.ts`) and a long one wraps instead of running under the icon.
 */
export const ActionButton = ({
  icon,
  iconSide = 'end',
  className,
  children,
  ...props
}: Readonly<
  Omit<ComponentProps<typeof Button>, 'size' | 'variant'> & {
    readonly icon: ReactNode;
    readonly iconSide?: 'start' | 'end';
  }
>) => (
  <Button
    size='lg'
    className={cn(
      PLAYER_BUTTON_HEIGHT,
      'relative h-auto rounded-full px-12 py-2 text-xl leading-tight text-pretty whitespace-normal',
      className,
    )}
    {...props}
  >
    <span className={cn('absolute flex', iconSide === 'start' ? 'left-5' : 'right-5')}>{icon}</span>
    {children}
  </Button>
);
