import { useEffect, useState } from 'react';

const STORAGE_KEY = 'segment-visits';
/** How long a visited segment counts as recent. */
const RECENT_MS = 10 * 60 * 1000;

/** When each segment was last visited; survives a reload, so it lives in the browser's storage. */
const readVisits = (): Readonly<Record<string, unknown>> => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return typeof stored === 'object' && stored !== null ? { ...stored } : {};
  } catch {
    return {};
  }
};

const isRecent = (at: unknown) => typeof at === 'number' && Date.now() - at < RECENT_MS;

const recordVisit = (segment: string) => {
  // Old visits are dropped here, so the storage does not grow.
  const recent = Object.entries(readVisits()).filter(([, at]) => isRecent(at));
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...Object.fromEntries(recent), [segment]: Date.now() }),
    );
  } catch {
    // Without the storage every visit counts as the first one.
  }
};

/**
 * Whether the segment was visited recently, before this visit, which is recorded now. The answer
 * stays the same for as long as the component is mounted.
 */
export const useRecentVisit = (segment: string) => {
  const [recent] = useState(() => isRecent(readVisits()[segment]));
  useEffect(() => recordVisit(segment), [segment]);
  return recent;
};
