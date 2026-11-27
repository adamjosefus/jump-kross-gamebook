import { describe, expect, it } from 'vitest';

import { goTo, startTrail, step } from '@/features/editor/focus-trail';

describe('the focus trail', () => {
  it('walks on, back and forth, as far as it goes', () => {
    let trail = goTo(goTo(startTrail('a'), 'b'), 'c');
    expect(trail).toEqual({ ids: ['a', 'b', 'c'], at: 2 });
    trail = step(step(trail, -1), -1);
    expect(trail.at).toBe(0);
    expect(step(trail, -1)).toEqual(trail);
    trail = step(trail, 1);
    expect(trail.ids[trail.at]).toBe('b');
  });

  it('forgets the nodes ahead when it walks elsewhere from the middle', () => {
    const trail = goTo(step(goTo(goTo(startTrail('a'), 'b'), 'c'), -1), 'd');
    expect(trail).toEqual({ ids: ['a', 'b', 'd'], at: 2 });
  });

  it('stays put when the node shown is opened again', () => {
    const trail = goTo(startTrail('a'), 'b');
    expect(goTo(trail, 'b')).toBe(trail);
  });
});
