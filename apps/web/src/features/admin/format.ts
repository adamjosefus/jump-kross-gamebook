/** A date and time in Czech, such as „7. 11. 09:51“; with seconds when they matter. */
export const formatDateTime = (iso: string, { seconds = false } = {}) =>
  new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  });

/** A time of day, such as „09:51“, for what happened today. */
export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

/** How long ago, such as „před 5 min“; after an hour the time itself. */
export const timeAgo = (iso: string) => {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `před ${seconds} s`;
  if (seconds < 3600) return `před ${Math.round(seconds / 60)} min`;
  return formatTime(iso);
};
