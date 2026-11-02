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
    name: 'Šalvějová zelená',
    light: { background: 'oklch(0.25 0.035 155)', color: 'oklch(0.92 0.05 150)' },
    dark: { background: 'oklch(0.16 0.025 155)', color: 'oklch(0.82 0.1 150)' },
  },
  {
    name: 'Jemná červená',
    light: { background: 'oklch(0.25 0.05 25)', color: 'oklch(0.92 0.04 25)' },
    dark: { background: 'oklch(0.16 0.03 25)', color: 'oklch(0.82 0.09 25)' },
  },
];

const Mode = ({ mode }: { mode: 'light' | 'dark' }) => (
  // All the proposals are light text on a dark background, whatever the mode.
  <ThemeContext value={{ preference: 'dark', resolved: 'dark', setPreference: () => undefined }}>
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
