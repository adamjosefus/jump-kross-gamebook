import type { Viewport } from '@xyflow/react';

/** How far apart the editor lays the cards out, chosen in its toolbar. */
export type Spacing = 'small' | 'large' | 'larger';

export const SPACINGS: readonly Spacing[] = ['small', 'large', 'larger'] as const;

/** How the spacings are named in the toolbar. */
export const SPACING_TEXT: Readonly<Record<Spacing, string>> = {
  small: 'Malé',
  large: 'Větší',
  larger: 'Největší',
};

/** How many times the gaps of the layout grow; small is the layout as it was. */
export const SPACING_FACTOR: Readonly<Record<Spacing, number>> = {
  small: 1,
  large: 1.75,
  larger: 2.5,
};

/** How the arrows are drawn: along right angles, or as smooth curves. */
export type EdgeStyle = 'straight' | 'smooth';

export const EDGE_STYLES: readonly EdgeStyle[] = ['straight', 'smooth'] as const;

/** How the arrow styles are named in the toolbar. */
export const EDGE_STYLE_TEXT: Readonly<Record<EdgeStyle, string>> = {
  straight: 'Kolmé',
  smooth: 'Plynulé',
};

/** Where this browser keeps the editor's view; the view is no part of the draft. */
const VIEWPORT_KEY = 'gamebook:editor:viewport';
const SPACING_KEY = 'gamebook:editor:spacing';
const EDGE_STYLE_KEY = 'gamebook:editor:edges';

/** A viewport read back from its text; none for anything else. */
export const parseViewport = (text: string | null): Viewport | undefined => {
  if (text === null) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    const x: unknown = Reflect.get(value, 'x');
    const y: unknown = Reflect.get(value, 'y');
    const zoom: unknown = Reflect.get(value, 'zoom');
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof zoom !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !(zoom > 0)
    ) {
      return undefined;
    }

    return { x, y, zoom };
  } catch {
    return undefined;
  }
};

/** A spacing read back from its text; the small one for anything else. */
export const parseSpacing = (text: string | null): Spacing =>
  SPACINGS.find((spacing) => {
    return spacing === text;
  }) ?? 'small';

/** An arrow style read back from its text; the straight one for anything else. */
export const parseEdgeStyle = (text: string | null): EdgeStyle =>
  EDGE_STYLES.find((style) => {
    return style === text;
  }) ?? 'straight';

/** Reads a key; storage may be blocked, and then there is nothing. */
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Writes a key; storage may be blocked, and then the view holds only until a reload. */
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the editor works without it.
  }
};

export const readViewport = () => parseViewport(read(VIEWPORT_KEY));

export const writeViewport = (viewport: Viewport) => {
  write(VIEWPORT_KEY, JSON.stringify(viewport));
};

export const readSpacing = () => parseSpacing(read(SPACING_KEY));

export const writeSpacing = (spacing: Spacing) => {
  write(SPACING_KEY, spacing);
};

export const readEdgeStyle = () => parseEdgeStyle(read(EDGE_STYLE_KEY));

export const writeEdgeStyle = (style: EdgeStyle) => {
  write(EDGE_STYLE_KEY, style);
};
