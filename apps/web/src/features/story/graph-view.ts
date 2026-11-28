import { useState } from 'react';

/** How far apart a graph lays its cards out, chosen in its toolbar. */
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
export const readSetting = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Writes a key; storage may be blocked, and then the setting holds only until a reload. */
export const writeSetting = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the graph works without it.
  }
};

/**
 * Where this browser keeps the story graphs' view, shared by the story, the test and the live
 * page; the editor keeps its own.
 */
const SPACING_KEY = 'gamebook:graph:spacing';
const EDGE_STYLE_KEY = 'gamebook:graph:edges';

export const readGraphSpacing = () => parseSpacing(readSetting(SPACING_KEY));

export const writeGraphSpacing = (spacing: Spacing) => {
  writeSetting(SPACING_KEY, spacing);
};

export const readGraphEdgeStyle = () => parseEdgeStyle(readSetting(EDGE_STYLE_KEY));

export const writeGraphEdgeStyle = (style: EdgeStyle) => {
  writeSetting(EDGE_STYLE_KEY, style);
};

/** How a story graph is laid out and drawn, as chosen in its toolbar. */
export interface GraphView {
  readonly spacing: Spacing;
  readonly edgeStyle: EdgeStyle;
}

export const DEFAULT_GRAPH_VIEW: GraphView = { spacing: 'small', edgeStyle: 'straight' };

/**
 * The story graphs' view, kept in this browser for the story, the test and the live page alike;
 * a change is written at once.
 */
export const useGraphView = () => {
  const [view, setView] = useState<GraphView>(() => ({
    spacing: readGraphSpacing(),
    edgeStyle: readGraphEdgeStyle(),
  }));
  const change = (next: GraphView) => {
    setView(next);
    writeGraphSpacing(next.spacing);
    writeGraphEdgeStyle(next.edgeStyle);
  };

  return [view, change] as const;
};
