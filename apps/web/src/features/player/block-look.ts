import type { Theme } from '@gamebook/core';

/** Look of the block around the text; its typography comes from `StoryText`. */
export const THEME_BOX: Record<Theme, string> = {
  default: '',
  intro: '',
  green: '',
  red: '',
  letter: '',
  description: 'mx-auto w-[62%] opacity-75',
};

/**
 * Colors of the whole screen around the block. The colored screens are dark in the light mode too,
 * and `dark:` applies only when the whole page is.
 */
export const THEME_PAGE: Record<Theme, string> = {
  default: '',
  intro: '',
  green:
    'dark bg-[oklch(0.29_0.04_155)] text-[oklch(0.92_0.05_150)] dark:bg-[oklch(0.16_0.025_155)] dark:text-[oklch(0.82_0.1_150)]',
  red: 'dark bg-[oklch(0.29_0.055_25)] text-[oklch(0.92_0.04_25)] dark:bg-[oklch(0.16_0.03_25)] dark:text-[oklch(0.82_0.09_25)]',
  letter: '',
  description: '',
};
