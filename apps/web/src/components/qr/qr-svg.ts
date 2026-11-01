import QRCode from 'qrcode';

/** Quiet zone around the code, in modules (the spec asks for 4). */
export const QUIET_ZONE = 4;
const MARGIN = QUIET_ZONE;
/** White frame around the logo, in modules. */
const LOGO_PAD = 0.8;

export const DEFAULT_LOGO_SCALE = 0.22;

export interface QrGeometry {
  /** Width and height in modules, quiet zone included. */
  readonly size: number;
  /** All dark modules as one path. */
  readonly path: string;
  readonly logo: { readonly at: number; readonly size: number; readonly pad: number };
}

export interface QrRuns {
  /** Width and height in modules, quiet zone included. */
  readonly size: number;
  /** Horizontal runs of dark modules, in modules from the top left corner of the quiet zone. */
  readonly runs: readonly { readonly x: number; readonly y: number; readonly length: number }[];
}

/** Level-H code as horizontal runs: fewer path segments and no seams between neighbours. */
export const qrRuns = (value: string): QrRuns => {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'H' });
  const runs: { x: number; y: number; length: number }[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      const start = col;
      while (col + 1 < modules.size && modules.get(row, col + 1)) col++;
      runs.push({ x: start + MARGIN, y: row + MARGIN, length: col - start + 1 });
    }
  }
  return { size: modules.size + MARGIN * 2, runs };
};

/** Level-H code geometry shared by the React component and the standalone SVG export. */
export const qrGeometry = (value: string, logoScale = DEFAULT_LOGO_SCALE): QrGeometry => {
  const { size, runs } = qrRuns(value);
  const path = runs.map(({ x, y, length }) => `M${x} ${y}h${length}v1h-${length}z`).join('');
  const logoSize = (size - MARGIN * 2) * logoScale;
  return { size, path, logo: { at: (size - logoSize) / 2, size: logoSize, pad: LOGO_PAD } };
};

export const escapeAttribute = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Self-contained SVG file of a code. The logo must be a data URL so the SVG still shows it after
 * being pasted into another application.
 */
export const qrCodeSvg = (
  value: string,
  logoDataUrl?: string,
  logoScale = DEFAULT_LOGO_SCALE,
): string => {
  const { size, path, logo } = qrGeometry(value, logoScale);
  const logoMarkup =
    logoDataUrl === undefined
      ? ''
      : `<rect x="${logo.at - logo.pad}" y="${logo.at - logo.pad}" width="${logo.size + logo.pad * 2}" height="${logo.size + logo.pad * 2}" rx="1" fill="#fff"/>` +
        `<image href="${escapeAttribute(logoDataUrl)}" x="${logo.at}" y="${logo.at}" width="${logo.size}" height="${logo.size}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges">` +
    `<title>${escapeAttribute(value)}</title>` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/>${logoMarkup}</svg>`
  );
};

/** Fetches an asset URL and turns it into a data URL for embedding. */
export const toDataUrl = async (url: string): Promise<string> => {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new TypeError('FileReader nevrátil data URL.')),
    );
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
};
