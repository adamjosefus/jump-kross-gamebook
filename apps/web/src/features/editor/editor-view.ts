import type { Viewport } from '@xyflow/react';

import {
  parseEdgeStyle,
  parseSpacing,
  readSetting as read,
  writeSetting as write,
  type EdgeStyle,
  type Spacing,
} from '@/features/story/graph-view';

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

    const left: unknown = Reflect.get(value, 'x');
    const top: unknown = Reflect.get(value, 'y');
    const zoom: unknown = Reflect.get(value, 'zoom');
    if (
      typeof left !== 'number' ||
      typeof top !== 'number' ||
      typeof zoom !== 'number' ||
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !(zoom > 0)
    ) {
      return undefined;
    }

    return { x: left, y: top, zoom };
  } catch {
    return undefined;
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
