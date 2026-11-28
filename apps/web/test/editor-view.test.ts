import { describe, expect, it } from 'vitest';

import { parseViewport } from '@/features/editor/editor-view';
import { parseEdgeStyle, parseSpacing } from '@/features/story/graph-view';

describe('parseViewport', () => {
  it('reads back a viewport written as JSON', () => {
    expect(parseViewport(JSON.stringify({ x: -120, y: 40.5, zoom: 0.8 }))).toEqual({
      x: -120,
      y: 40.5,
      zoom: 0.8,
    });
  });

  it('gives nothing for what is not a viewport', () => {
    expect(parseViewport(null)).toBeUndefined();
    expect(parseViewport('nonsense')).toBeUndefined();
    expect(parseViewport(JSON.stringify({ x: 0, y: 0 }))).toBeUndefined();
    expect(parseViewport(JSON.stringify({ x: 0, y: 0, zoom: 0 }))).toBeUndefined();
  });
});

describe('parseSpacing', () => {
  it('reads back a spacing, and takes the small one for anything else', () => {
    expect(parseSpacing('larger')).toBe('larger');
    expect(parseSpacing(null)).toBe('small');
    expect(parseSpacing('huge')).toBe('small');
  });
});

describe('parseEdgeStyle', () => {
  it('reads back an arrow style, and takes the straight one for anything else', () => {
    expect(parseEdgeStyle('smooth')).toBe('smooth');
    expect(parseEdgeStyle(null)).toBe('straight');
    expect(parseEdgeStyle('wavy')).toBe('straight');
  });
});
