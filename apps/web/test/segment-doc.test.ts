import { describe, expect, it } from 'vitest';

import type { DraftSegment } from '@/features/editor/draft';
import { SAMPLE_DRAFT } from '@/features/editor/sample-draft';
import {
  dividerLine,
  dividerTheme,
  docToSegments,
  isDivider,
  segmentsToDoc,
} from '@/features/editor/segment-doc';

describe('divider lines', () => {
  it('write the theme after ===, none for the default one', () => {
    expect(dividerLine(undefined)).toBe('===');
    expect(dividerLine('default')).toBe('===');
    expect(dividerLine('red')).toBe('=== red');
  });

  it('read the theme back, an unknown one as the default', () => {
    expect(isDivider('===')).toBe(true);
    expect(isDivider('===  red ')).toBe(true);
    expect(isDivider('=== red green')).toBe(false);
    expect(isDivider('====')).toBe(false);
    expect(dividerTheme('=== red')).toBe('red');
    expect(dividerTheme('=== default')).toBeUndefined();
    expect(dividerTheme('=== purple')).toBeUndefined();
  });
});

describe('segmentsToDoc and docToSegments', () => {
  const segments: readonly DraftSegment[] = [
    { text: 'Voní to tu chlebem.\n\nPekařka se usměje.' },
    { theme: 'red', text: '**„Ven!“**', note: 'The baker is angry.\nShe shouts.' },
    { theme: 'letter', text: '' },
  ];

  /** The notes of the segments, in their order, as the editor keeps them apart from the text. */
  const notesOf = (list: readonly DraftSegment[]) =>
    list.map((segment) => {
      return segment.note;
    });

  it('write a divider, then the text of every segment, without the notes', () => {
    expect(segmentsToDoc(segments)).toBe(
      [
        '===',
        'Voní to tu chlebem.',
        '',
        'Pekařka se usměje.',
        '=== red',
        '**„Ven!“**',
        '=== letter',
        '',
      ].join('\n'),
    );
  });

  it('read back the same segments with their notes', () => {
    expect(docToSegments(segmentsToDoc(segments), notesOf(segments))).toEqual(segments);
    for (const node of SAMPLE_DRAFT.nodes) {
      expect(docToSegments(segmentsToDoc(node.segments), notesOf(node.segments))).toEqual(
        node.segments,
      );
    }
  });

  it('keep a line starting with // as text and trim blank lines around the text', () => {
    expect(docToSegments('=== green\n\nJedna\n// pozn\n\nDvě\n\n', ['  ', undefined])).toEqual([
      { theme: 'green', text: 'Jedna\n// pozn\n\nDvě' },
    ]);
  });

  it('keep the text before the first divider as a segment in the default theme', () => {
    expect(docToSegments('\nÚvod\n=== red\nDál')).toEqual([
      { text: 'Úvod' },
      { theme: 'red', text: 'Dál' },
    ]);
  });

  it('keep at least one segment', () => {
    expect(docToSegments('')).toEqual([{ text: '' }]);
    expect(docToSegments('\n\n')).toEqual([{ text: '' }]);
  });

  it('keep the indentation of the first line', () => {
    expect(docToSegments('===\n\n    kód')).toEqual([{ text: '    kód' }]);
  });
});
