import type { Theme } from '@gamebook/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  IconCamera,
  IconChevronLeft,
  IconArrowRight,
  IconLoader2,
  IconRotateClockwise,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { ActionButton } from '@/components/action-button';
import { SlideButton } from '@/components/slide-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { THEME_PAGE } from './block-look';

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='flex flex-col gap-2'>
    <p className='font-sans text-xs opacity-60'>{label}</p>
    {children}
  </div>
);

/** All the buttons of the player, as its screens use them. */
const Buttons = () => (
  <div className='flex flex-col gap-6'>
    <Row label='Další'>
      <ActionButton icon={<IconArrowRight className='size-5' />}>Další</ActionButton>
    </Row>
    <Row label='Volby'>
      <SlideButton onConfirm={() => undefined}>Vyrazit na cestu</SlideButton>
      <SlideButton onConfirm={() => undefined}>Vrátit se domů a zkusit to jindy znovu</SlideButton>
      <SlideButton onConfirm={() => undefined} disabled>
        Vypnutá volba
      </SlideButton>
    </Row>
    <Row label='Povolení kamery'>
      <ActionButton iconSide='start' icon={<IconCamera className='size-5' />}>
        Povolit kameru
      </ActionButton>
      <ActionButton
        iconSide='start'
        icon={<IconLoader2 className='size-5 animate-spin' />}
        disabled
      >
        Povolit kameru
      </ActionButton>
    </Row>
    <Row label='Skener'>
      <div>
        <Button variant='secondary'>
          <IconRotateClockwise /> Zkusit znovu
        </Button>
      </div>
    </Row>
    <Row label='Zpět'>
      <div>
        <Button variant='ghost' size='sm' className='text-muted-foreground'>
          <IconChevronLeft /> Zpět
        </Button>
      </div>
    </Row>
    <Row label='Dialog'>
      <div className='flex flex-wrap gap-2'>
        <Button variant='outline'>Zůstat v týmu Lišky</Button>
        <Button>Přepnout tým</Button>
      </div>
    </Row>
  </div>
);

const PAGES: readonly { name: string; theme: Theme }[] = [
  { name: 'Běžná stránka', theme: 'default' },
  { name: 'Zelená stránka', theme: 'green' },
  { name: 'Červená stránka', theme: 'red' },
];

const Mode = ({ mode }: { mode: 'light' | 'dark' }) => (
  <section
    className={cn(
      'flex flex-col gap-6 bg-background p-8 text-foreground',
      mode === 'dark' && 'dark',
    )}
  >
    <h2 className='font-sans text-sm font-semibold'>
      {mode === 'dark' ? 'Tmavý režim' : 'Světlý režim'}
    </h2>
    <div className='flex flex-wrap items-start gap-x-10 gap-y-10'>
      {PAGES.map(({ name, theme }) => (
        <article key={name} className='flex w-[390px] flex-col gap-2 font-story'>
          <p className='font-sans text-xs text-muted-foreground'>{name}</p>
          <div className={cn('rounded-xl border p-5', THEME_PAGE[theme])}>
            <Buttons />
          </div>
        </article>
      ))}
    </div>
  </section>
);

const Overview = () => (
  <div className='-m-8 flex flex-col'>
    <Mode mode='light' />
    <Mode mode='dark' />
  </div>
);

const meta = {
  title: 'Player/Tlačítka',
  component: Overview,
} satisfies Meta<typeof Overview>;

export default meta;

export const Prehled: StoryObj<typeof meta> = { name: 'Přehled' };
