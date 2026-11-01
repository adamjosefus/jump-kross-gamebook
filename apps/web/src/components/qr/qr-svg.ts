import QRCode from 'qrcode';

/** Quiet zone around the code, in modules (the spec asks for 4). */
export const QUIET_ZONE = 4;
const MARGIN = QUIET_ZONE;

/** Random modules around the code that make it harder to read by eye; scanners ignore them. */
export type NoiseShape = 'square' | 'circle';

export interface QrNoise {
  readonly shape: NoiseShape;
  /** Width of the band around the quiet zone, in modules. */
  readonly width: number;
}

export interface QrGeometry {
  /** Width and height in modules, quiet zone and noise included. */
  readonly size: number;
  /** All dark modules as one path. */
  readonly path: string;
}

export interface QrRuns {
  /** Width and height in modules, quiet zone and noise included. */
  readonly size: number;
  /** Horizontal runs of dark modules, in modules from the top left corner. */
  readonly runs: readonly { readonly x: number; readonly y: number; readonly length: number }[];
  /** The code with its quiet zone: where it starts and how wide it is, in the same modules. */
  readonly code: { readonly at: number; readonly size: number };
}

/** Deterministic random numbers in [0, 1), so preview and downloads get the same noise. */
const seededRandom = (seed: string) => {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Share of noise modules that are dark, close to the share in the code itself. */
const NOISE_DENSITY = 0.5;

/**
 * Level-H code as horizontal runs: fewer path segments and no seams between neighbours. With
 * `noise`, random modules fill a band around the quiet zone, square or round; the quiet zone itself
 * stays white, otherwise the code could not be found.
 */
export const qrRuns = (value: string, noise?: QrNoise): QrRuns => {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'H' });
  const codeSize = modules.size + MARGIN * 2;
  const width = noise === undefined ? 0 : Math.max(0, Math.round(noise.width));
  // A circle has to enclose the square quiet zone, so it starts at its corners.
  const radius = (codeSize / 2) * Math.SQRT2 + width;
  const band =
    width === 0 ? 0 : noise?.shape === 'circle' ? Math.ceil(radius - codeSize / 2) : width;
  const size = codeSize + band * 2;
  const centre = size / 2;
  const random = seededRandom(`${value}|${noise?.shape}|${width}`);
  const inCode = (i: number) => i >= band && i < band + codeSize;

  const dark = (row: number, col: number) => {
    if (inCode(row) && inCode(col)) {
      const r = row - band - MARGIN;
      const c = col - band - MARGIN;
      return r >= 0 && c >= 0 && r < modules.size && c < modules.size && Boolean(modules.get(r, c));
    }
    if (noise?.shape === 'circle' && Math.hypot(col + 0.5 - centre, row + 0.5 - centre) > radius)
      return false;
    return random() < NOISE_DENSITY;
  };

  const runs: { x: number; y: number; length: number }[] = [];
  for (let row = 0; row < size; row++) {
    let start = -1;
    for (let col = 0; col <= size; col++) {
      const on = col < size && dark(row, col);
      if (on && start < 0) start = col;
      if (!on && start >= 0) {
        runs.push({ x: start, y: row, length: col - start });
        start = -1;
      }
    }
  }
  return { size, runs, code: { at: band, size: codeSize } };
};

/** Level-H code geometry shared by the React component and the standalone SVG export. */
export const qrGeometry = (value: string, noise?: QrNoise): QrGeometry => {
  const { size, runs } = qrRuns(value, noise);
  const path = runs.map(({ x, y, length }) => `M${x} ${y}h${length}v1h-${length}z`).join('');
  return { size, path };
};

export const escapeAttribute = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Self-contained SVG file of a code. */
export const qrCodeSvg = (value: string, noise?: QrNoise): string => {
  const { size, path } = qrGeometry(value, noise);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges">` +
    `<title>${escapeAttribute(value)}</title>` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
};
