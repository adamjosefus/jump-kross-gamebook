import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { CONFIRM_ARM_MS, ConfirmDialog } from './confirm-dialog';

/** The dialog over a player screen; it opens at once and opens again from the button. */
const Demo = ({ armMs }: { readonly armMs: number }) => {
  const [open, setOpen] = useState(true);
  const [answer, setAnswer] = useState<string>();
  return (
    <div className='flex flex-col items-start gap-3 font-sans text-sm'>
      <Button variant='outline' onClick={() => setOpen(true)}>
        Otevřít dialog
      </Button>
      {answer !== undefined && <p className='text-muted-foreground'>Vybráno: {answer}</p>}
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setAnswer((current) => current ?? 'Zůstat');
        }}
        armMs={armMs}
        title='Přepnout na jiný tým?'
        confirmLabel='Přepnout tým'
        cancelLabel='Zůstat v týmu Lišky'
        onConfirm={() => setAnswer('Přepnout')}
      >
        Naskenovali jste přihlašovací kód jiného týmu. Když přepnete, bude tento telefon hrát za něj
        místo za tým Lišky.
      </ConfirmDialog>
    </div>
  );
};

const meta = {
  title: 'Player/Dialog',
  component: Demo,
  args: { armMs: CONFIRM_ARM_MS },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
} satisfies Meta<typeof Demo>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The buttons unlock after `CONFIRM_ARM_MS`; reopen the dialog to see it again. */
export const Prepnuti: Story = { name: 'Přepnutí týmu' };
