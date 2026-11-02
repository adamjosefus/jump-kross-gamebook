import type { Theme } from '@gamebook/core';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ThemeContext } from '@/lib/theme';
import { cn } from '@/lib/utils';

import { THEME_BOX, THEME_PAGE } from './block-look';
import { StoryText } from './story-text/story-text';

interface Look {
  readonly name: string;
  readonly theme: Theme;
  /** A text of this look from the game. */
  readonly content: string;
}

const LOOKS: readonly Look[] = [
  {
    name: 'Základní',
    theme: 'default',
    content:
      '## Pravidla\n\nHrajete jako tým. Příběh vás povede po okolí: někdy vybíráte v aplikaci, jindy musíte dojít na místo a naskenovat tam QR kód.',
  },
  {
    name: 'Úvod',
    theme: 'intro',
    content:
      '# Poklad starého mlýna\n\nHledá se ztracený poklad mlynáře Matěje. Kdo ho najde dřív?',
  },
  {
    name: 'Závěr',
    theme: 'outro',
    content: '# Poklad je váš!\n\nPod deskou leží truhla plná mincí.',
  },
  {
    name: 'Dopis',
    theme: 'letter',
    content:
      '## Milí hledači,\n\npoklad jsem ukryl tam, kde se kdysi točilo kolo. Cestu vám ukáže jen ten, kdo se nebojí tmy.\n\n— **Matěj**',
  },
  {
    name: 'Popis',
    theme: 'description',
    content: 'U studánky se setmělo. Za ní slyšíte šumění vody. Mlýn musí být blízko.',
  },
];

const ALL_ELEMENTS = `# Nadpis první úrovně

## Nadpis druhé úrovně

### Nadpis třetí úrovně

Běžný text s **tučným slovem**, *kurzívou* a kódem \`L-2-S0D2\`.

1. První bod seznamu
2. Druhý bod seznamu
   - Vnořený bod

> Citace, která se může zalomit na víc řádků.`;

const Mode = ({ mode, sample }: { mode: 'light' | 'dark'; sample: string | undefined }) => (
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
      <div className='flex flex-wrap items-start gap-x-10 gap-y-12'>
        {LOOKS.map(({ name, theme, content }) => (
          <article key={name} className='flex w-[390px] flex-col gap-2 font-story'>
            <p className='font-sans text-xs text-muted-foreground'>
              {name} · <code>{theme}</code>
            </p>
            {/* A screen of a phone. */}
            <div
              className={cn(
                'flex min-h-96 flex-col justify-center rounded-xl border p-5',
                THEME_PAGE[theme],
              )}
            >
              <StoryText
                instant
                content={sample ?? content}
                theme={theme}
                className={THEME_BOX[theme]}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  </ThemeContext>
);

const Blocks = ({ sample }: { sample?: string }) => (
  <div className='-m-8 flex flex-col'>
    <Mode mode='light' sample={sample} />
    <Mode mode='dark' sample={sample} />
  </div>
);

const meta = {
  title: 'Player/Bloky',
  component: Blocks,
} satisfies Meta<typeof Blocks>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Prehled: Story = { name: 'Přehled' };
export const VsechnyPrvky: Story = { name: 'Všechny prvky', args: { sample: ALL_ELEMENTS } };
