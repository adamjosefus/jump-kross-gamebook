import type { Theme } from '@gamebook/core';

/** Box around the text; its typography comes from `StoryText`. */
export const THEME_BOX: Record<Theme, string> = {
  default: '',
  intro: '',
  letter:
    'rounded-lg border bg-amber-50 p-6 text-amber-950 shadow-sm dark:bg-amber-950/30 dark:text-amber-50/90',
  night: 'rounded-lg bg-slate-900 p-6 text-slate-200 ring-1 ring-slate-800',
};

/** The title screen and the end of the game are centered. */
export const blockAlign = (theme: Theme, end: boolean) =>
  theme === 'intro' || end ? 'center' : 'left';
