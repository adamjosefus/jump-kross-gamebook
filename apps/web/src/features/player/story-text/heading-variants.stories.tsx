import '@fontsource-variable/noto-serif/standard.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';

import { StoryText } from './story-text';

/**
 * Proposals for the story's headings, to choose from; nothing here is used by the game. Every
 * variant is one style for all headings, which differ only in size. The text under them is the
 * game's real one, for reference.
 */
interface Variant {
  readonly name: string;
  readonly style: CSSProperties;
  /** Sizes of h1, h2 and h3 in px. */
  readonly sizes: readonly [number, number, number];
}

const VARIANTS = {
  current: {
    name: 'A · Současný stav',
    style: { fontWeight: 600, lineHeight: 1.25 },
    sizes: [35, 26, 22],
  },
  light: {
    name: 'B · Lehký',
    style: { fontWeight: 280, lineHeight: 1.15, letterSpacing: '-0.02em' },
    sizes: [44, 31, 25],
  },
  medium: {
    name: 'C · Střední, těsný',
    style: { fontWeight: 500, lineHeight: 1.15, letterSpacing: '-0.015em' },
    sizes: [40, 29, 23],
  },
  condensedBold: {
    name: 'D · Úzký tučný',
    style: { fontWeight: 720, lineHeight: 1.05, fontStretch: 'extra-condensed' },
    sizes: [54, 38, 28],
  },
  condensedLight: {
    name: 'E · Úzký lehký',
    style: { fontWeight: 340, lineHeight: 1.08, fontStretch: 'condensed' },
    sizes: [50, 36, 27],
  },
  italic: {
    name: 'F · Kurzíva',
    style: { fontWeight: 420, lineHeight: 1.18, fontStyle: 'italic' },
    sizes: [40, 29, 23],
  },
  capitals: {
    name: 'G · Verzálky',
    style: {
      fontWeight: 500,
      lineHeight: 1.4,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    },
    sizes: [26, 18, 15],
  },
} satisfies Record<string, Variant>;

type VariantId = keyof typeof VARIANTS;

const ALL: readonly VariantId[] = [
  'current',
  'light',
  'medium',
  'condensedBold',
  'condensedLight',
  'italic',
  'capitals',
];

const Body = ({ content }: { content: string }) => (
  <StoryText instant theme='default' content={content} />
);

const Proposal = ({ id }: { id: VariantId }) => {
  const { name, style, sizes }: Variant = VARIANTS[id];
  const [h1, h2, h3] = sizes;
  return (
    <article className='flex w-[350px] flex-col font-story'>
      <p className='mb-6 border-b pb-2 font-sans text-sm font-semibold'>{name}</p>
      <h1 className='mb-4 text-balance' style={{ ...style, fontSize: h1 }}>
        Poklad starého mlýna
      </h1>
      <Body content='Hledá se ztracený poklad mlynáře Matěje. Kdo ho najde dřív?' />
      <h2 className='mt-8 mb-3 text-balance' style={{ ...style, fontSize: h2 }}>
        Pravidla
      </h2>
      <Body content='Hrajete jako tým. Příběh vás povede po okolí.' />
      <h3 className='mt-8 mb-3 text-balance' style={{ ...style, fontSize: h3 }}>
        Co si vzít s sebou
      </h3>
      <Body content='Nabitý telefon a dobré boty.' />
      <h2 className='mt-8 mb-3 text-balance' style={{ ...style, fontSize: h2 }}>
        Cesta k zatopenému mlýnu za soumraku
      </h2>
      <Body content='Přišli jste příliš pozdě. Kolo se už netočí.' />
    </article>
  );
};

const Proposals = ({ ids }: { ids: readonly VariantId[] }) => (
  <div className='flex flex-wrap items-start gap-x-12 gap-y-16'>
    {ids.map((id) => (
      <Proposal key={id} id={id} />
    ))}
  </div>
);

const meta = {
  title: 'Player/Návrhy nadpisů',
  component: Proposals,
  args: { ids: ALL },
} satisfies Meta<typeof Proposals>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Prehled: Story = { name: 'Přehled' };
export const Current: Story = { name: 'A · Současný stav', args: { ids: ['current'] } };
export const Light: Story = { name: 'B · Lehký', args: { ids: ['light'] } };
export const Medium: Story = { name: 'C · Střední, těsný', args: { ids: ['medium'] } };
export const CondensedBold: Story = { name: 'D · Úzký tučný', args: { ids: ['condensedBold'] } };
export const CondensedLight: Story = { name: 'E · Úzký lehký', args: { ids: ['condensedLight'] } };
export const Italic: Story = { name: 'F · Kurzíva', args: { ids: ['italic'] } };
export const Capitals: Story = { name: 'G · Verzálky', args: { ids: ['capitals'] } };
