import { outlinePath, qrOutlines } from './qr-outline';
import {
  backgroundRect,
  escapeAttribute,
  type QrStyle,
  type QrSvgOptions,
  QUIET_ZONE,
  qrRuns,
} from './qr-svg';

/** Edge of the printed sheet the viewer stands at. */
export type ViewerSide = 'bottom' | 'top' | 'left' | 'right';

/**
 * Where the code is seen from, and whether the code is mirrored. The print is stretched so that
 * from this spot it looks like an ordinary square code (anamorphosis), e.g. a code on the floor
 * read by someone standing. Mirroring is applied to the code before it is stretched, e.g. for glass
 * or film read from the back, so it never changes which side the viewer stands at.
 */
export interface Anamorphosis {
  readonly side: ViewerSide;
  /** Between the line of sight and the perpendicular to the sheet, in degrees; 0 is head-on. */
  readonly angle: number;
  /** From the eye to the centre of the code, in multiples of the code's printed width there. */
  readonly distance: number;
  /** Left and right swapped. */
  readonly mirrorX: boolean;
  /** Top and bottom swapped. */
  readonly mirrorY: boolean;
}

export const DEFAULT_ANAMORPHOSIS: Anamorphosis = {
  side: 'bottom',
  angle: 70,
  distance: 6,
  mirrorX: false,
  mirrorY: false,
};

export const MAX_ANGLE = 80;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The closest distance at which the far edge of the code is still in front of the viewer's eye
 * (closer than that, the stretched print would have to be infinitely long). Used with a margin.
 */
export const minDistance = (angle: number, extent = 1) => (Math.tan(radians(angle)) * extent) / 2;

/**
 * `minDistance` with room to spare, so the print stays a sensible shape. `extent` is the printed
 * width (noise included) in code widths; the noise reaches further away than the code.
 */
export const safeDistance = (angle: number, extent = 1) =>
  Math.max(1, Math.ceil(minDistance(angle, extent) * 1.5 * 2) / 2);

/**
 * The code width every distance is measured in: the modules with the standard quiet zone, so a
 * narrower margin does not change the geometry of the code itself.
 */
const codeUnit = (code: { readonly size: number; readonly quietZone: number }) =>
  code.size - code.quietZone * 2 + QUIET_ZONE * 2;

/** Printed width with noise in code widths, for `safeDistance`. */
export const qrExtent = (value: string, style?: QrStyle) => {
  const { size, code } = qrRuns(value, style);
  return size / codeUnit(code);
};

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
  return ([pointX, pointY]: Point): Point => {
    const depth = distance * cos - pointY * sin;
    return [(distance * cos * pointX) / depth, (distance * pointY) / depth];
  };
};

interface Frame {
  readonly to: (point: Point) => Point;
  readonly back: (point: Point) => Point;
}

/** Rotations into the frame of a viewer at the bottom edge and back. */
const FRAMES: Readonly<Record<ViewerSide, Frame>> = {
  bottom: { to: (point) => point, back: (point) => point },
  top: {
    to: ([pointX, pointY]) => [-pointX, -pointY],
    back: ([pointX, pointY]) => [-pointX, -pointY],
  },
  left: {
    to: ([pointX, pointY]) => [-pointY, pointX],
    back: ([pointX, pointY]) => [pointY, -pointX],
  },
  right: {
    to: ([pointX, pointY]) => [pointY, -pointX],
    back: ([pointX, pointY]) => [-pointY, pointX],
  },
};

export interface WarpedQr {
  /** Width and height of the print, in modules of the code's printed width through its centre. */
  readonly width: number;
  readonly height: number;
  /**
   * Outlines of the dark shapes, the top left corner of the print at the origin. The stretch keeps
   * straight lines straight, so the corners of the outlines are enough.
   */
  readonly path: string;
  /** Printed width of the code through its centre, in the same units: the distance's unit. */
  readonly codeWidth: number;
  /** Where the centre of the code lands on the print; the viewer looks at this point. */
  readonly centre: Point;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The code mirrored, then stretched so that it looks square from the given spot. Mirroring comes
 * first, so it flips the code but never the side the viewer stands at.
 */
export const warpedQr = (
  value: string,
  { side, angle, distance, mirrorX, mirrorY }: Anamorphosis,
  style?: QrStyle,
): WarpedQr => {
  const { size, runs, code: codeArea } = qrRuns(value, style);
  // Distances are in code widths, so noise and margin around the code do not change how it is seen.
  const unit = codeUnit(codeArea);
  const frame = FRAMES[side];
  const project = fromBottom(Math.min(Math.max(angle, 0), MAX_ANGLE), distance);
  // Module coordinates (y down, origin top left) to the sheet, in modules (y down), mirrored first.
  const map = (column: number, row: number): Point => {
    const mirroredColumn = mirrorX ? size - column : column;
    const mirroredRow = mirrorY ? size - row : row;
    const [sheetX, sheetY] = frame.back(
      project(frame.to([(mirroredColumn - size / 2) / unit, (size / 2 - mirroredRow) / unit])),
    );
    return [sheetX * unit, -sheetY * unit];
  };
  const box = (from: number, to: number) => {
    const corners = [map(from, from), map(to, from), map(to, to), map(from, to)];
    const xs = corners.map(([cornerX]) => cornerX);
    const ys = corners.map(([, cornerY]) => cornerY);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  };
  // The far side of the quiet zone stretches more than the near one, so the dark modules would sit
  // off centre. The quiet zone is widened on the short sides until the modules are centred; it never
  // gets narrower than the projected one.
  const zone = box(0, size);
  const code = box(
    codeArea.at + codeArea.quietZone,
    codeArea.at + codeArea.size - codeArea.quietZone,
  );
  const centreX = (code.left + code.right) / 2;
  const centreY = (code.top + code.bottom) / 2;
  const halfWidth = Math.max(centreX - zone.left, zone.right - centreX);
  const halfHeight = Math.max(centreY - zone.top, zone.bottom - centreY);
  const left = centreX - halfWidth;
  const right = centreX + halfWidth;
  const top = centreY - halfHeight;
  const bottom = centreY + halfHeight;
  const place = ([pointX, pointY]: Point): Point => [pointX - left, pointY - top];
  const point = (sheetPoint: Point) => {
    const [placedX, placedY] = place(sheetPoint);
    return `${round(placedX)} ${round(placedY)}`;
  };
  const path = outlinePath(qrOutlines(size, runs), ([column, row]) => point(map(column, row)));
  return {
    width: right - left,
    height: bottom - top,
    path,
    codeWidth: unit,
    centre: place(map(size / 2, size / 2)),
  };
};

const SIDE_TEXT: Readonly<Record<ViewerSide, string>> = {
  bottom: 'spodního',
  top: 'horního',
  left: 'levého',
  right: 'pravého',
};

const length = (cm: number) =>
  cm < 100 ? `${Math.round(cm)} cm` : `${(cm / 100).toFixed(1).replace('.', ',')} m`;

const mirrorHint = (mirrorX: boolean, mirrorY: boolean) =>
  mirrorX && mirrorY
    ? ' Kód je převrácený v obou osách, tedy otočený o 180°; čte se normálně.'
    : mirrorX || mirrorY
      ? ` Kód je zrcadlově převrácený ${mirrorX ? 'vodorovně' : 'svisle'}: čte se zezadu přes průhledný materiál nebo v zrcadle.`
      : '';

/** Where the viewer has to be and how the print is mirrored, for the organisers placing it. */
export const viewerHint = (
  { side, angle, distance, mirrorX, mirrorY }: Anamorphosis,
  codeWidthCm?: number,
) =>
  (angle === 0
    ? 'Kód není zkreslený, čte se zpředu.'
    : `Divák stojí u ${SIDE_TEXT[side]} okraje a dívá se pod úhlem ${angle}° od kolmice` +
      (codeWidthCm === undefined
        ? `, oko má ${String(distance).replace('.', ',')}× šířku kódu od jeho středu.`
        : `, oko má asi ${length(distance * codeWidthCm)} od středu kódu.`)) +
  mirrorHint(mirrorX, mirrorY);

/** Self-contained SVG file of the mirrored and stretched code. */
export const warpedQrSvg = (
  value: string,
  anamorphosis: Anamorphosis,
  style?: QrStyle,
  options: QrSvgOptions = {},
): string => {
  const { width, height, path } = warpedQr(value, anamorphosis, style);
  const viewWidth = round(width);
  const viewHeight = round(height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" width="${round(viewWidth * 10)}" height="${round(viewHeight * 10)}">` +
    `<title>${escapeAttribute(`${value} – ${viewerHint(anamorphosis)}`)}</title>` +
    `${backgroundRect(viewWidth, viewHeight, options)}<path d="${path}" fill="#000"/></svg>`
  );
};
