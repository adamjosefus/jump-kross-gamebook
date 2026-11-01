import { escapeAttribute, qrRuns } from './qr-svg';

/** Edge of the printed sheet the viewer stands at. */
export type ViewerSide = 'bottom' | 'top' | 'left' | 'right';

/**
 * Where the code is seen from. The print is stretched so that from this spot it looks like an
 * ordinary square code (anamorphosis), e.g. a code on the floor read by someone standing.
 */
export interface Anamorphosis {
  readonly side: ViewerSide;
  /** Between the line of sight and the perpendicular to the sheet, in degrees; 0 is head-on. */
  readonly angle: number;
  /** From the eye to the centre of the code, in multiples of the code's printed width there. */
  readonly distance: number;
}

export const DEFAULT_ANAMORPHOSIS: Anamorphosis = { side: 'bottom', angle: 60, distance: 6 };

export const MAX_ANGLE = 80;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The closest distance at which the far edge of the code is still in front of the viewer's eye
 * (closer than that, the stretched print would have to be infinitely long). Used with a margin.
 */
export const minDistance = (angle: number) => Math.tan(radians(angle)) / 2;

/** `minDistance` with room to spare, so the print stays a sensible shape. */
export const safeDistance = (angle: number) =>
  Math.max(1, Math.ceil(minDistance(angle) * 1.5 * 2) / 2);

export type Point = readonly [number, number];

/**
 * Maps a point of the square the viewer should see to the point on the sheet, both with the centre
 * at the origin, x to the right and y up, in multiples of the code width.
 *
 * The viewer stands at the bottom edge. The eye sits `distance` from the centre at `angle` from the
 * perpendicular; the wanted square stands upright to the line of sight, and the ray from the eye
 * through each of its points hits the sheet where that point has to be printed. Through the
 * centre the print stays exactly one code wide; towards the far edge it widens and stretches.
 */
const fromBottom = (angle: number, distance: number) => {
  const theta = radians(angle);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return ([a, b]: Point): Point => {
    const depth = distance * cos - b * sin;
    return [(distance * cos * a) / depth, (distance * b) / depth];
  };
};

/** Rotations into the frame of a viewer at the bottom edge and back. */
const FRAMES: Record<ViewerSide, { to: (p: Point) => Point; back: (p: Point) => Point }> = {
  bottom: { to: (p) => p, back: (p) => p },
  top: { to: ([a, b]) => [-a, -b], back: ([a, b]) => [-a, -b] },
  left: { to: ([a, b]) => [-b, a], back: ([a, b]) => [b, -a] },
  right: { to: ([a, b]) => [b, -a], back: ([a, b]) => [-b, a] },
};

export interface WarpedQr {
  /** Width and height of the print, in modules of the code's printed width through its centre. */
  readonly width: number;
  readonly height: number;
  /** Dark modules as quadrilaterals, the top left corner of the print at the origin. */
  readonly path: string;
  /** Printed width of the code through its centre, in the same units: the distance's unit. */
  readonly codeWidth: number;
  /** Where the centre of the code lands on the print; the viewer looks at this point. */
  readonly centre: Point;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The code stretched so that it looks square from the given spot. Without the logo, which could not be warped. */
export const warpedQr = (value: string, { side, angle, distance }: Anamorphosis): WarpedQr => {
  const { size, runs } = qrRuns(value);
  const frame = FRAMES[side];
  const project = fromBottom(Math.min(Math.max(angle, 0), MAX_ANGLE), distance);
  // Module coordinates (y down, origin top left) to the sheet, in modules (y down).
  const map = (x: number, y: number): Point => {
    const [a, b] = frame.back(project(frame.to([x / size - 0.5, 0.5 - y / size])));
    return [a * size, -b * size];
  };
  const corners = [map(0, 0), map(size, 0), map(size, size), map(0, size)];
  const left = Math.min(...corners.map(([x]) => x));
  const top = Math.min(...corners.map(([, y]) => y));
  const right = Math.max(...corners.map(([x]) => x));
  const bottom = Math.max(...corners.map(([, y]) => y));
  const point = ([x, y]: Point) => `${round(x - left)} ${round(y - top)}`;
  const path = runs
    .map(
      ({ x, y, length }) =>
        `M${point(map(x, y))}L${point(map(x + length, y))}L${point(map(x + length, y + 1))}L${point(map(x, y + 1))}Z`,
    )
    .join('');
  const [cx, cy] = map(size / 2, size / 2);
  return {
    width: right - left,
    height: bottom - top,
    path,
    codeWidth: size,
    centre: [cx - left, cy - top],
  };
};

const SIDE_TEXT: Record<ViewerSide, string> = {
  bottom: 'spodního',
  top: 'horního',
  left: 'levého',
  right: 'pravého',
};

const length = (cm: number) =>
  cm < 100 ? `${Math.round(cm)} cm` : `${(cm / 100).toFixed(1).replace('.', ',')} m`;

/** Where the viewer has to be, for the organisers placing the print. */
export const viewerHint = ({ side, angle, distance }: Anamorphosis, codeWidthCm?: number) =>
  `Divák stojí u ${SIDE_TEXT[side]} okraje a dívá se pod úhlem ${angle}° od kolmice` +
  (codeWidthCm === undefined
    ? `, oko má ${String(distance).replace('.', ',')}× šířku kódu od jeho středu.`
    : `, oko má asi ${length(distance * codeWidthCm)} od středu kódu.`);

/** Self-contained SVG file of the stretched code. */
export const warpedQrSvg = (value: string, anamorphosis: Anamorphosis): string => {
  const { width, height, path } = warpedQr(value, anamorphosis);
  const w = round(width);
  const h = round(height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${round(w * 10)}" height="${round(h * 10)}">` +
    `<title>${escapeAttribute(`${value} – ${viewerHint(anamorphosis)}`)}</title>` +
    `<rect width="${w}" height="${h}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
};
