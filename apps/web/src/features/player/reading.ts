import { useCallback, useEffect, useEffectEvent, useRef } from 'react';

const QUEUE_KEY = 'reading-queue';
/** A glance while paging is not reading. */
const MIN_READING_MS = 1000;

interface QueuedReading {
  readonly id: string;
  readonly teamId: number;
  readonly endedAt: number;
  readonly ms: number;
}

const isQueued = (value: unknown): value is QueuedReading =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  'teamId' in value &&
  'endedAt' in value &&
  'ms' in value;

const readQueue = (): readonly QueuedReading[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter(isQueued) : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue: readonly QueuedReading[]) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // The time then stays unreported; the game itself does not depend on it.
  }
};

/**
 * Sends what the device has read. There may be no signal outdoors, so the times wait in the
 * browser's storage until the server has them; one sent twice overlaps itself and counts once.
 * `keepalive` lets the request finish while the page is being closed, which the typed API client
 * cannot ask for. Times of another team (the device has switched) cannot be sent anymore.
 */
const flush = (teamId: number) => {
  const queue = readQueue().filter((entry) => entry.teamId === teamId);
  writeQueue(queue);
  if (queue.length === 0) return;
  const now = Date.now();
  void fetch('/api/player/reading', {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    // The device's clock may be off, so the server gets how long ago, not when.
    body: JSON.stringify({
      intervals: queue.map(({ ms, endedAt }) => ({ ms, agoMs: Math.max(now - endedAt, 0) })),
    }),
  })
    .then((response) => {
      if (!response.ok) return;
      const sent = new Set(queue.map((entry) => entry.id));
      writeQueue(readQueue().filter((entry) => !sent.has(entry.id)));
    })
    .catch(() => {
      // No signal: tried again with the next text, or when the signal or the page comes back.
    });
};

/** Reports reading of a logged-in team and sends what is still waiting whenever it can. */
export const useReadingReport = (teamId: number) => {
  useEffect(() => {
    const retry = () => {
      if (document.visibilityState === 'visible') flush(teamId);
    };
    retry();
    document.addEventListener('visibilitychange', retry);
    window.addEventListener('online', retry);
    return () => {
      document.removeEventListener('visibilitychange', retry);
      window.removeEventListener('online', retry);
    };
  }, [teamId]);
  return useCallback(
    (ms: number) => {
      const entry = { id: crypto.randomUUID(), teamId, endedAt: Date.now(), ms };
      writeQueue([...readQueue(), entry]);
      flush(teamId);
    },
    [teamId],
  );
};

/** Calls `onRead` with how long the mounted text was on a visible page, each time it stops being. */
export const useReadingTime = (onRead: ((ms: number) => void) | undefined) => {
  const report = useEffectEvent((ms: number) => onRead?.(ms));
  const shownAt = useRef<number | undefined>(undefined);
  useEffect(() => {
    const stop = () => {
      if (shownAt.current === undefined) return;
      const ms = Date.now() - shownAt.current;
      shownAt.current = undefined;
      if (ms >= MIN_READING_MS) report(ms);
    };
    const follow = () => {
      if (document.visibilityState === 'visible') shownAt.current ??= Date.now();
      else stop();
    };
    follow();
    document.addEventListener('visibilitychange', follow);
    return () => {
      document.removeEventListener('visibilitychange', follow);
      stop();
    };
  }, []);
};
