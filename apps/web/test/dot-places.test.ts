import { describe, expect, it } from 'vitest';

import { dotPlaces } from '@/features/editor/draft-node-card';

describe('dotPlaces', () => {
  const choices = [
    { label: 'Do B', to: 'b' },
    { label: 'Do C', to: 'c' },
    { label: 'Zase B', to: 'b' },
  ];

  it('spreads the pills evenly, the choices to one node in one, in the order their nodes come', () => {
    const places = dotPlaces(choices, 300);
    expect(places.groups.map((group) => group.members)).toEqual([[0, 2], [1]]);
    expect(places.groups.map((group) => group.center)).toEqual([100, 200]);
    expect(places.end).toBe(150);
  });

  it('puts the pills in the order given, whatever the order of the choices', () => {
    const places = dotPlaces(choices, 300, ['c', 'b']);
    expect(places.groups.map((group) => group.members)).toEqual([[1], [0, 2]]);
    expect(places.choices[1]).toBe(100);
  });
});
