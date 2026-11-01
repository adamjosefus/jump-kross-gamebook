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

/** Words fade in one after another; long screens go faster so they never take too long. */
const WORD_STEP_MS = 45;
const MAX_REVEAL_MS = 3000;

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

interface Prepared {
  readonly paragraph: Paragraph;
  readonly type: ParagraphType;
  readonly runs: readonly RunType[];
  readonly inline: PreparedRichInline;
}

interface Word {
  readonly text: string;
  readonly run: RunType;
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

const prepare = (paragraphs: readonly Paragraph[], theme: Theme): Prepared[] =>
  paragraphs.map((paragraph) => {
    const type = paragraphType(theme, paragraph.kind);
    const runs = paragraph.runs.map((run) => runType(type, run.marks));
    const inline = prepareRichInline(
      paragraph.runs.map((run, index) => {
        const { font, padding } = runs[index]!;
        return padding === 0
          ? { text: run.text, font }
          : { text: run.text, font, break: 'never' as const, extraWidth: padding * 2 };
      }),
    );
    return { paragraph, type, runs, inline };
  });

const piecesOf = (
  fragment: RichInlineFragment,
  prepared: Prepared,
  next: () => number,
): Piece[] => {
  const run = prepared.runs[fragment.itemIndex]!;
  const pieces: Piece[] = [];
  if (fragment.gapBefore > 0)
    pieces.push({ space: ' ', run: prepared.runs[fragment.gapItemIndex] ?? run });
  if (run.padding > 0) return [...pieces, { text: fragment.text, run, code: true, index: next() }];
  for (const token of fragment.text.split(/(\s+)/)) {
    if (token === '') continue;
    pieces.push(
      /^\s+$/.test(token)
        ? { space: token, run }
        : { text: token, run, code: false, index: next() },
    );
  }
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
  const step = layout === undefined ? 0 : Math.min(WORD_STEP_MS, MAX_REVEAL_MS / layout.words);

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
                      animationDelay: `${Math.round(piece.index * step)}ms`,
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
