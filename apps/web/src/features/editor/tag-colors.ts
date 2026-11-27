/** Looks of a node's color: its id's tag, and the dots of the choices leading to it. */
export interface TagColor {
  /** The tag with the node's id. */
  readonly tag: string;
  /** A choice's dot; `!` wins over React Flow's own look of a handle. */
  readonly dot: string;
}

/**
 * Nine colors far enough apart to tell the nodes from each other; the nodes take them in turn by
 * their order in the draft, so a node keeps its color while its id follows the summary.
 */
export const TAG_COLORS: readonly TagColor[] = [
  { tag: 'bg-red-500/15 text-red-700 dark:text-red-300', dot: 'bg-red-500!' },
  { tag: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500!' },
  { tag: 'bg-amber-500/20 text-amber-800 dark:text-amber-300', dot: 'bg-amber-500!' },
  { tag: 'bg-lime-500/20 text-lime-800 dark:text-lime-300', dot: 'bg-lime-600!' },
  { tag: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500!' },
  { tag: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500!' },
  { tag: 'bg-blue-500/15 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500!' },
  { tag: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500!' },
  { tag: 'bg-pink-500/15 text-pink-700 dark:text-pink-300', dot: 'bg-pink-500!' },
];

/** The color of the node at `index` in the draft. */
export const tagColor = (index: number): TagColor => TAG_COLORS[index % TAG_COLORS.length]!;
