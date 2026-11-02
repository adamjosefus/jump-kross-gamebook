import type { Theme } from '@gamebook/core';

/**
 * Places the block at the optical center, a little above the middle: of the free space, 2/5 are
 * above it and 3/5 under it. A block too long for the screen has no free space and starts at the
 * top.
 */
export const OPTICAL_CENTER =
  "flex flex-col before:flex-[2] before:content-[''] after:flex-[3] after:content-['']";

/** Look of the block around the text; its typography comes from `StoryText`. */
export const THEME_BOX: Readonly<Record<Theme, string>> = {
  default: '',
  intro: '',
  green: '',
  red: '',
  letter: 'mx-auto w-[90%]',
  description: 'mx-auto w-[62%] opacity-75',
};

/**
 * Colors of the whole screen around the block. The colored screens are dark in the light mode too,
 * and `dark:` applies only when the whole page is.
 */
export const THEME_PAGE: Readonly<Record<Theme, string>> = {
  default: '',
  intro: '',
  green:
    'dark bg-[oklch(0.29_0.04_155)] text-[oklch(0.92_0.05_150)] dark:bg-[oklch(0.16_0.025_155)] dark:text-[oklch(0.82_0.1_150)]',
  red: 'dark bg-[oklch(0.29_0.055_25)] text-[oklch(0.92_0.04_25)] dark:bg-[oklch(0.16_0.03_25)] dark:text-[oklch(0.82_0.09_25)]',
  letter: '',
  description: '',
};
