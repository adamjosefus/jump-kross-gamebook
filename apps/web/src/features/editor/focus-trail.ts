/** The nodes opened in the dialog one after another, and which of them is shown. */
export interface FocusTrail {
  readonly ids: readonly string[];
  readonly at: number;
}

/** A trail starting at one node. */
export const startTrail = (id: string): FocusTrail => ({ ids: [id], at: 0 });

/** The trail with `id` opened after the node shown; the nodes ahead of it are forgotten. */
export const goTo = (trail: FocusTrail, id: string): FocusTrail => {
  if (trail.ids[trail.at] === id) {
    return trail;
  }

  const ids = [...trail.ids.slice(0, trail.at + 1), id];
  return { ids, at: ids.length - 1 };
};

/** The trail a step back or forth, as far as it goes. */
export const step = (trail: FocusTrail, by: -1 | 1): FocusTrail => ({
  ...trail,
  at: Math.max(0, Math.min(trail.ids.length - 1, trail.at + by)),
});

/** The trail with the node `from` renamed `to`, wherever it is on it. */
export const renameInTrail = (trail: FocusTrail, from: string, to: string): FocusTrail => ({
  ...trail,
  ids: trail.ids.map((id) => {
    return id === from ? to : id;
  }),
});
