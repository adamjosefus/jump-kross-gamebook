import {
  materializeRichInlineLineRange,
  prepareRichInline,
  walkRichInlineLineRanges,
  type PreparedRichInline,
  type RichInlineFragment,
} from '@chenglou/pretext/rich-inline';
import type { Theme } from '@gamebook/core';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react';

import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

import { paragraphsOf, type Paragraph } from './markdown';
import { paragraphType, QUOTE_LINE, runType, type ParagraphType, type RunType } from './typography';

interface RevealPace {
  /** Average time per word; long screens go faster so the whole reveal never takes too long. */
  readonly wordStepMs: number;
  readonly maxRevealMs: number;
  /** How long one word takes to fade in; the CSS animation gets it from here. */
  readonly wordFadeMs: number;
  /** Shortest time between two words, so even in the middle they come one by one. */
  readonly minWordGapMs: number;
}

const NORMAL_PACE: RevealPace = {
  wordStepMs: 70,
  maxRevealMs: 4000,
  wordFadeMs: 800,
  minWordGapMs: 30,
};
/** For a text the player has read a moment ago: done in about a quarter of a second. */
const FAST_PACE: RevealPace = {
  wordStepMs: 5,
  maxRevealMs: 150,
  wordFadeMs: 100,
  minWordGapMs: 0,
};

/** Steepness of the S-curve: the higher, the slower the start and the end against the middle. */
const REVEAL_EASING = 2.5;

/**
 * When the word starts to fade in. One S-curve covers the whole screen: the share of words shown
 * grows like an ease-in-out over time, so the first and the last words come slowly and the middle
 * ones quickly, always one after another.
 */
const revealDelay = (index: number, words: number, pace: RevealPace) => {
  if (words <= 1) return 0;
  const curve = Math.min(words * pace.wordStepMs, pace.maxRevealMs);
  const progress = index / (words - 1);
  // The inverse of the ease-in-out: the time at which this share of the words is shown.
  const time =
    progress < 0.5
      ? 0.5 * (2 * progress) ** (1 / REVEAL_EASING)
      : 1 - 0.5 * (2 * (1 - progress)) ** (1 / REVEAL_EASING);
  return Math.round(index * pace.minWordGapMs + curve * time);
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

const prepare = (
  paragraphs: readonly Paragraph[],
  theme: Theme,
  lightOnDark: boolean,
): Prepared[] =>
  paragraphs.map((paragraph) => {
    const type = paragraphType(theme, paragraph.kind, lightOnDark);
    const items = itemsOf(paragraph, type);
    const inline = prepareRichInline(
      items.map(({ text, run, gap }) =>
        run.padding > 0
          ? { text, font: run.font, break: 'never' as const, extraWidth: run.padding * 2 }
          : {
              text,
              font: run.font,
              ...(gap === 0 ? {} : { extraWidth: gap }),
              ...(run.letterSpacing === 0 ? {} : { letterSpacing: run.letterSpacing }),
            },
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

/** The narrowest width with as many lines as `maxWidth`, so the lines come out about even. */
const balancedWidth = (inline: PreparedRichInline, maxWidth: number) => {
  const countLines = (width: number) => walkRichInlineLineRanges(inline, width, () => undefined);
  const lines = countLines(maxWidth);
  if (lines <= 1) return maxWidth;
  let tooNarrow = 0;
  let wide = maxWidth;
  while (wide - tooNarrow > 1) {
    const middle = (wide + tooNarrow) / 2;
    if (countLines(middle) === lines) wide = middle;
    else tooNarrow = middle;
  }
  return wide;
};

const layOut = (prepared: readonly Prepared[], width: number) => {
  let words = 0;
  const next = () => words++;
  const paragraphs = prepared.map((item): LaidOut => {
    const available = Math.max(width - indentOf(item.paragraph, item.type), 1);
    const maxWidth = item.type.heading ? balancedWidth(item.inline, available) : available;
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

const fontStyle = (run: RunType): CSSProperties => ({
  font: run.font,
  lineHeight: 1,
  letterSpacing: run.letterSpacing,
});

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
  instant = false,
  fast = false,
  onRevealed,
}: {
  content: string;
  theme: Theme;
  align?: 'left' | 'center';
  className?: string;
  /** Show every word at once, e.g. on a screen the player has seen already. */
  instant?: boolean;
  /** Show the words very quickly, e.g. on a screen the player has visited a moment ago. */
  fast?: boolean;
  /** Called once every word is fully visible. */
  onRevealed?: () => void;
}) => {
  const { resolved } = useTheme();
  // The night theme has its dark box in the light mode as well.
  const lightOnDark = theme === 'night' || resolved === 'dark';
  const paragraphs = useMemo(() => paragraphsOf(content), [content]);
  const fonts = useMemo(
    () => [
      ...new Set(
        paragraphs.flatMap((paragraph) =>
          paragraph.runs.map(
            (run) => runType(paragraphType(theme, paragraph.kind, lightOnDark), run.marks).font,
          ),
        ),
      ),
    ],
    [paragraphs, theme, lightOnDark],
  );
  const loaded = useFontsLoaded(fonts, content);
  const [ref, width] = useWidth();
  const [revealed, setRevealed] = useState(false);

  const prepared = useMemo(
    () => (loaded ? prepare(paragraphs, theme, lightOnDark) : undefined),
    [loaded, paragraphs, theme, lightOnDark],
  );
  const layout = useMemo(
    () => (prepared === undefined || width === undefined ? undefined : layOut(prepared, width)),
    [prepared, width],
  );

  // When the last word has faded in: at once when shown instantly, tapped, or without motion.
  const shownAll = revealed || instant;
  const pace = fast ? FAST_PACE : NORMAL_PACE;
  const revealMs =
    layout === undefined || layout.words === 0
      ? 0
      : revealDelay(layout.words - 1, layout.words, pace) + pace.wordFadeMs;
  const reportRevealed = useEffectEvent(() => onRevealed?.());
  const laidOut = layout !== undefined;
  useEffect(() => {
    if (!laidOut) return undefined;
    if (shownAll || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reportRevealed();
      return undefined;
    }
    const timer = setTimeout(reportRevealed, revealMs);
    return () => clearTimeout(timer);
  }, [laidOut, shownAll, revealMs]);

  return (
    <div
      ref={ref}
      className={cn(
        'story-text',
        shownAll && 'story-text-revealed',
        lightOnDark && 'story-text-on-dark',
        className,
      )}
      onClick={() => setRevealed(true)}
    >
      {layout?.paragraphs.map(({ prepared: { paragraph, type }, lines }, index) => (
        <div
          key={index}
          className='relative'
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
                      animationDelay: `${revealDelay(piece.index, layout.words, pace)}ms`,
                      animationDuration: `${pace.wordFadeMs}ms`,
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
