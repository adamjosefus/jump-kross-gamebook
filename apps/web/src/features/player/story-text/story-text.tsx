import {
  materializeRichInlineLineRange,
  prepareRichInline,
  walkRichInlineLineRanges,
  type PreparedRichInline,
  type RichInlineFragment,
} from '@chenglou/pretext/rich-inline';
import type { Theme } from '@gamebook/core';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { cn } from '@/lib/utils';

import { paragraphsOf, type Paragraph } from './markdown';
import { paragraphType, QUOTE_LINE, runType, type ParagraphType, type RunType } from './typography';

/** Average time per word; long screens go faster so the whole reveal never takes too long. */
const WORD_STEP_MS = 70;
const MAX_REVEAL_MS = 4000;
/** Steepness of the reveal curve: the higher, the slower the start and the faster the end. */
const REVEAL_EASING = 4;
/** Shortest time between two words, so even the last ones come one by one. */
const MIN_WORD_GAP_MS = 30;

/**
 * When the word starts to fade in. One curve covers the whole screen: an ease-out over the words,
 * so the first words come slowly and the rest faster and faster, but always one after another.
 */
const revealDelay = (index: number, words: number) => {
  if (words <= 1) return 0;
  const curve = Math.min(words * WORD_STEP_MS, MAX_REVEAL_MS);
  const progress = index / (words - 1);
  return Math.round(index * MIN_WORD_GAP_MS + curve * (1 - (1 - progress) ** REVEAL_EASING));
};

// -----------------------------------------------------------------------------------------------
// Fonts

const loadedFonts = new Set<string>();

/**
 * Whether the fonts can be measured: Pretext needs the web font loaded, or it measures the
 * fallback. Fonts loaded once stay loaded, so later screens render at once.
 */
const useFontsLoaded = (fonts: readonly string[], sample: string) => {
  // One string for the list, so the effect reruns only when the fonts change.
  const key = fonts.join('\n');
  const [loaded, setLoaded] = useState<string>();
  const ready = loaded === key || fonts.every((font) => loadedFonts.has(font));
  useEffect(() => {
    const wanted = key.split('\n');
    if (wanted.every((font) => loadedFonts.has(font))) return undefined;
    let cancelled = false;
    void Promise.all(wanted.map((font) => document.fonts.load(font, sample))).then(() => {
      for (const font of wanted) loadedFonts.add(font);
      if (!cancelled) setLoaded(key);
    });
    return () => {
      cancelled = true;
    };
  }, [key, sample]);
  return ready;
};

// -----------------------------------------------------------------------------------------------
// Width

/** Content width of the element in CSS px, rounded to the quarter pixels browsers lay out in. */
const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.floor(entry.contentRect.width * 4) / 4);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

// -----------------------------------------------------------------------------------------------
// Layout

/**
 * One item Pretext lays out: a word with the spaces after it, or a whole piece of inline code.
 * Words are separate items so the space after each can be wider (`gap`): CSS `word-spacing`
 * would paint wider spaces than Pretext measured, so the extra width goes into the layout as the
 * word's `extraWidth` and is painted as its right padding.
 */
interface Item {
  readonly text: string;
  readonly run: RunType;
  readonly gap: number;
}

interface Prepared {
  readonly paragraph: Paragraph;
  readonly type: ParagraphType;
  readonly items: readonly Item[];
  readonly inline: PreparedRichInline;
}

interface Word {
  readonly text: string;
  readonly run: RunType;
  /** Extra space painted after the word. */
  readonly gap: number;
  /** Inline code: one box with its padding and background. */
  readonly code: boolean;
  /** Position among all words of the screen, for the reveal. */
  readonly index: number;
}

/** A piece of one line: a word that fades in, or the space before it. */
type Piece = Word | { readonly space: string; readonly run: RunType };

interface Line {
  readonly pieces: readonly Piece[];
}

interface LaidOut {
  readonly prepared: Prepared;
  readonly lines: readonly Line[];
}

const itemsOf = (paragraph: Paragraph, type: ParagraphType): Item[] => {
  const tokens = paragraph.runs.flatMap((run) => {
    const looks = runType(type, run.marks);
    return looks.padding > 0
      ? [{ text: run.text, run: looks }]
      : (run.text.match(/\S+\s*|\s+/g) ?? []).map((text) => ({ text, run: looks }));
  });
  // A word gets the wider space when a space follows it, in its own text or the next run's.
  return tokens.map((token, index) => {
    const word = /\S/.test(token.text) && token.run.padding === 0;
    const spaceAfter = /\s$/.test(token.text) || /^\s/.test(tokens[index + 1]?.text ?? '');
    return { ...token, gap: word && spaceAfter ? type.wordGap : 0 };
  });
};

const prepare = (paragraphs: readonly Paragraph[], theme: Theme): Prepared[] =>
  paragraphs.map((paragraph) => {
    const type = paragraphType(theme, paragraph.kind);
    const items = itemsOf(paragraph, type);
    const inline = prepareRichInline(
      items.map(({ text, run, gap }) =>
        run.padding > 0
          ? { text, font: run.font, break: 'never' as const, extraWidth: run.padding * 2 }
          : { text, font: run.font, ...(gap === 0 ? {} : { extraWidth: gap }) },
      ),
    );
    return { paragraph, type, items, inline };
  });

const piecesOf = (
  fragment: RichInlineFragment,
  prepared: Prepared,
  next: () => number,
): Piece[] => {
  const { run, gap } = prepared.items[fragment.itemIndex]!;
  const pieces: Piece[] = [];
  if (fragment.gapBefore > 0)
    pieces.push({ space: ' ', run: prepared.items[fragment.gapItemIndex]?.run ?? run });
  const text = run.padding > 0 ? fragment.text : fragment.text.trim();
  if (text !== '') pieces.push({ text, run, gap, code: run.padding > 0, index: next() });
  return pieces;
};

const indentOf = (paragraph: Paragraph, type: ParagraphType) =>
  paragraph.depth * type.indent + (paragraph.kind === 'quote' ? type.quoteIndent : 0);

const gapOf = (paragraph: Paragraph, previous: Paragraph | undefined, type: ParagraphType) =>
  previous === undefined || paragraph.continued === true
    ? 0
    : paragraph.depth > 0 && previous.depth > 0
      ? type.listGap
      : type.gap;

const layOut = (prepared: readonly Prepared[], width: number) => {
  let words = 0;
  const next = () => words++;
  const paragraphs = prepared.map((item): LaidOut => {
    const maxWidth = Math.max(width - indentOf(item.paragraph, item.type), 1);
    const lines: Line[] = [];
    walkRichInlineLineRanges(item.inline, maxWidth, (range) => {
      const line = materializeRichInlineLineRange(item.inline, range);
      lines.push({ pieces: line.fragments.flatMap((fragment) => piecesOf(fragment, item, next)) });
    });
    return { prepared: item, lines };
  });
  return { paragraphs, words };
};

// -----------------------------------------------------------------------------------------------
// Rendering

const fontStyle = (run: RunType): CSSProperties => ({ font: run.font, lineHeight: 1 });

/**
 * One screen of the story: Markdown laid out into lines by Pretext and painted line by line, with
 * the words fading in one after another. A tap shows the rest at once. Lines are known before
 * anything is painted, so nothing reflows while the words appear.
 */
export const StoryText = ({
  content,
  theme,
  align = 'left',
  className,
}: {
  content: string;
  theme: Theme;
  align?: 'left' | 'center';
  className?: string;
}) => {
  const paragraphs = useMemo(() => paragraphsOf(content), [content]);
  const fonts = useMemo(
    () => [
      ...new Set(
        paragraphs.flatMap((paragraph) =>
          paragraph.runs.map(
            (run) => runType(paragraphType(theme, paragraph.kind), run.marks).font,
          ),
        ),
      ),
    ],
    [paragraphs, theme],
  );
  const loaded = useFontsLoaded(fonts, content);
  const [ref, width] = useWidth();
  const [revealed, setRevealed] = useState(false);

  const prepared = useMemo(
    () => (loaded ? prepare(paragraphs, theme) : undefined),
    [loaded, paragraphs, theme],
  );
  const layout = useMemo(
    () => (prepared === undefined || width === undefined ? undefined : layOut(prepared, width)),
    [prepared, width],
  );

  return (
    <div
      ref={ref}
      className={cn('story-text', revealed && 'story-text-revealed', className)}
      onClick={() => setRevealed(true)}
    >
      {layout?.paragraphs.map(({ prepared: { paragraph, type }, lines }, index) => (
        <div
          key={index}
          className={cn('relative', paragraph.kind === 'quote' && 'text-muted-foreground')}
          style={{
            marginTop: gapOf(paragraph, layout.paragraphs[index - 1]?.prepared.paragraph, type),
            paddingLeft: indentOf(paragraph, type),
            textAlign: align,
          }}
        >
          {paragraph.kind === 'quote' && (
            <span
              className='absolute inset-y-0 bg-border'
              style={{ left: paragraph.depth * type.indent, width: QUOTE_LINE }}
            />
          )}
          {paragraph.marker !== undefined && (
            <span
              className='absolute text-muted-foreground'
              style={{
                left: (paragraph.depth - 1) * type.indent,
                font: `${type.weight} ${type.size}px ${type.family}`,
                lineHeight: `${type.lineHeight}px`,
              }}
            >
              {paragraph.marker}
            </span>
          )}
          {lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              className='whitespace-pre'
              style={{ height: type.lineHeight, lineHeight: `${type.lineHeight}px` }}
            >
              {line.pieces.map((piece, pieceIndex) =>
                'space' in piece ? (
                  <span key={pieceIndex} style={fontStyle(piece.run)}>
                    {piece.space}
                  </span>
                ) : (
                  <span
                    key={pieceIndex}
                    className={cn('story-word', piece.code && 'rounded bg-muted')}
                    style={{
                      ...fontStyle(piece.run),
                      ...(piece.code ? { padding: `0 ${piece.run.padding}px` } : {}),
                      ...(piece.gap === 0 ? {} : { paddingRight: piece.gap }),
                      animationDelay: `${revealDelay(piece.index, layout.words)}ms`,
                    }}
                  >
                    {piece.text}
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
