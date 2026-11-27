/**
 * Looks of a node's color, the same in both places: a light background, dark text and an outline
 * in the full color, for contrast on the card and on the canvas alike.
 */
export interface TagColor {
  /** The tag with the node's id. */
  readonly tag: string;
  /**
   * A choice's dot leading to the node: the same classes with `!`, which wins over React Flow's
   * own look of a handle. Written out whole, so that Tailwind finds them.
   */
  readonly dot: string;
}

/**
 * Nine colors far enough apart to tell the nodes from each other; the nodes take them in turn by
 * their order in the draft, so a node keeps its color while its id follows the summary.
 */
export const TAG_COLORS: readonly TagColor[] = [
  {
    tag: 'border-red-500 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    dot: 'border-red-500! bg-red-100! text-red-800! dark:bg-red-950! dark:text-red-200!',
  },
  {
    tag: 'border-orange-500 bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
    dot: 'border-orange-500! bg-orange-100! text-orange-800! dark:bg-orange-950! dark:text-orange-200!',
  },
  {
    tag: 'border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    dot: 'border-amber-500! bg-amber-100! text-amber-800! dark:bg-amber-950! dark:text-amber-200!',
  },
  {
    tag: 'border-lime-600 bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200',
    dot: 'border-lime-600! bg-lime-100! text-lime-800! dark:bg-lime-950! dark:text-lime-200!',
  },
  {
    tag: 'border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    dot: 'border-emerald-500! bg-emerald-100! text-emerald-800! dark:bg-emerald-950! dark:text-emerald-200!',
  },
  {
    tag: 'border-cyan-500 bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
    dot: 'border-cyan-500! bg-cyan-100! text-cyan-800! dark:bg-cyan-950! dark:text-cyan-200!',
  },
  {
    tag: 'border-blue-500 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
    dot: 'border-blue-500! bg-blue-100! text-blue-800! dark:bg-blue-950! dark:text-blue-200!',
  },
  {
    tag: 'border-violet-500 bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
    dot: 'border-violet-500! bg-violet-100! text-violet-800! dark:bg-violet-950! dark:text-violet-200!',
  },
  {
    tag: 'border-pink-500 bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200',
    dot: 'border-pink-500! bg-pink-100! text-pink-800! dark:bg-pink-950! dark:text-pink-200!',
  },
];

/**
 * How far apart in the palette two neighbouring nodes' colors are. The palette goes round the
 * hues, so neighbours in it look alike; a stride of 4 of 9 takes colors from nearly opposite
 * sides, and, having no common divisor with 9, still takes every color in turn.
 */
const STRIDE = 4;

/** The color of the node at `index` in the draft. */
export const tagColor = (index: number): TagColor =>
  TAG_COLORS[(index * STRIDE) % TAG_COLORS.length]!;
