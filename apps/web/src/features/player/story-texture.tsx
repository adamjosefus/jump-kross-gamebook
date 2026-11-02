/** Size of the tile in `.story-texture`, in px. */
const TILE = 320;

/** A stable number for the block, so coming back to it shows the same dots. */
const hashOf = (block: string) => {
  let hash = 2166136261;
  for (const char of block) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  return hash >>> 0;
};

/**
 * Fine dots behind a screen, different for every block: the one tile of dots is moved and flipped
 * by the block's hash. Fades in, so the dots of the next block do not jump in at once.
 */
export const StoryTexture = ({ block }: { block: string }) => {
  const hash = hashOf(block);
  return (
    <div
      className='story-texture screen-fade-in'
      style={{
        maskPosition: `${hash % TILE}px ${(hash >>> 9) % TILE}px`,
        scale: `${hash & (1 << 18) ? -1 : 1} ${hash & (1 << 19) ? -1 : 1}`,
      }}
    />
  );
};
