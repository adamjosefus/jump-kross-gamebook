import QRCode from 'qrcode';

/** Quiet zone around the code, in modules (the spec asks for 4). */
export const QUIET_ZONE = 4;
const MARGIN = QUIET_ZONE;
export interface QrGeometry {
  /** Width and height in modules, quiet zone included. */
  readonly size: number;
  /** All dark modules as one path. */
  readonly path: string;
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
export const qrGeometry = (value: string): QrGeometry => {
  const { size, runs } = qrRuns(value);
  const path = runs.map(({ x, y, length }) => `M${x} ${y}h${length}v1h-${length}z`).join('');
  return { size, path };
};

export const escapeAttribute = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Self-contained SVG file of a code. */
export const qrCodeSvg = (value: string): string => {
  const { size, path } = qrGeometry(value);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges">` +
    `<title>${escapeAttribute(value)}</title>` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
};
