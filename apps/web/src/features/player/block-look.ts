import type { Theme } from '@gamebook/core';

/** Look of the block around the text; its typography comes from `StoryText`. */
export const THEME_BOX: Record<Theme, string> = {
  default: '',
  intro: '',
  outro: '',
  letter: '',
  description: 'mx-auto w-[62%] opacity-75',
};

/** Colors of the whole screen around the block. */
export const THEME_PAGE: Record<Theme, string> = {
  default: '',
  intro: '',
  outro: 'bg-amber-100 text-amber-950 dark:bg-yellow-950 dark:text-amber-100',
  letter: '',
  description: '',
};
