import { IconBook } from '@tabler/icons-react';

/**
 * A small yellow capsule with a dark book at the top of the screen, like the one a phone shows while it
 * records: the team reads, so its game time stands still. It is shown only then; while the time
 * runs there is nothing. The words are there for a screen reader.
 */
export const ReadingChip = () => (
  <div
    role='status'
    className='reading-chip-in inline-grid h-7 w-10 place-items-center rounded-full bg-reading shadow-[0_1px_2px_rgb(0_0_0/0.15),0_4px_12px_-4px_rgb(0_0_0/0.3)]'
  >
    <span className='sr-only'>Čas stojí</span>
    <IconBook className='size-5 text-neutral-950' aria-hidden />
  </div>
);
