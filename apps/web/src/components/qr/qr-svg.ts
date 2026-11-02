import QRCode from 'qrcode';

/** Quiet zone around the code, in modules: what the spec asks for, and the default. */
export const QUIET_ZONE = 4;

/** Random modules around the code that make it harder to read by eye; scanners ignore them. */
export type NoiseShape = 'square' | 'circle';

export interface QrNoise {
  readonly shape: NoiseShape;
  /** Width of the band around the quiet zone, in modules. */
  readonly width: number;
}

/** How a code is drawn beyond its modules. */
export interface QrStyle {
  readonly noise?: QrNoise | undefined;
  /** White margin around the code, in modules; `QUIET_ZONE` when omitted. */
  readonly quietZone?: number | undefined;
}

export interface QrGeometry {
  /** Width and height in modules, quiet zone and noise included. */
  readonly size: number;
  /** All dark modules as one path. */
  readonly path: string;
}

/** A horizontal run of dark modules, in modules from the top left corner. */
export interface QrRun {
  readonly column: number;
  readonly row: number;
  readonly length: number;
}

export interface QrRuns {
  /** Width and height in modules, quiet zone and noise included. */
  readonly size: number;
  /** Horizontal runs of dark modules, in modules from the top left corner. */
  readonly runs: readonly QrRun[];
  /** The code with its quiet zone: where it starts and how wide it is, in the same modules. */
  readonly code: { readonly at: number; readonly size: number; readonly quietZone: number };
}

/** Deterministic random numbers in [0, 1), so preview and downloads get the same noise. */
const seededRandom = (seed: string) => {
  // FNV-1a over the UTF-16 code units of the seed.
  const hashed = seed
    .split('')
    .reduce((state, char) => Math.imul(state ^ char.charCodeAt(0), 16777619), 2166136261);
  // The generator carries its state from one number to the next, so it has to be mutable.
  let state = hashed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    const mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    const scrambled = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((scrambled ^ (scrambled >>> 14)) >>> 0) / 4294967296;
  };
};

/** Share of noise modules that are dark, close to the share in the code itself. */
const NOISE_DENSITY = 0.5;

/**
 * Level-H code as horizontal runs: fewer path segments and no seams between neighbours. With
 * `noise`, random modules fill a band around the quiet zone, square or round; the quiet zone itself
 * stays white, otherwise the code could not be found.
 */
export const qrRuns = (value: string, style: QrStyle = {}): QrRuns => {
  const { noise } = style;
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'H' });
  const margin = Math.max(0, Math.round(style.quietZone ?? QUIET_ZONE));
  const codeSize = modules.size + margin * 2;
  const width = noise === undefined ? 0 : Math.max(0, Math.round(noise.width));
  // A circle has to enclose the square quiet zone, so it starts at its corners.
  const radius = (codeSize / 2) * Math.SQRT2 + width;
  const band =
    width === 0 ? 0 : noise?.shape === 'circle' ? Math.ceil(radius - codeSize / 2) : width;
  const size = codeSize + band * 2;
  const centre = size / 2;
  const random = seededRandom(`${value}|${noise?.shape}|${width}|${margin}`);
  const inCode = (position: number) => position >= band && position < band + codeSize;

  const dark = (row: number, column: number) => {
    if (inCode(row) && inCode(column)) {
      const moduleRow = row - band - margin;
      const moduleColumn = column - band - margin;
      return (
        moduleRow >= 0 &&
        moduleColumn >= 0 &&
        moduleRow < modules.size &&
        moduleColumn < modules.size &&
        Boolean(modules.get(moduleRow, moduleColumn))
      );
    }
    if (noise?.shape === 'circle' && Math.hypot(column + 0.5 - centre, row + 0.5 - centre) > radius)
      return false;
    return random() < NOISE_DENSITY;
  };

  const positions = [...Array(size).keys()];
  // Row by row, column by column, so the noise comes out in the same order every time.
  const rowRuns = (row: number): readonly QrRun[] =>
    positions.reduce<readonly QrRun[]>((runs, column) => {
      if (!dark(row, column)) return runs;
      const last = runs.at(-1);
      return last !== undefined && last.column + last.length === column
        ? [...runs.slice(0, -1), { ...last, length: last.length + 1 }]
        : [...runs, { column, row, length: 1 }];
    }, []);
  const runs = positions.flatMap(rowRuns);
  return { size, runs, code: { at: band, size: codeSize, quietZone: margin } };
};

/** Level-H code geometry shared by the React component and the standalone SVG export. */
export const qrGeometry = (value: string, style?: QrStyle): QrGeometry => {
  const { size, runs } = qrRuns(value, style);
  const path = runs
    .map(({ column, row, length }) => `M${column} ${row}h${length}v1h-${length}z`)
    .join('');
  return { size, path };
};

export const escapeAttribute = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Self-contained SVG file of a code. */
export const qrCodeSvg = (value: string, style?: QrStyle): string => {
  const { size, path } = qrGeometry(value, style);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges">` +
    `<title>${escapeAttribute(value)}</title>` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
};
