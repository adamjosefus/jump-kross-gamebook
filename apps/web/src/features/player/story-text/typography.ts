import type { Theme } from '@gamebook/core';

import type { Mark, ParagraphKind } from './markdown';

// Named fonts only: Pretext measures with canvas, and `system-ui` or `ui-serif` resolve
// differently there than in CSS. The same strings style the painted text, so both agree.
const SERIF = '"Noto Serif Variable", serif';
const CONDENSED_SERIF = '"Noto Serif Condensed", serif';
const MONO = 'Menlo, Consolas, "Liberation Mono", monospace';

interface ThemeType {
  readonly family: string;
  /** Body text size in whole px; Firefox measures fractional sizes rounded. */
  readonly size: number;
  readonly lineHeight: number;
}

const THEME_TYPE: Record<Theme, ThemeType> = {
  default: { family: SERIF, size: 20, lineHeight: 34 },
  intro: { family: SERIF, size: 22, lineHeight: 37 },
  letter: { family: SERIF, size: 20, lineHeight: 34 },
  night: { family: SERIF, size: 20, lineHeight: 34 },
};

const KIND_SCALE: Record<ParagraphKind, { size: number; lineHeight: number; weight: number }> = {
  h1: { size: 2, lineHeight: 1.05, weight: 720 },
  h2: { size: 1.45, lineHeight: 1.05, weight: 720 },
  h3: { size: 1.2, lineHeight: 1.1, weight: 720 },
  p: { size: 1, lineHeight: 0, weight: 400 },
  quote: { size: 1, lineHeight: 0, weight: 400 },
};

/**
 * Optical correction of light text on a dark background, which looks bolder than the same text
 * dark on light (irradiation). Noto Serif has no grade axis, so the weight changes the widths:
 * Pretext has to measure with these values too.
 */
const LIGHT_ON_DARK = {
  weightShift: -35,
  /** In em. */
  letterSpacing: 0.01,
  /** Added to the line height of body text, in px. */
  lineHeight: 1,
};

const quarter = (px: number) => Math.round(px * 4) / 4;

export interface ParagraphType {
  /** One style for the whole text: balanced, and its marks do not change it. */
  readonly heading: boolean;
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
  /** Added to every space between words, which is too tight in the default spacing. */
  readonly wordGap: number;
  /** Added after every character, in px. */
  readonly letterSpacing: number;
  /** Added to the weight of a bold run as well. */
  readonly weightShift: number;
}

/** Width of the line beside a quote. */
export const QUOTE_LINE = 2;

export const paragraphType = (
  theme: Theme,
  kind: ParagraphKind,
  lightOnDark: boolean,
): ParagraphType => {
  const base = THEME_TYPE[theme];
  const scale = KIND_SCALE[kind];
  const size = Math.round(base.size * scale.size);
  const weightShift = lightOnDark ? LIGHT_ON_DARK.weightShift : 0;
  const bodyLineHeight = base.lineHeight + (lightOnDark ? LIGHT_ON_DARK.lineHeight : 0);
  const heading = kind === 'h1' || kind === 'h2' || kind === 'h3';
  return {
    heading,
    size,
    lineHeight: scale.lineHeight === 0 ? bodyLineHeight : Math.round(size * scale.lineHeight),
    weight: scale.weight + weightShift,
    family: heading ? CONDENSED_SERIF : base.family,
    gap: base.size,
    listGap: quarter(base.size * 0.4),
    indent: quarter(base.size * 1.25),
    quoteIndent: quarter(base.size + QUOTE_LINE),
    wordGap: quarter(size * 0.15),
    letterSpacing: lightOnDark ? quarter(size * LIGHT_ON_DARK.letterSpacing) : 0,
    weightShift,
  };
};

export interface RunType {
  /** Canvas font shorthand, also used as the CSS `font` of the painted text. */
  readonly font: string;
  /** Horizontal padding on each side of inline code. */
  readonly padding: number;
  /** Added after every character, in px. */
  readonly letterSpacing: number;
}

export const runType = (paragraph: ParagraphType, marks: readonly Mark[]): RunType => {
  if (marks.includes('code')) {
    const size = Math.round(paragraph.size * 0.9);
    return { font: `500 ${size}px ${MONO}`, padding: quarter(size * 0.3), letterSpacing: 0 };
  }
  const { heading } = paragraph;
  const weight =
    marks.includes('strong') && !heading ? 650 + paragraph.weightShift : paragraph.weight;
  const style = marks.includes('em') && !heading ? 'italic ' : '';
  return {
    font: `${style}${weight} ${paragraph.size}px ${paragraph.family}`,
    padding: 0,
    letterSpacing: paragraph.letterSpacing,
  };
};
