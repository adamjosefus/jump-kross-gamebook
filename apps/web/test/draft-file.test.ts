import { describe, expect, it } from 'vitest';

import { EMPTY_DRAFT, draftFileText } from '@/features/editor/draft-edit';
import {
  draftOfText,
  externalChange,
  nextVersionName,
  sameStamp,
} from '@/features/editor/draft-file';

describe('nextVersionName', () => {
  it('adds a number before the extension', () => {
    expect(nextVersionName('pribeh.json')).toBe('pribeh-2.json');
    expect(nextVersionName('story-draft.json')).toBe('story-draft-2.json');
  });

  it('raises the number a version has', () => {
    expect(nextVersionName('pribeh-2.json')).toBe('pribeh-3.json');
    expect(nextVersionName('pribeh-9.JSON')).toBe('pribeh-10.json');
  });

  it('gives a name without the extension one', () => {
    expect(nextVersionName('pribeh')).toBe('pribeh-2.json');
    expect(nextVersionName('.json')).toBe('story-draft-2.json');
  });

  it('keeps a name that is only a number as the name', () => {
    expect(nextVersionName('-3.json')).toBe('-3-2.json');
    expect(nextVersionName('2027.json')).toBe('2027-2.json');
  });
});

describe('draftOfText', () => {
  it('reads the text the editor writes', () => {
    expect(draftOfText(draftFileText(EMPTY_DRAFT))).toEqual(EMPTY_DRAFT);
  });

  it('gives nothing for a file half written or of another shape', () => {
    expect(draftOfText('{"version": 1, "nod')).toBeUndefined();
    expect(draftOfText('{"version": 2, "nodes": []}')).toBeUndefined();
  });
});

describe('externalChange', () => {
  const disk = { kind: 'draft', draft: EMPTY_DRAFT } as const;

  it('loads the file when everything of the editor is written', () => {
    expect(externalChange('saved', disk)).toBe('load');
  });

  it('asks when the editor has a change not written yet', () => {
    expect(externalChange('unsaved', disk)).toBe('conflict');
  });

  it('keeps off a file that holds no draft', () => {
    expect(externalChange('saved', { kind: 'broken' })).toBe('broken');
    expect(externalChange('unsaved', { kind: 'broken' })).toBe('broken');
  });
});

describe('sameStamp', () => {
  it('tells a file changed in time or size', () => {
    const stamp = { lastModified: 1, size: 10 };
    expect(sameStamp(stamp, { lastModified: 1, size: 10 })).toBe(true);
    expect(sameStamp(stamp, { lastModified: 2, size: 10 })).toBe(false);
    expect(sameStamp(stamp, { lastModified: 1, size: 11 })).toBe(false);
  });
});
