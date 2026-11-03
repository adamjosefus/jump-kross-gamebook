import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The big button of a player screen: the text in the middle, the icon at the edge. */
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
    className={cn('relative h-14 rounded-full px-12 text-base', className)}
    {...props}
  >
    <span className={cn('absolute flex', iconSide === 'start' ? 'left-5' : 'right-5')}>{icon}</span>
    {children}
  </Button>
);
