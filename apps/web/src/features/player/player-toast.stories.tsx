import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';

import { playerToast } from './player-toast';

const SAMPLES = [
  () => playerToast.success('Jste tým Lišky'),
  () => playerToast.info('Už hrajete za tým Lišky.'),
  () => playerToast.warning('Tenhle kód sem nepatří, hledejte dál.'),
  () => playerToast.error('Nepodařilo se spojit se serverem. Zkuste to prosím znovu.'),
] as const;

/** The player's toasts beside the admin's small ones, in the same Toaster as the app. */
const Demo = () => {
  useEffect(() => {
    // Shown expanded and kept open, so all of them can be looked at side by side.
    for (const show of SAMPLES) show();
    return () => {
      toast.dismiss();
    };
  }, []);
  return (
    <div className='flex flex-wrap gap-2 font-sans'>
      <Button variant='outline' onClick={() => SAMPLES[0]()}>
        Úspěch
      </Button>
      <Button variant='outline' onClick={() => SAMPLES[1]()}>
        Info
      </Button>
      <Button variant='outline' onClick={() => SAMPLES[2]()}>
        Varování
      </Button>
      <Button variant='outline' onClick={() => SAMPLES[3]()}>
        Chyba
      </Button>
      <Button variant='ghost' onClick={() => toast.success('Uloženo (administrace)')}>
        Malá z administrace
      </Button>
      <Toaster position='top-center' expand duration={Number.POSITIVE_INFINITY} />
    </div>
  );
};

const meta = {
  title: 'Player/Notifikace',
  component: Demo,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
} satisfies Meta<typeof Demo>;

export default meta;

export const Prehled: StoryObj<typeof meta> = { name: 'Přehled' };
