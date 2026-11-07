import { IconLoader2 } from '@tabler/icons-react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { useEffect, useState, type ReactNode } from 'react';

import { PLAYER_BUTTON_HEIGHT } from '@/components/action-button';
import { AlertDialog, AlertDialogContent } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * How long the buttons stay locked after the dialog opens. The dialog pops up over a screen the
 * players may be tapping right then, and that tap must not land on one of its buttons.
 */
export const CONFIRM_ARM_MS = 1500;

const BUTTON = cn(
  PLAYER_BUTTON_HEIGHT,
  // Room on both sides for the spinner, so the text stays in the middle (as in ActionButton).
  'relative h-auto w-full rounded-full px-12 py-2 text-xl leading-tight text-pretty whitespace-normal',
  // Locked buttons keep their look but fade, with a spinner until the lock runs out.
  'disabled:opacity-40',
);

/**
 * A question for the players in the look of the story: a big text, two big buttons on top of each
 * other, the safe one below where the thumb is, and both locked for `CONFIRM_ARM_MS` after opening.
 */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  children,
  cancelLabel,
  confirmLabel,
  onConfirm,
  armMs = CONFIRM_ARM_MS,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly cancelLabel: ReactNode;
  readonly confirmLabel: ReactNode;
  readonly onConfirm: () => void;
  readonly armMs?: number;
}) => {
  // Every opening gets its own lock, even when the content stays mounted between them.
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((count) => count + 1);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className='w-[calc(100%-2rem)] max-w-sm gap-6 rounded-3xl p-6 font-story select-none [-webkit-touch-callout:none] data-[size=default]:max-w-sm data-[size=default]:sm:max-w-sm'
        // Focus would arm the safe button for the Enter key; nothing is focused until it unlocks.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className='flex flex-col gap-3'>
          <AlertDialogPrimitive.Title className='story-heading text-balance'>
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className='text-[20px] leading-[1.6] text-pretty'>
            {children}
          </AlertDialogPrimitive.Description>
        </div>
        <Buttons
          key={opening}
          armMs={armMs}
          cancelLabel={cancelLabel}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
};

const Buttons = ({
  armMs,
  cancelLabel,
  confirmLabel,
  onConfirm,
}: {
  readonly armMs: number;
  readonly cancelLabel: ReactNode;
  readonly confirmLabel: ReactNode;
  readonly onConfirm: () => void;
}) => {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), armMs);
    return () => clearTimeout(timer);
  }, [armMs]);

  return (
    <div className='flex flex-col gap-3'>
      <AlertDialogPrimitive.Action asChild onClick={onConfirm}>
        <Button size='lg' disabled={!armed} className={BUTTON}>
          {confirmLabel}
          <Lock armed={armed} />
        </Button>
      </AlertDialogPrimitive.Action>
      <AlertDialogPrimitive.Cancel asChild>
        <Button size='lg' variant='outline' disabled={!armed} className={BUTTON}>
          {cancelLabel}
          <Lock armed={armed} />
        </Button>
      </AlertDialogPrimitive.Cancel>
    </div>
  );
};

/**
 * A spinner at the left edge of a locked button, where the camera button has its icon, so the
 * wait does not look like a fault.
 */
const Lock = ({ armed }: { readonly armed: boolean }) =>
  !armed && (
    <span
      aria-hidden
      className='absolute inset-y-0 left-0 flex aspect-square items-center justify-center'
    >
      <IconLoader2 className='size-5 animate-spin' />
    </span>
  );
