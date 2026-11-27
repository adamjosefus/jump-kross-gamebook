/** Looks of a node's color, the same in both places: a full color, with black or white text. */
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
 * Nine strong colors far enough apart to tell the nodes from each other, each with the text that
 * reads better on it, black or white; the same in the light and the dark mode.
 */
export const TAG_COLORS: readonly TagColor[] = [
  { tag: 'bg-red-600 text-white', dot: 'bg-red-600! text-white!' },
  { tag: 'bg-orange-500 text-black', dot: 'bg-orange-500! text-black!' },
  { tag: 'bg-amber-400 text-black', dot: 'bg-amber-400! text-black!' },
  { tag: 'bg-lime-400 text-black', dot: 'bg-lime-400! text-black!' },
  { tag: 'bg-emerald-700 text-white', dot: 'bg-emerald-700! text-white!' },
  { tag: 'bg-cyan-400 text-black', dot: 'bg-cyan-400! text-black!' },
  { tag: 'bg-blue-600 text-white', dot: 'bg-blue-600! text-white!' },
  { tag: 'bg-violet-600 text-white', dot: 'bg-violet-600! text-white!' },
  { tag: 'bg-pink-700 text-white', dot: 'bg-pink-700! text-white!' },
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
