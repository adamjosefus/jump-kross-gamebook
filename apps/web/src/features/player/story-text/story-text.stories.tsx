import type { Meta, StoryObj } from '@storybook/react-vite';

import { StoryText } from './story-text';

const meta = {
  title: 'Player/StoryText',
  component: StoryText,
  decorators: [
    (Story) => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    theme: 'default',
    content: `Na tržišti prodává stará kořenářka **mapu okolí**. Máte u sebe *30 mincí* a v kapse \`L-2-S0D2\`.

Když mapu koupíte, ušetříte si v lese spoustu bloudění.`,
  },
} satisfies Meta<typeof StoryText>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Fast: Story = { args: { fast: true } };

export const Intro: Story = {
  args: {
    theme: 'intro',
    align: 'center',
    content:
      '# Poklad starého mlýna\n\nHledá se ztracený poklad mlynáře Matěje. Kdo ho najde dřív?',
  },
};

export const Letter: Story = {
  args: {
    theme: 'letter',
    className: 'rounded-lg border bg-amber-50 p-6 text-amber-950 shadow-sm',
    content: `*Milí hledači,*

poklad jsem ukryl tam, kde se kdysi točilo kolo. Cestu vám ukáže jen ten, kdo se nebojí tmy.

— **Matěj**`,
  },
};

export const Rules: Story = {
  args: {
    content: `## Pravidla

1. Hrajete jako tým.
2. Někdy vybíráte v aplikaci, jindy musíte dojít na místo a naskenovat tam QR kód.
   - Namiřte na něj fotoaparát.
   - Bez kamery se hrát nedá.

> Stejný kód může naskenovat každý telefon v týmu.
Všechny pak ukazují totéž.`,
  },
};
