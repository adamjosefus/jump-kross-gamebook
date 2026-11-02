import type { Theme } from '@gamebook/core';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ThemeContext } from '@/lib/theme';
import { cn } from '@/lib/utils';

import { blockAlign, THEME_BOX } from './block-look';
import { StoryText } from './story-text/story-text';

interface Look {
  readonly name: string;
  readonly theme: Theme;
  /** On the last screen of the game. */
  readonly end?: boolean;
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
    name: 'Základní, konec hry',
    theme: 'default',
    end: true,
    content: 'Vracíte se domů s prázdnou. Poklad na vás ve mlýně počká.',
  },
  {
    name: 'Úvod',
    theme: 'intro',
    content:
      '# Poklad starého mlýna\n\nHledá se ztracený poklad mlynáře Matěje. Kdo ho najde dřív?',
  },
  {
    name: 'Dopis',
    theme: 'letter',
    content:
      '*Milí hledači,*\n\npoklad jsem ukryl tam, kde se kdysi točilo kolo. Cestu vám ukáže jen ten, kdo se nebojí tmy.\n\n— **Matěj**',
  },
  {
    name: 'Noc',
    theme: 'night',
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
        {LOOKS.map(({ name, theme, end = false, content }) => (
          <article key={name} className='flex w-[350px] flex-col gap-4 font-story'>
            <p className='border-b pb-2 font-sans text-xs text-muted-foreground'>
              {name} · <code>{theme}</code>
            </p>
            <StoryText
              instant
              content={sample ?? content}
              theme={theme}
              align={blockAlign(theme, end)}
              className={THEME_BOX[theme]}
            />
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
