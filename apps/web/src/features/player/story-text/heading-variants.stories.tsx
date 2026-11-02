import '@fontsource-variable/noto-serif/standard.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { StoryText } from './story-text';

/**
 * Proposals for the story's headings, to choose from; nothing here is used by the game. Only what
 * Pretext can measure later is proposed: weight, width keywords, italics, letter spacing and
 * capitals all go into the canvas font or its options.
 *
 * What Noto Serif offers: the axes `wght` 100–900, `wdth` 62.5–100 % and an italic with both;
 * kerning and ligatures. It has no real small caps, swashes or stylistic sets.
 */
interface Variant {
  readonly name: string;
  readonly note: string;
  readonly h1: CSSProperties;
  readonly h2: CSSProperties;
  readonly h3: CSSProperties;
  /** The look of a word marked `*like this*` in a heading. */
  readonly em?: CSSProperties;
  /** Every line of the title is scaled to fill the column. */
  readonly fit?: boolean;
  /** The words of the title settle from a thin weight to the final one. */
  readonly ink?: boolean;
}

const VARIANTS = {
  current: {
    name: 'A · Současný stav',
    note: 'Pro srovnání: tučnost 600, šířka 100 %.',
    h1: { fontSize: 35, lineHeight: 1.2, fontWeight: 600 },
    h2: { fontSize: 26, lineHeight: 1.3, fontWeight: 600 },
    h3: { fontSize: 22, lineHeight: 1.4, fontWeight: 600 },
  },
  book: {
    name: 'B · Knižní titul',
    note: 'Velký a lehký řez (wght 280) se staženým prostrkáním. Klidné a vznešené; hierarchii nese velikost, ne tučnost.',
    h1: { fontSize: 44, lineHeight: 1.08, fontWeight: 280, letterSpacing: '-0.02em' },
    h2: { fontSize: 30, lineHeight: 1.18, fontWeight: 320, letterSpacing: '-0.012em' },
    h3: { fontSize: 22, lineHeight: 1.35, fontWeight: 500 },
  },
  condensed: {
    name: 'C · Úzký plakát',
    note: 'Osa wdth 62,5 % a wght 760: vysoké, husté nadpisy, které se vejdou na řádek i ve velké velikosti.',
    h1: {
      fontSize: 54,
      lineHeight: 1,
      fontWeight: 760,
      fontStretch: 'extra-condensed',
      letterSpacing: '-0.005em',
    },
    h2: { fontSize: 40, lineHeight: 1.05, fontWeight: 700, fontStretch: 'extra-condensed' },
    h3: { fontSize: 26, lineHeight: 1.2, fontWeight: 650, fontStretch: 'condensed' },
  },
  italic: {
    name: 'D · Vypravěč',
    note: 'Variabilní kurziva (wght 420): zní jako hlas vypravěče a od textu se odliší bez tučnosti.',
    h1: { fontSize: 40, lineHeight: 1.12, fontWeight: 420, fontStyle: 'italic' },
    h2: { fontSize: 29, lineHeight: 1.2, fontWeight: 420, fontStyle: 'italic' },
    h3: { fontSize: 22, lineHeight: 1.35, fontWeight: 500, fontStyle: 'italic' },
  },
  engraved: {
    name: 'E · Rytina',
    note: 'Prostrkané verzálky jako na náhrobku nebo starém vývěsním štítu. Skutečné kapitálky písmo nemá, proto malé h2 a h3.',
    h1: {
      fontSize: 27,
      lineHeight: 1.35,
      fontWeight: 480,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
    },
    h2: {
      fontSize: 15,
      lineHeight: 1.6,
      fontWeight: 600,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
    },
    h3: {
      fontSize: 13,
      lineHeight: 1.6,
      fontWeight: 600,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
    },
  },
  mixed: {
    name: 'F · Dvojhlas',
    note: 'Pevný tučný řez a v něm jedno lehké slovo kurzívou. Autor si ho volí v Markdownu: # Poklad *starého* mlýna.',
    h1: { fontSize: 42, lineHeight: 1.1, fontWeight: 680, letterSpacing: '-0.015em' },
    h2: { fontSize: 29, lineHeight: 1.2, fontWeight: 650, letterSpacing: '-0.008em' },
    h3: { fontSize: 22, lineHeight: 1.35, fontWeight: 600 },
    em: { fontStyle: 'italic', fontWeight: 280 },
  },
  poster: {
    name: 'G · Vysázeno na šířku',
    note: 'Každý řádek titulu vyplní celou šířku, takže kratší slova vyrostou. Jen pro úvod a závěr; h2 je úzké.',
    h1: { lineHeight: 1.02, fontWeight: 720, fontStretch: 'semi-condensed' },
    h2: { fontSize: 36, lineHeight: 1.08, fontWeight: 680, fontStretch: 'condensed' },
    h3: { fontSize: 24, lineHeight: 1.25, fontWeight: 620, fontStretch: 'condensed' },
    fit: true,
  },
  ink: {
    name: 'H · Vpíjení inkoustu',
    note: 'Slova titulu při prolnutí ztloustnou z wght 120 na 560, jako když se inkoust vpíjí do papíru. Nic nejede. Klepnutím se přehraje.',
    h1: { fontSize: 40, lineHeight: 1.12, fontWeight: 560, letterSpacing: '-0.012em' },
    h2: { fontSize: 29, lineHeight: 1.2, fontWeight: 540 },
    h3: { fontSize: 22, lineHeight: 1.35, fontWeight: 540 },
    ink: true,
  },
} satisfies Record<string, Variant>;

type VariantId = keyof typeof VARIANTS;

const INK_STYLES = `
@keyframes heading-ink {
  from {
    opacity: 0;
    font-weight: 120;
  }
}
.heading-ink {
  animation: heading-ink 1.6s ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  .heading-ink {
    animation: none;
  }
}
`;

/** Words marked `*like this*` get the variant's look. */
const Emphasized = ({ text, em }: { text: string; em: CSSProperties | undefined }) =>
  text.split(/(\*[^*]+\*)/).map((part, index) =>
    part.startsWith('*') ? (
      <span key={index} style={em}>
        {part.slice(1, -1)}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );

const plain = (text: string) => text.replaceAll('*', '');

/** Scales one line to the width of the column, capped so a very short word stays a word. */
const FitLine = ({ text, style }: { text: string; style: CSSProperties }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(40);
  useEffect(() => {
    const line = ref.current;
    if (line === null) return undefined;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      const column = line.parentElement?.clientWidth ?? 0;
      const width = line.getBoundingClientRect().width;
      if (!cancelled && width > 0) setSize((current) => Math.min((current * column) / width, 130));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <span ref={ref} className='block w-fit whitespace-nowrap' style={{ ...style, fontSize: size }}>
      {text}
    </span>
  );
};

const Title = ({ text, variant }: { text: string; variant: Variant }) => {
  const [run, setRun] = useState(0);
  if (variant.fit === true) {
    const words = plain(text).split(' ');
    const lines =
      words.length > 2 ? [words.slice(0, -1).join(' '), words.at(-1) ?? ''] : [words.join(' ')];
    return (
      <h1 aria-label={plain(text)}>
        {lines.map((line) => (
          <FitLine key={line} text={line} style={variant.h1} />
        ))}
      </h1>
    );
  }
  if (variant.ink === true)
    return (
      <h1
        key={run}
        className='cursor-pointer text-balance'
        style={variant.h1}
        onClick={() => setRun(run + 1)}
      >
        {plain(text)
          .split(' ')
          .map((word, index) => (
            <span key={index}>
              <span className='heading-ink' style={{ animationDelay: `${index * 220}ms` }}>
                {word}
              </span>{' '}
            </span>
          ))}
      </h1>
    );
  return (
    <h1 className='text-balance' style={variant.h1}>
      <Emphasized text={text} em={variant.em} />
    </h1>
  );
};

const Screen = ({ label, children }: { label: string; children: ReactNode }) => (
  <section className='flex flex-col gap-4'>
    <p className='font-sans text-xs text-muted-foreground'>{label}</p>
    {children}
  </section>
);

const Body = ({ content, align }: { content: string; align?: 'center' }) => (
  <StoryText
    instant
    theme='default'
    content={content}
    {...(align === undefined ? {} : { align })}
  />
);

const Proposal = ({ id }: { id: VariantId }) => {
  const variant: Variant = VARIANTS[id];
  return (
    <article className='flex w-[350px] flex-col gap-8 font-story'>
      <header className='flex flex-col gap-1 border-b pb-3 font-sans'>
        <h2 className='font-semibold'>{variant.name}</h2>
        <p className='text-sm text-muted-foreground'>{variant.note}</p>
      </header>
      <Screen label='Úvod, h1'>
        <div className='flex flex-col gap-5'>
          <Title text='Poklad *starého* mlýna' variant={variant} />
          <Body content='Hledá se ztracený poklad mlynáře Matěje. Kdo ho najde dřív?' />
        </div>
      </Screen>
      <Screen label='Závěr, h1 s diakritikou'>
        <Title text='Přišli *jste* příliš pozdě' variant={variant} />
      </Screen>
      <Screen label='Krátké h2 a h3'>
        <div className='flex flex-col gap-3'>
          <h2 className='text-balance' style={variant.h2}>
            Pravidla
          </h2>
          <Body content='Hrajete jako tým. Příběh vás povede po okolí.' />
          <h3 className='mt-2 text-balance' style={variant.h3}>
            Co si vzít s sebou
          </h3>
          <Body content='Nabitý telefon a dobré boty.' />
        </div>
      </Screen>
      <Screen label='Dlouhé h2'>
        <h2 className='text-balance' style={variant.h2}>
          <Emphasized text='Cesta k *zatopenému* mlýnu za soumraku' em={variant.em} />
        </h2>
      </Screen>
    </article>
  );
};

const Proposals = ({ ids }: { ids: readonly VariantId[] }) => (
  <>
    <style>{INK_STYLES}</style>
    <div className='flex flex-wrap items-start gap-x-12 gap-y-16'>
      {ids.map((id) => (
        <Proposal key={id} id={id} />
      ))}
    </div>
  </>
);

const ALL: readonly VariantId[] = [
  'current',
  'book',
  'condensed',
  'italic',
  'engraved',
  'mixed',
  'poster',
  'ink',
];

const meta = {
  title: 'Player/Návrhy nadpisů',
  component: Proposals,
  args: { ids: ALL },
} satisfies Meta<typeof Proposals>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Prehled: Story = { name: 'Přehled' };
export const Current: Story = { name: 'A · Současný stav', args: { ids: ['current'] } };
export const Book: Story = { name: 'B · Knižní titul', args: { ids: ['book'] } };
export const Condensed: Story = { name: 'C · Úzký plakát', args: { ids: ['condensed'] } };
export const Italic: Story = { name: 'D · Vypravěč', args: { ids: ['italic'] } };
export const Engraved: Story = { name: 'E · Rytina', args: { ids: ['engraved'] } };
export const Mixed: Story = { name: 'F · Dvojhlas', args: { ids: ['mixed'] } };
export const Poster: Story = { name: 'G · Vysázeno na šířku', args: { ids: ['poster'] } };
export const Ink: Story = { name: 'H · Vpíjení inkoustu', args: { ids: ['ink'] } };
