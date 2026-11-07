const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/iPad/, 'iPad'],
  [/iPhone/, 'iPhone'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  // An iPad asking for the desktop site says it is a Mac.
  [/Macintosh|Mac OS X/, 'Mac'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
] as const;

// The order matters: Edge and Opera say they are Chrome, Chrome says it is Safari.
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/EdgA?\/|EdgiOS\//, 'Edge'],
  [/OPR\/|OPiOS\//, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/FxiOS\/|Firefox\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
] as const;

const firstMatch = (table: readonly (readonly [RegExp, string])[], userAgent: string) =>
  table.find(([pattern]) => pattern.test(userAgent))?.[1];

/**
 * A short name of the device from its browser's description, such as „iPhone · Safari“, so the
 * admin can tell the phones of a team apart. The description is the device's own word and can be
 * anything; what is not recognised is left out.
 */
export const deviceLabel = (userAgent: string | undefined): string => {
  if (userAgent === undefined || userAgent === '') return 'Neznámé zařízení';
  const parts = [firstMatch(SYSTEMS, userAgent), firstMatch(BROWSERS, userAgent)].filter(
    (part) => part !== undefined,
  );
  return parts.length === 0 ? 'Neznámé zařízení' : parts.join(' · ');
};
