import { validateStory } from '@gamebook/core';
import { describe, expect, it } from 'vitest';

import { story } from '../src/story.ts';

// That the story compiles (goto, nextState, theme) is checked by `pnpm typecheck`.
describe('story', () => {
  it('has no unreachable nodes, unused choices, dead ends, traps or empty content', () => {
    expect(validateStory(story)).toEqual([]);
  });
});
