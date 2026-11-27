import { describe, expect, it } from 'vitest';

import type { Draft } from '@/features/editor/draft';
import {
  addStart,
  startInNew,
  draftFileText,
  EMPTY_DRAFT,
  fitAllSizes,
  linkChoice,
  linkInto,
  moveChoice,
  parseDraft,
  removeAll,
  removeChoice,
  removeNode,
  removeStart,
  renameNode,
  setSize,
  stampChanges,
  updateNode,
  withNote,
} from '@/features/editor/draft-edit';
import { SAMPLE_DRAFT } from '@/features/editor/sample-draft';

const draft: Draft = {
  version: 1,
  starts: ['a'],
  nodes: [
    {
      id: 'a',
      summary: 'A',
      segments: [{ text: '' }],
      choices: [
        { label: 'Do B', to: 'b' },
        { label: '', to: 'c' },
        { label: 'Zase B', to: 'b' },
      ],
    },
    { id: 'b', summary: 'B', segments: [{ text: '' }], choices: [{ label: 'Zpět', to: 'a' }] },
    { id: 'c', summary: 'C', segments: [{ text: '' }], choices: [] },
  ],
};

const choicesOf = (from: Draft, id: string) =>
  from.nodes
    .find((node) => node.id === id)
    ?.choices.map((choice) => `${choice.label}>${choice.to}`);

describe('editing a draft', () => {
  it('starts with one empty node, the start', () => {
    expect(EMPTY_DRAFT.nodes).toEqual([
      { id: 'uzel', summary: '', segments: [{ text: '' }], choices: [] },
    ]);
    expect(EMPTY_DRAFT.starts).toEqual(['uzel']);
  });

  it('points the start at a node too, or no more', () => {
    expect(addStart(draft, 'c').starts).toEqual(['a', 'c']);
    expect(addStart(draft, 'a')).toBe(draft);
    expect(removeStart(draft, 'a').starts).toEqual([]);
  });

  it('leads a new choice into a node, from a node or a new one', () => {
    const existing = linkInto(draft, 'a', 'c');
    expect(existing.source).toBe('c');
    expect(choicesOf(existing.draft, 'c')).toEqual(['>a']);
    const drawn = linkInto(draft, 'c');
    expect(drawn.source).toBe('uzel');
    expect(choicesOf(drawn.draft, 'uzel')).toEqual(['>c']);
  });

  it('changes one node', () => {
    const changed = updateNode(draft, 'b', (node) => ({ ...node, summary: 'Bé' }));
    expect(changed.nodes.map((node) => node.summary)).toEqual(['A', 'Bé', 'C']);
  });

  it('renames a node and the choices leading to it', () => {
    const renamed = renameNode(draft, 'b', 'pekarna');
    expect(renamed.nodes.map((node) => node.id)).toEqual(['a', 'pekarna', 'c']);
    expect(choicesOf(renamed, 'a')).toEqual(['Do B>pekarna', '>c', 'Zase B>pekarna']);
    expect(renameNode(draft, 'b', 'b')).toBe(draft);
    expect(renameNode(draft, 'a', 'zacatek').starts).toEqual(['zacatek']);
  });

  it('removes a node with the choices leading to it', () => {
    const removed = removeNode(draft, 'b');
    expect(removed.nodes.map((node) => node.id)).toEqual(['a', 'c']);
    expect(choicesOf(removed, 'a')).toEqual(['>c']);
    expect(removeNode(draft, 'a').starts).toEqual([]);
  });

  it('links a choice to a node, or to a new one it adds', () => {
    const existing = linkChoice(draft, 'c', 'new', 'a');
    expect(existing.target).toBe('a');
    expect(choicesOf(existing.draft, 'c')).toEqual(['>a']);
    const drawn = linkChoice(draft, 'a', 1);
    expect(drawn.target).toBe('uzel');
    expect(choicesOf(drawn.draft, 'a')).toEqual(['Do B>b', '>uzel', 'Zase B>b']);
    expect(drawn.draft.nodes.at(-1)).toEqual({
      id: 'uzel',
      summary: '',
      segments: [{ text: '' }],
      choices: [],
    });
    expect(linkChoice(drawn.draft, 'b', 'new').target).toBe('uzel_2');
  });

  it('moves a choice within the list and no further', () => {
    expect(choicesOf(moveChoice(draft, 'a', 0, 1), 'a')).toEqual(['>c', 'Do B>b', 'Zase B>b']);
    expect(choicesOf(moveChoice(draft, 'a', 2, -1), 'a')).toEqual(['Do B>b', 'Zase B>b', '>c']);
    expect(moveChoice(draft, 'a', 0, -1).nodes[0]).toBe(draft.nodes[0]);
  });

  it('sizes a card, and lets it follow its text again', () => {
    const sized = setSize(draft, 'b', { width: 400 });
    expect(sized.nodes[1]!.size).toEqual({ width: 400 });
    expect(setSize(sized, 'b', undefined).nodes[1]).toEqual(draft.nodes[1]);
    expect(setSize(sized, 'b', {}).nodes[1]).toEqual(draft.nodes[1]);
  });

  it('lets every card follow its text again', () => {
    const sized = setSize(setSize(draft, 'a', { width: 400 }), 'b', { height: 300 });
    expect(fitAllSizes(sized)).toEqual(draft);
    expect(fitAllSizes(draft)).toBe(draft);
  });

  it('removes nodes, choices and arrows of the start at once', () => {
    const removed = removeAll(draft, {
      nodes: ['c'],
      choices: [
        { id: 'a', index: 0 },
        { id: 'a', index: 2 },
      ],
      starts: ['a'],
    });
    expect(removed.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(choicesOf(removed, 'a')).toEqual([]);
    expect(removed.starts).toEqual([]);
  });

  it('removes a choice', () => {
    expect(choicesOf(removeChoice(draft, 'a', 1), 'a')).toEqual(['Do B>b', 'Zase B>b']);
  });
});

describe('stampChanges', () => {
  const at = '2026-11-27T18:04:05.000Z';

  it('stamps the nodes changed or added, and leaves the others', () => {
    const changed = updateNode(draft, 'b', (node) => ({ ...node, summary: 'Bé' }));
    const stamped = stampChanges(draft, changed, at);
    expect(stamped.nodes.map((node) => node.updatedAt)).toEqual([undefined, at, undefined]);
    const drawn = linkChoice(draft, 'c', 'new').draft;
    expect(stampChanges(draft, drawn, at).nodes.map((node) => node.updatedAt)).toEqual([
      undefined,
      undefined,
      at,
      at,
    ]);
  });

  it('takes a renamed node for the same node, and a resized card for no change', () => {
    const renamed = stampChanges(draft, renameNode(draft, 'c', 'konec'), at);
    expect(renamed.nodes.map((node) => node.updatedAt)).toEqual([at, undefined, at]);
    const sized = setSize(draft, 'a', { width: 400 });
    expect(stampChanges(draft, sized, at)).toBe(sized);
  });
});

describe('parseDraft', () => {
  it('reads back a draft written as JSON', () => {
    expect(parseDraft(JSON.parse(JSON.stringify(SAMPLE_DRAFT)))).toEqual(SAMPLE_DRAFT);
    const sized = setSize(SAMPLE_DRAFT, 'vecere', { width: 420, height: 300 });
    expect(parseDraft(JSON.parse(JSON.stringify(sized)))).toEqual(sized);
  });

  it('reads the time of the last change of a node', () => {
    const at = '2026-11-27T18:04:05.000Z';
    const stamped = { ...SAMPLE_DRAFT, nodes: [{ ...SAMPLE_DRAFT.nodes[0], updatedAt: at }] };
    expect(parseDraft(JSON.parse(JSON.stringify(stamped)))?.nodes[0]?.updatedAt).toBe(at);
  });

  it('leaves out the time of the last change of the whole draft an older file keeps', () => {
    const older = { ...SAMPLE_DRAFT, updatedAt: '2026-11-27T17:04:05.000Z' };
    expect(parseDraft(older)).toEqual(SAMPLE_DRAFT);
  });

  it('writes the file with its keys in order, the version first', () => {
    const text = draftFileText(SAMPLE_DRAFT);
    expect(Object.keys(JSON.parse(text))).toEqual(['version', 'starts', 'nodes']);
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseDraft(JSON.parse(text))).toEqual(SAMPLE_DRAFT);
  });

  it('writes out the start of a draft from before it was kept', () => {
    const { starts: _starts, ...older } = SAMPLE_DRAFT;
    expect(parseDraft(JSON.parse(JSON.stringify(older)))?.starts).toEqual(['patek_odpoledne_doma']);
  });

  it('turns down what is not a draft', () => {
    const node = { id: 'a', summary: '', segments: [{ text: '' }], choices: [] };
    expect(parseDraft(undefined)).toBeUndefined();
    expect(parseDraft({ version: 2, nodes: [] })).toBeUndefined();
    expect(parseDraft({ version: 1, nodes: [{ ...node, segments: [] }] })).toBeUndefined();
    expect(
      parseDraft({ version: 1, nodes: [{ ...node, segments: [{ text: '', theme: 'blue' }] }] }),
    ).toBeUndefined();
    expect(
      parseDraft({ version: 1, nodes: [{ ...node, choices: [{ to: 'b' }] }] }),
    ).toBeUndefined();
    expect(parseDraft({ version: 1, nodes: [node, node] })).toBeUndefined();
    expect(parseDraft({ version: 1, nodes: [{ ...node, size: { width: -1 } }] })).toBeUndefined();
    expect(parseDraft({ version: 1, nodes: [{ ...node, size: 'big' }] })).toBeUndefined();
  });
});

describe('setSize and stampChanges', () => {
  const at = '2027-01-01T00:00:00.000Z';
  const sized: Draft = {
    version: 1,
    starts: ['a'],
    nodes: [
      {
        id: 'a',
        summary: 'Začátek',
        segments: [{ text: '' }],
        choices: [],
        size: { width: 300 },
        updatedAt: at,
      },
    ],
  };

  it('keeps the time of the last change when the size follows the text again', () => {
    expect(setSize(sized, 'a', undefined).nodes[0]?.updatedAt).toBe(at);
    expect(fitAllSizes(sized).nodes[0]?.updatedAt).toBe(at);
  });

  it('takes no new time for a size reset after a note was added', () => {
    const noted = updateNode(sized, 'a', (node) => withNote(node, 'Poznámka'));
    const reset = setSize(noted, 'a', undefined);
    expect(stampChanges(noted, reset, 'later').nodes[0]?.updatedAt).toBe(at);
  });
});

describe('startInNew', () => {
  it('begins an empty draft at a new node', () => {
    const empty: Draft = { version: 1, starts: [], nodes: [] };
    const begun = startInNew(empty);
    expect(begun.draft.nodes.map((node) => node.id)).toEqual([begun.target]);
    expect(begun.draft.starts).toEqual([begun.target]);
  });
});
