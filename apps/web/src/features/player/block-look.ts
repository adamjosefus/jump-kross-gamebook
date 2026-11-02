import type { Theme } from '@gamebook/core';

/** Look of the block around the text; its typography comes from `StoryText`. */
export const THEME_BOX: Record<Theme, string> = {
  default: '',
  intro: '',
  outro: 'text-yellow-800 dark:text-amber-200',
  letter:
    'rounded-lg border bg-amber-50 p-6 text-amber-950 shadow-sm dark:bg-amber-950/30 dark:text-amber-50/90',
  description: 'opacity-75',
};
