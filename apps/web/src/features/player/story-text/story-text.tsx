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
import {
  isAlwaysDark,
  isSystemFont,
  paragraphType,
  QUOTE_LINE,
  runType,
  type ParagraphType,
  type RunType,
} from './typography';

interface RevealPace {
  /** The pause before the first word, while the screen's colors settle. */
  readonly firstWordDelayMs: number;
  /** Average time per word; long screens go faster so the whole reveal never takes too long. */
  readonly wordStepMs: number;
  readonly maxRevealMs: number;
  /** How long one word takes to fade in; the CSS animation gets it from here. */
  readonly wordFadeMs: number;
  /** Shortest time between two words, so even in the middle they come one by one. */
  readonly minWordGapMs: number;
}

const NORMAL_PACE: RevealPace = {
  firstWordDelayMs: 500,
  wordStepMs: 110,
  maxRevealMs: 6500,
  wordFadeMs: 1100,
  minWordGapMs: 45,
};
/** For a text the player has read a moment ago: done in about a quarter of a second. */
const FAST_PACE: RevealPace = {
  firstWordDelayMs: 0,
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
  if (words <= 1) return pace.firstWordDelayMs;
  const curve = Math.min(words * pace.wordStepMs, pace.maxRevealMs);
  const progress = index / (words - 1);
  // The inverse of the ease-in-out: the time at which this share of the words is shown.
  const time =
    progress < 0.5
      ? 0.5 * (2 * progress) ** (1 / REVEAL_EASING)
      : 1 - 0.5 * (2 * (1 - progress)) ** (1 / REVEAL_EASING);
  // The gaps count towards the limit too: a long letter must not take half a minute.
  const whole = (words - 1) * pace.minWordGapMs + curve;
  const scale = Math.min(1, pace.maxRevealMs / whole);
  return Math.round(pace.firstWordDelayMs + (index * pace.minWordGapMs + curve * time) * scale);
};

// -----------------------------------------------------------------------------------------------
// Fonts

// A cache shared by every text on the page, so it is filled in place.
const loadedFonts = new Set<string>();

/** How long to wait for the styles with the `@font-face` rules before measuring anyway. */
const FACE_RETRY_MS = 100;
const FACE_RETRIES = 20;
/**
 * How long a font may take to arrive before the text is shown in the fallback font: a slow or
 * broken connection in the field must not leave the screen empty.
 */
const FONT_TIMEOUT_MS = 4000;

/**
 * Loaded for this text: a font comes in parts by alphabet, so a font loaded for another text may
 * still miss the part with, say, „ř“.
 */
const isMeasurable = (font: string, sample: string) =>
  loadedFonts.has(font) && document.fonts.check(font, sample);

/**
 * Loads the font; no faces means the styles are not applied yet, so it tries again. A font that
 * fails to load (no network) is left for the next text to try; this one goes on without it.
 */
const loadFont = async (
  font: string,
  sample: string,
  isCancelled: () => boolean,
  retry = 0,
): Promise<void> => {
  if (retry >= FACE_RETRIES || isCancelled()) return;
  try {
    const faces = await document.fonts.load(font, sample);
    if (faces.length > 0) {
      loadedFonts.add(font);
      return;
    }
  } catch {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, FACE_RETRY_MS));
  return loadFont(font, sample, isCancelled, retry + 1);
};

const after = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Whether the fonts can be measured: Pretext needs the web font loaded, or it measures the
 * fallback and keeps that measure. Fonts loaded once stay loaded, so later screens render at once.
 */
const useFontsLoaded = (fonts: readonly string[], sample: string) => {
  // One string for the list and the text, so the effect reruns only when they change.
  const key = `${fonts.join('\n')}\n\n${sample}`;
  const [loaded, setLoaded] = useState<string>();
  // Bumped when the fonts arrive after the text was laid out in the fallback font.
  const [arrived, setArrived] = useState(0);
  const measurable = fonts.every((font) => isMeasurable(font, sample));
  const ready = loaded === key || measurable;
  useEffect(() => {
    if (ready) return undefined;
    // Loading cannot be aborted, so the cleanup flags the effect as over instead.
    let cancelled = false;
    const isCancelled = () => cancelled;
    // Whatever happens to the fonts, the text is shown after the timeout at the latest.
    void Promise.race([
      Promise.all(fonts.map((font) => loadFont(font, sample, isCancelled))),
      after(FONT_TIMEOUT_MS),
    ]).then(() => {
      if (!cancelled) setLoaded(key);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, key, fonts, sample]);
  // Laid out in the fallback font after the timeout: when the fonts do arrive, the browser swaps
  // them into the old line breaks, so the text has to be laid out again.
  useEffect(() => {
    if (!ready || measurable) return undefined;
    const check = () => {
      if (!fonts.every((font) => document.fonts.check(font, sample))) return;
      for (const font of fonts) loadedFonts.add(font);
      setArrived((count) => count + 1);
    };
    document.fonts.addEventListener('loadingdone', check);
    return () => document.fonts.removeEventListener('loadingdone', check);
  }, [ready, measurable, fonts, sample]);
  return { ready, arrived };
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
 * word's `extraWidth` and is painted as its right padding. A non-breaking space is part of its
 * word, so it gets the same extra width and is painted wider by `word-spacing` (`glueGap`).
 */
interface Item {
  readonly text: string;
  readonly run: RunType;
  readonly gap: number;
  readonly glueGap: number;
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
  /** Extra space painted at every non-breaking space inside the word. */
  readonly glueGap: number;
  /** Inline code: one box with its padding and background. */
  readonly code: boolean;
  /** Position among all words of the screen, for the reveal. */
  readonly index: number;
}

/** A piece of one line: a word that fades in, or the space before it. */
type Piece = Word | { readonly space: string; readonly run: RunType };

interface Line {
  readonly pieces: readonly Piece[];
  /** Added to every space of a justified line. */
  readonly justifyGap: number;
}

interface LaidOut {
  readonly prepared: Prepared;
  readonly lines: readonly Line[];
}

// The spaces a line can break at. Not `\s`, which also matches the non-breaking space.
const WORDS = /[^ \t\r\n]+[ \t\r\n]*|[ \t\r\n]+/g;
const HAS_WORD = /[^ \t\r\n]/;
const SPACE_AT_START = /^[ \t\r\n]/;
const SPACE_AT_END = /[ \t\r\n]$/;
const SPACES_AROUND = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const NON_BREAKING_SPACES = /\u00A0/g;

const itemsOf = (paragraph: Paragraph, type: ParagraphType): readonly Item[] => {
  const tokens = paragraph.runs.flatMap((run) => {
    const looks = runType(type, run.marks);
    return looks.padding > 0
      ? [{ text: run.text, run: looks }]
      : (run.text.match(WORDS) ?? []).map((text) => ({ text, run: looks }));
  });
  // A word gets the wider space when a space follows it, in its own text or the next run's.
  return tokens.map((token, index) => {
    const word = HAS_WORD.test(token.text) && token.run.padding === 0;
    const spaceAfter =
      SPACE_AT_END.test(token.text) || SPACE_AT_START.test(tokens[index + 1]?.text ?? '');
    return {
      ...token,
      gap: word && spaceAfter ? type.wordGap : 0,
      glueGap: token.run.padding === 0 ? type.wordGap : 0,
    };
  });
};

const prepare = (
  paragraphs: readonly Paragraph[],
  theme: Theme,
  lightOnDark: boolean,
): readonly Prepared[] =>
  paragraphs.map((paragraph) => {
    const type = paragraphType(theme, paragraph.kind, lightOnDark);
    const items = itemsOf(paragraph, type);
    const inline = prepareRichInline(
      items.map(({ text, run, gap, glueGap }) => {
        const extraWidth = gap + (text.match(NON_BREAKING_SPACES)?.length ?? 0) * glueGap;
        return run.padding > 0
          ? { text, font: run.font, break: 'never' as const, extraWidth: run.padding * 2 }
          : {
              text,
              font: run.font,
              ...(extraWidth === 0 ? {} : { extraWidth }),
              ...(run.letterSpacing === 0 ? {} : { letterSpacing: run.letterSpacing }),
            };
      }),
    );
    return { paragraph, type, items, inline };
  });

const piecesOf = (
  fragment: RichInlineFragment,
  prepared: Prepared,
  next: () => number,
): readonly Piece[] => {
  const { run, gap, glueGap } = prepared.items[fragment.itemIndex]!;
  const space: readonly Piece[] =
    fragment.gapBefore > 0
      ? [{ space: ' ', run: prepared.items[fragment.gapItemIndex]?.run ?? run }]
      : [];
  const text = run.padding > 0 ? fragment.text : fragment.text.replace(SPACES_AROUND, '');
  const word: readonly Piece[] =
    text === '' ? [] : [{ text, run, gap, glueGap, code: run.padding > 0, index: next() }];
  return [...space, ...word];
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
  // Halves the range between a width with more lines and one with as many, down to a pixel.
  const narrow = (tooNarrow: number, wide: number): number => {
    if (wide - tooNarrow <= 1) return wide;
    const middle = (wide + tooNarrow) / 2;
    return countLines(middle) === lines ? narrow(tooNarrow, middle) : narrow(middle, wide);
  };
  return narrow(0, maxWidth);
};

/** Narrowed only as much as it takes to bring more words to a short last line. */
const prettyWidth = (inline: PreparedRichInline, maxWidth: number) => {
  const measure = (width: number) => {
    // Pretext reports the lines through a callback, so the last one is kept as it comes.
    let lastLine = 0;
    const lines = walkRichInlineLineRanges(inline, width, (line) => {
      lastLine = line.width;
    });
    return { lines, lastLine };
  };
  const wide = measure(maxWidth);
  const longEnough = maxWidth / 3;
  if (wide.lines <= 1 || wide.lastLine >= longEnough) return maxWidth;
  // Four pixels narrower at a time, until the last line is long enough or a line is added.
  const narrowed = (width: number): number => {
    if (width <= 0) return maxWidth;
    const narrower = measure(width);
    if (narrower.lines > wide.lines) return maxWidth;
    if (narrower.lastLine >= longEnough) return width;
    return narrowed(width - 4);
  };
  return narrowed(maxWidth - 4);
};

const wrapWidth = (item: Prepared, available: number) => {
  if (item.type.wrap === 'balance') return balancedWidth(item.inline, available);
  if (item.type.wrap === 'pretty') return prettyWidth(item.inline, available);
  return available;
};

/** The extra space per gap between words that makes the line fill the width. */
const justifyGapOf = (pieces: readonly Piece[], lineWidth: number, available: number) => {
  const gaps = pieces.slice(0, -1).filter((piece) => 'gap' in piece && piece.gap > 0).length;
  const last = pieces.at(-1);
  // The line's width counts the space after its last word, which only hangs past the end.
  const hanging = last !== undefined && 'gap' in last ? last.gap : 0;
  return gaps === 0 ? 0 : Math.max(available - lineWidth + hanging, 0) / gaps;
};

const layOut = (prepared: readonly Prepared[], width: number) => {
  // Words are numbered across the whole screen as they are laid out, so a counter is simpler
  // than threading the count through the paragraphs and lines.
  let words = 0;
  const next = () => words++;
  const paragraphs = prepared.map((item): LaidOut => {
    const available = Math.max(width - indentOf(item.paragraph, item.type), 1);
    // Pretext reports the lines through a callback, so they are collected as they come.
    const measured: { readonly pieces: readonly Piece[]; readonly width: number }[] = [];
    walkRichInlineLineRanges(item.inline, wrapWidth(item, available), (range) => {
      const line = materializeRichInlineLineRange(item.inline, range);
      measured.push({
        pieces: line.fragments.flatMap((fragment) => piecesOf(fragment, item, next)),
        width: line.width,
      });
    });
    const lines = measured.map(({ pieces, width: lineWidth }, index): Line => ({
      pieces,
      justifyGap:
        item.type.align === 'justify' && index < measured.length - 1
          ? justifyGapOf(pieces, lineWidth, available)
          : 0,
    }));
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
 * the words fading in one after another. Lines are known before anything is painted, so nothing
 * reflows while the words appear. Tapping the text does nothing: the player waits for the reveal
 * (see docs/story-text.md).
 */
export const StoryText = ({
  content,
  theme,
  className,
  instant = false,
  fast = false,
  onRevealed,
}: {
  readonly content: string;
  readonly theme: Theme;
  readonly className?: string;
  /** Show every word at once, e.g. on a screen the player has seen already. */
  readonly instant?: boolean;
  /** Show the words very quickly, e.g. on a screen the player has visited a moment ago. */
  readonly fast?: boolean;
  /** Called once every word is fully visible. */
  readonly onRevealed?: () => void;
}) => {
  const { resolved } = useTheme();
  const lightOnDark = isAlwaysDark(theme) || resolved === 'dark';
  const paragraphs = useMemo(() => paragraphsOf(content), [content]);
  // The system's fonts (inline code) need no loading and would only wait for nothing.
  const fonts = useMemo(
    () => [
      ...new Set(
        paragraphs
          .flatMap((paragraph) =>
            paragraph.runs.map(
              (run) => runType(paragraphType(theme, paragraph.kind, lightOnDark), run.marks).font,
            ),
          )
          .filter((font) => !isSystemFont(font)),
      ),
    ],
    [paragraphs, theme, lightOnDark],
  );
  const { ready: loaded, arrived } = useFontsLoaded(fonts, content);
  const [ref, width] = useWidth();

  const prepared = useMemo(
    () => (loaded ? prepare(paragraphs, theme, lightOnDark) : undefined),
    // Measured again when the fonts arrive late (`arrived`).
    // eslint-disable-next-line react/exhaustive-deps
    [loaded, arrived, paragraphs, theme, lightOnDark],
  );
  const layout = useMemo(
    () => (prepared === undefined || width === undefined ? undefined : layOut(prepared, width)),
    [prepared, width],
  );

  // When the last word has faded in: at once when shown instantly or without motion.
  const pace = fast ? FAST_PACE : NORMAL_PACE;
  const revealMs =
    layout === undefined || layout.words === 0
      ? 0
      : revealDelay(layout.words - 1, layout.words, pace) + pace.wordFadeMs;
  const reportRevealed = useEffectEvent(() => onRevealed?.());
  const laidOut = layout !== undefined;
  useEffect(() => {
    if (!laidOut) return undefined;
    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reportRevealed();
      return undefined;
    }
    const timer = setTimeout(reportRevealed, revealMs);
    return () => clearTimeout(timer);
  }, [laidOut, instant, revealMs]);

  return (
    <div
      ref={ref}
      className={cn(
        'story-text',
        instant && 'story-text-revealed',
        lightOnDark && 'story-text-on-dark',
        className,
      )}
    >
      {layout?.paragraphs.map(({ prepared: { paragraph, type }, lines }, index) => (
        <div
          key={index}
          className='relative'
          style={{
            marginTop: gapOf(paragraph, layout.paragraphs[index - 1]?.prepared.paragraph, type),
            paddingLeft: indentOf(paragraph, type),
            textAlign: type.align === 'center' ? 'center' : 'left',
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
                      ...(piece.glueGap === 0 ? {} : { wordSpacing: piece.glueGap }),
                      ...(piece.gap === 0
                        ? {}
                        : {
                            paddingRight:
                              piece.gap +
                              (pieceIndex < line.pieces.length - 1 ? line.justifyGap : 0),
                          }),
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
