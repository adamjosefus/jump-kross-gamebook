import { graphProblems, renderNode, startPosition, toGraph } from '@gamebook/core';
import { describe, expect, it } from 'vitest';

import { story } from '../src/story.ts';

describe('story', () => {
  it('has a start and no unreachable nodes', () => {
    expect(graphProblems(toGraph(story))).toEqual([]);
  });

  it('renders every start with its initial state', () => {
    const starts = story.order.flatMap((id) => startPosition(story, id) ?? []);
    expect(starts.length).toBeGreaterThan(0);
    for (const start of starts) expect(renderNode(story, start)?.screens.length).toBeGreaterThan(0);
  });
});
