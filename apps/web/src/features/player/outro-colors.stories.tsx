import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flag } from 'lucide-react';

import { ThemeContext } from '@/lib/theme';
import { cn } from '@/lib/utils';

import { StoryText } from './story-text/story-text';

/** Proposals for the colors of the outro's whole page, to choose from; the game has none of them. */
interface Colors {
  readonly background: string;
  readonly color: string;
}

interface Proposal {
  readonly name: string;
  readonly light: Colors;
  readonly dark: Colors;
}

const PROPOSALS: readonly Proposal[] = [
  {
    name: 'A · Současný stav',
    light: { background: 'oklch(0.962 0.059 95.6)', color: 'oklch(0.279 0.077 45.6)' },
    dark: { background: 'oklch(0.286 0.066 53.8)', color: 'oklch(0.962 0.059 95.6)' },
  },
  {
    name: 'B · Jemné zlato',
    light: { background: 'oklch(0.97 0.03 92)', color: 'oklch(0.3 0.06 75)' },
    dark: { background: 'oklch(0.25 0.03 88)', color: 'oklch(0.9 0.07 90)' },
  },
  {
    name: 'C · Sytá zlatá',
    light: { background: 'oklch(0.84 0.13 88)', color: 'oklch(0.22 0.05 70)' },
    dark: { background: 'oklch(0.74 0.13 85)', color: 'oklch(0.18 0.04 70)' },
  },
  {
    name: 'D · Zlato na tmavé',
    light: { background: 'oklch(0.2 0.015 85)', color: 'oklch(0.86 0.12 88)' },
    dark: { background: 'oklch(0.2 0.015 85)', color: 'oklch(0.86 0.12 88)' },
  },
  {
    name: 'E · Šalvějová zelená',
    light: { background: 'oklch(0.95 0.03 150)', color: 'oklch(0.28 0.06 155)' },
    dark: { background: 'oklch(0.25 0.035 155)', color: 'oklch(0.92 0.05 150)' },
  },
  {
    name: 'F · Lesní zelená',
    light: { background: 'oklch(0.32 0.07 155)', color: 'oklch(0.96 0.03 130)' },
    dark: { background: 'oklch(0.32 0.07 155)', color: 'oklch(0.96 0.03 130)' },
  },
  {
    name: 'G · Jemná červená',
    light: { background: 'oklch(0.95 0.025 25)', color: 'oklch(0.32 0.11 25)' },
    dark: { background: 'oklch(0.25 0.05 25)', color: 'oklch(0.92 0.04 25)' },
  },
  {
    name: 'H · Vínová',
    light: { background: 'oklch(0.32 0.11 20)', color: 'oklch(0.96 0.025 70)' },
    dark: { background: 'oklch(0.32 0.11 20)', color: 'oklch(0.96 0.025 70)' },
  },
];

const Mode = ({ mode }: { mode: 'light' | 'dark' }) => (
  <ThemeContext value={{ preference: mode, resolved: mode, setPreference: () => undefined }}>
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
        {PROPOSALS.map((proposal) => (
          <article key={proposal.name} className='flex w-[390px] flex-col gap-2 font-story'>
            <p className='font-sans text-xs text-muted-foreground'>{proposal.name}</p>
            {/* A screen of a phone. */}
            <div
              className='flex min-h-96 flex-col justify-between gap-6 rounded-xl border p-5'
              style={proposal[mode]}
            >
              <span />
              <StoryText
                instant
                theme='outro'
                content={'# Poklad je váš!\n\nPod deskou leží truhla plná mincí.'}
              />
              <p className='flex items-center justify-center gap-2'>
                <Flag className='size-4' /> Konec hry
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  </ThemeContext>
);

const OutroColors = () => (
  <div className='-m-8 flex flex-col'>
    <Mode mode='light' />
    <Mode mode='dark' />
  </div>
);

const meta = {
  title: 'Player/Návrhy barev závěru',
  component: OutroColors,
} satisfies Meta<typeof OutroColors>;

export default meta;

export const Prehled: StoryObj<typeof meta> = { name: 'Přehled' };
