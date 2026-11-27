import type { Meta, StoryObj } from '@storybook/react-vite';

import { TooltipProvider } from '@/components/ui/tooltip';

import type { DraftNode } from './draft';
import { DraftNodeCard } from './draft-node-card';
import { SAMPLE_DRAFT } from './sample-draft';

const [start, shops, riddle, bakery] = SAMPLE_DRAFT.nodes;

const LONG: DraftNode = {
  id: 'dlouhy_dopis_od_mlynare',
  summary: 'Tým najde ve mlýně dlouhý dopis od mlynáře, který vysvětluje, kde hledat poklad',
  note: 'Dopis je dlouhý schválně, ať si ho přečtou celý.',
  segments: [
    {
      theme: 'letter',
      text: 'Milý Matěji,\n\npíšu Ti, protože už nevím, komu jinému. Poklad, o kterém jsme spolu mluvili, jsem schoval tam, kde voda nepadá, ale stojí. Kdo ho najde, ať se o něj rozdělí s těmi, kdo ho potřebují.\n\nTvůj starý přítel',
    },
    { theme: 'red', text: 'Za dveřmi se ozvou kroky.' },
  ],
  choices: [{ label: 'Schovat dopis', to: 'x' }],
};

const MANY: DraftNode = {
  id: 'krizovatka',
  summary: 'Křižovatka u mlýna',
  segments: [{ text: 'Cesty vedou všemi směry.' }],
  choices: [
    { label: 'Na sever k lesu', to: 'a' },
    { label: 'Na jih k řece', to: 'b' },
    { label: 'Na východ do vesnice', to: 'c' },
    { label: 'Na západ k mlýnu', to: 'd' },
    { label: 'Zůstat stát', to: 'e' },
    { label: 'Vrátit se', to: 'f' },
  ],
};

const meta = {
  title: 'Editor/Karta uzlu',
  component: DraftNodeCard,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof DraftNodeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Close: Story = {
  name: 'Zblízka',
  args: { node: bakery },
};

export const Far: Story = {
  name: 'Zdálky',
  args: { node: bakery, far: true },
};

export const Start: Story = {
  name: 'Začátek',
  args: { node: start, start: true },
};

export const End: Story = {
  name: 'Konec',
  args: { node: SAMPLE_DRAFT.nodes.at(-1)! },
};

export const NextArrow: Story = {
  name: 'Šipka Další',
  args: { node: riddle },
};

export const Selected: Story = {
  name: 'Vybraný',
  args: { node: shops, selected: true },
};

export const LongText: Story = {
  name: 'Dlouhý text',
  args: { node: LONG },
};

export const ManyChoices: Story = {
  name: 'Hodně voleb',
  args: { node: MANY },
};

export const NoSummary: Story = {
  name: 'Bez shrnutí',
  args: { node: { ...bakery, summary: '' }, far: true },
};
