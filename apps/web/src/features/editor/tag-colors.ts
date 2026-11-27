/** Looks of a node's color: a quiet tag with its id, and the same look on the dots leading to it. */
export interface TagColor {
  /**
   * The tag with the node's id: a dark tint of the color with the text in the color, light enough
   * on the dark canvas and dark enough on the light one.
   */
  readonly tag: string;
  /**
   * A choice's dot leading to the node as a handle: the `tag` classes with `!`, which wins over
   * React Flow's own look of a handle. Written out whole, so that Tailwind finds them.
   */
  readonly dot: string;
}

/**
 * Nine strong colors far enough apart to tell the nodes from each other, as tints with the text in
 * the color, on the tags and on the dots alike.
 */
export const TAG_COLORS: readonly TagColor[] = [
  {
    tag: 'bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    dot: 'bg-red-500/15! text-red-700! dark:bg-red-500/20! dark:text-red-300!',
  },
  {
    tag: 'bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    dot: 'bg-orange-500/15! text-orange-700! dark:bg-orange-500/20! dark:text-orange-300!',
  },
  {
    tag: 'bg-amber-400/20 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200',
    dot: 'bg-amber-400/20! text-amber-700! dark:bg-amber-400/20! dark:text-amber-200!',
  },
  {
    tag: 'bg-lime-400/20 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300',
    dot: 'bg-lime-400/20! text-lime-700! dark:bg-lime-400/15! dark:text-lime-300!',
  },
  {
    tag: 'bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    dot: 'bg-emerald-600/15! text-emerald-700! dark:bg-emerald-500/20! dark:text-emerald-300!',
  },
  {
    tag: 'bg-cyan-400/20 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300',
    dot: 'bg-cyan-400/20! text-cyan-700! dark:bg-cyan-400/15! dark:text-cyan-300!',
  },
  {
    tag: 'bg-blue-600/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    dot: 'bg-blue-600/15! text-blue-700! dark:bg-blue-500/20! dark:text-blue-300!',
  },
  {
    tag: 'bg-violet-600/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    dot: 'bg-violet-600/15! text-violet-700! dark:bg-violet-500/20! dark:text-violet-300!',
  },
  {
    tag: 'bg-pink-600/15 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    dot: 'bg-pink-600/15! text-pink-700! dark:bg-pink-500/20! dark:text-pink-300!',
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
