import type { Theme } from '@gamebook/core';

import type { Mark, ParagraphKind } from './markdown';

// Named fonts only: Pretext measures with canvas, and `system-ui` or `ui-serif` resolve
// differently there than in CSS. The same strings style the painted text, so both agree.
const SANS = '"Geist Variable", sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = 'Menlo, Consolas, "Liberation Mono", monospace';

interface ThemeType {
  readonly family: string;
  /** Body text size in whole px; Firefox measures fractional sizes rounded. */
  readonly size: number;
  readonly lineHeight: number;
}

const THEME_TYPE: Record<Theme, ThemeType> = {
  default: { family: SANS, size: 18, lineHeight: 29 },
  intro: { family: SANS, size: 20, lineHeight: 32 },
  letter: { family: SERIF, size: 18, lineHeight: 29 },
  night: { family: SANS, size: 18, lineHeight: 29 },
};

const KIND_SCALE: Record<ParagraphKind, { size: number; lineHeight: number; weight: number }> = {
  h1: { size: 1.6, lineHeight: 1.2, weight: 600 },
  h2: { size: 1.3, lineHeight: 1.3, weight: 600 },
  h3: { size: 1.1, lineHeight: 1.4, weight: 600 },
  p: { size: 1, lineHeight: 0, weight: 400 },
  quote: { size: 1, lineHeight: 0, weight: 400 },
};

const quarter = (px: number) => Math.round(px * 4) / 4;

export interface ParagraphType {
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: number;
  readonly family: string;
  /** Space above the paragraph; none after a hard line break. */
  readonly gap: number;
  /** Space between two list items. */
  readonly listGap: number;
  /** Indent of list items per level. */
  readonly indent: number;
  /** Indent of a quote's text, its line included. */
  readonly quoteIndent: number;
}

/** Width of the line beside a quote. */
export const QUOTE_LINE = 2;

export const paragraphType = (theme: Theme, kind: ParagraphKind): ParagraphType => {
  const base = THEME_TYPE[theme];
  const scale = KIND_SCALE[kind];
  const size = Math.round(base.size * scale.size);
  return {
    size,
    lineHeight: scale.lineHeight === 0 ? base.lineHeight : Math.round(size * scale.lineHeight),
    weight: scale.weight,
    family: base.family,
    gap: base.size,
    listGap: quarter(base.size * 0.4),
    indent: quarter(base.size * 1.25),
    quoteIndent: quarter(base.size + QUOTE_LINE),
  };
};

export interface RunType {
  /** Canvas font shorthand, also used as the CSS `font` of the painted text. */
  readonly font: string;
  /** Horizontal padding on each side of inline code. */
  readonly padding: number;
}

export const runType = (paragraph: ParagraphType, marks: readonly Mark[]): RunType => {
  if (marks.includes('code')) {
    const size = Math.round(paragraph.size * 0.9);
    return { font: `500 ${size}px ${MONO}`, padding: quarter(size * 0.3) };
  }
  const weight = marks.includes('strong') ? 650 : paragraph.weight;
  const style = marks.includes('em') ? 'italic ' : '';
  return { font: `${style}${weight} ${paragraph.size}px ${paragraph.family}`, padding: 0 };
};
