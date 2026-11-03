import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, PageSizes, rgb } from 'pdf-lib';

import geistRegularUrl from '@/assets/fonts/Geist-Regular.ttf?url';
import geistSemiBoldUrl from '@/assets/fonts/Geist-SemiBold.ttf?url';
import geistMonoUrl from '@/assets/fonts/GeistMono-Regular.ttf?url';

import { type QrCardKind, qrCardText } from './qr-card-text';
import { type QrStyle, qrGeometry } from './qr-svg';
import { type Anamorphosis, viewerHint, warpedQr } from './qr-warp';

export type PaperFormat = 'A4' | 'A5';

export interface QrPdfFonts {
  readonly regular: ArrayBuffer;
  readonly semiBold: ArrayBuffer;
  readonly mono: ArrayBuffer;
}

export interface QrPdfInput {
  readonly kind: QrCardKind;
  readonly value: string;
  readonly label?: string | undefined;
  readonly format: PaperFormat;
  readonly fonts: QrPdfFonts;
  /** Noise around the code and the width of its white margin. */
  readonly style?: QrStyle | undefined;
}

const black = rgb(0, 0, 0);
const white = rgb(1, 1, 1);
const grey = rgb(0.4, 0.4, 0.4);

/** Points per millimetre. */
const MM = 72 / 25.4;

/** Splits text into lines no wider than `maxWidth`; a single over-long word stays on its own line. */
const wrap = (text: string, font: PDFFont, size: number, maxWidth: number): readonly string[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .reduce<readonly string[]>((lines, word) => {
      const current = lines.at(-1);
      if (current === undefined) return [word];
      const candidate = `${current} ${word}`;
      return font.widthOfTextAtSize(candidate, size) > maxWidth
        ? [...lines, word]
        : [...lines.slice(0, -1), candidate];
    }, []);

/** Rounded rectangle as an SVG path with its top-left corner at the origin (y pointing down). */
const roundedRect = (width: number, height: number, radius: number) =>
  `M${radius} 0H${width - radius}A${radius} ${radius} 0 0 1 ${width} ${radius}V${height - radius}` +
  `A${radius} ${radius} 0 0 1 ${width - radius} ${height}H${radius}A${radius} ${radius} 0 0 1 0 ${height - radius}` +
  `V${radius}A${radius} ${radius} 0 0 1 ${radius} 0Z`;

/**
 * One card per page, laid out like the on-screen card: label on top, the code as large as the page
 * allows, hint and code text at the bottom. Everything is vector.
 */
export const buildQrCardPdf = async ({
  kind,
  value,
  label,
  format,
  fonts,
  style,
}: QrPdfInput): Promise<Uint8Array> => {
  const text = qrCardText(kind, label);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${text.title ?? text.eyebrow} – QR ${value}`);
  pdf.setCreator('JUMP Kross 2027');
  const [regular, semiBold, mono] = await Promise.all([
    pdf.embedFont(fonts.regular, { subset: true }),
    pdf.embedFont(fonts.semiBold, { subset: true }),
    pdf.embedFont(fonts.mono, { subset: true }),
  ]);

  const [width, height] = format === 'A4' ? PageSizes.A4 : PageSizes.A5;
  const page = pdf.addPage([width, height]);
  // Everything scales with the paper so A5 is a shrunken A4.
  const paperScale = width / PageSizes.A4[0];
  const margin = 12 * MM * paperScale;
  const padding = 12 * MM * paperScale;
  const cardWidth = width - margin * 2;
  const cardHeight = height - margin * 2;
  const contentWidth = cardWidth - padding * 2;
  const left = margin + padding;

  page.drawSvgPath(roundedRect(cardWidth, cardHeight, 8 * MM * paperScale), {
    x: margin,
    y: height - margin,
    borderColor: black,
    borderWidth: 2 * paperScale,
    color: white,
  });

  // Header from the top down: the eyebrow letter by letter, so it can be tracked out.
  const eyebrowSize = 13 * paperScale;
  const tracking = eyebrowSize * 0.12;
  const eyebrowBaseline = height - margin - padding - eyebrowSize;
  // By code points, as `for … of` over the string would go.
  const letters = Array.from(text.eyebrow.toLocaleUpperCase('cs'));
  // Each letter starts where the one before it ended, plus the tracking.
  const letterStarts = letters.reduce<readonly number[]>(
    (starts, letter) => [
      ...starts,
      starts.at(-1)! + semiBold.widthOfTextAtSize(letter, eyebrowSize) + tracking,
    ],
    [left],
  );
  letters.forEach((letter, index) => {
    page.drawText(letter, {
      x: letterStarts[index]!,
      y: eyebrowBaseline,
      size: eyebrowSize,
      font: semiBold,
      color: black,
    });
  });
  const titleSize = 44 * paperScale;
  const titleStep = titleSize * 1.15;
  const titleTop = eyebrowBaseline - 8 * paperScale;
  const titleLines =
    text.title === undefined ? [] : wrap(text.title, semiBold, titleSize, contentWidth);
  titleLines.forEach((line, index) => {
    page.drawText(line, {
      x: left,
      y: titleTop - titleSize - index * titleStep,
      size: titleSize,
      font: semiBold,
      color: black,
    });
  });
  const headerBottom =
    (text.title === undefined ? eyebrowBaseline : titleTop - titleLines.length * titleStep) -
    6 * MM * paperScale;

  // Footer from the bottom up: hint on the left, code value on the right.
  const hintSize = 13 * paperScale;
  const hintStep = hintSize * 1.3;
  const codeSize = 11 * paperScale;
  const codeWidth = mono.widthOfTextAtSize(value, codeSize);
  const hintLines = wrap(
    text.hint,
    regular,
    hintSize,
    contentWidth - codeWidth - 6 * MM * paperScale,
  );
  const bottom = margin + padding;
  page.drawText(value, {
    x: left + contentWidth - codeWidth,
    y: bottom,
    size: codeSize,
    font: mono,
    color: grey,
  });
  hintLines.toReversed().forEach((line, index) => {
    page.drawText(line, {
      x: left,
      y: bottom + index * hintStep,
      size: hintSize,
      font: regular,
      color: black,
    });
  });
  const footerTop = bottom + hintLines.length * hintStep + 6 * MM * paperScale - hintSize * 0.3;

  // The code fills the space between, centred. Its quiet zone is part of the geometry.
  const geometry = qrGeometry(value, style);
  const qrSide = Math.min(contentWidth, headerBottom - footerTop);
  const module = qrSide / geometry.size;
  const qrLeft = left + (contentWidth - qrSide) / 2;
  const qrTop = footerTop + (headerBottom - footerTop + qrSide) / 2;
  page.drawSvgPath(geometry.path, { x: qrLeft, y: qrTop, scale: module, color: black });

  return pdf.save();
};

export interface WarpedQrPdfInput extends QrPdfInput {
  readonly anamorphosis: Anamorphosis;
}

/**
 * The stretched code as large as the page allows, with a short note below it for whoever puts it
 * up: what the code is and where the viewer has to stand. The note itself is not stretched.
 */
export const buildWarpedQrPdf = async ({
  kind,
  value,
  label,
  format,
  fonts,
  anamorphosis,
  style,
}: WarpedQrPdfInput): Promise<Uint8Array> => {
  const text = qrCardText(kind, label);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${text.title ?? text.eyebrow} – QR ${value} upravený pro tisk`);
  pdf.setCreator('JUMP Kross 2027');
  const [regular, semiBold, mono] = await Promise.all([
    pdf.embedFont(fonts.regular, { subset: true }),
    pdf.embedFont(fonts.semiBold, { subset: true }),
    pdf.embedFont(fonts.mono, { subset: true }),
  ]);

  const [width, height] = format === 'A4' ? PageSizes.A4 : PageSizes.A5;
  const page = pdf.addPage([width, height]);
  const paperScale = width / PageSizes.A4[0];
  const margin = 10 * MM * paperScale;
  const contentWidth = width - margin * 2;
  const noteSize = 10 * paperScale;
  const lineHeight = noteSize * 1.35;
  const warped = warpedQr(value, anamorphosis, style);

  // Note from the bottom up. Its length depends on the code's printed width, which depends on
  // how much room the note leaves, so lay it out for the longest wording first.
  const title = [text.title, text.eyebrow].filter(Boolean).join(' · ');
  // The code value sits at the right of the note, so the note wraps before it.
  const codeText = mono.widthOfTextAtSize(value, noteSize);
  const noteWidth = contentWidth - codeText - 4 * MM * paperScale;
  const noteLines = (codeWidthCm: number) =>
    wrap(viewerHint(anamorphosis, codeWidthCm), regular, noteSize, noteWidth);
  const noteHeight = (lines: number) => lineHeight * (lines + 1) + 4 * MM * paperScale;
  const reserved = noteHeight(noteLines(999).length);
  const box = { width: contentWidth, height: height - margin * 2 - reserved };
  const scale = Math.min(box.width / warped.width, box.height / warped.height);
  const codeWidthCm = (warped.codeWidth * scale) / MM / 10;
  const lines = noteLines(codeWidthCm);

  page.drawText(value, {
    x: width - margin - codeText,
    y: margin,
    size: noteSize,
    font: mono,
    color: grey,
  });
  lines.toReversed().forEach((line, index) => {
    page.drawText(line, {
      x: margin,
      y: margin + index * lineHeight,
      size: noteSize,
      font: regular,
      color: black,
    });
  });
  page.drawText(title.toLocaleUpperCase('cs'), {
    x: margin,
    y: margin + lines.length * lineHeight,
    size: noteSize,
    font: semiBold,
    color: black,
  });

  // The code centred in the space above the note.
  const qrLeft = margin + (box.width - warped.width * scale) / 2;
  const qrTop = height - margin - (box.height - warped.height * scale) / 2;
  page.drawSvgPath(warped.path, { x: qrLeft, y: qrTop, scale, color: black });

  return pdf.save();
};

const fetchBuffer = async (url: string) => (await fetch(url)).arrayBuffer();

// The fonts are fetched once per page and the download is forgotten when it fails, so the next
// export can try again: a module-level cache that has to be reassigned.
let fontsPromise: Promise<QrPdfFonts> | undefined;
const loadFonts = () =>
  (fontsPromise ??= Promise.all([
    fetchBuffer(geistRegularUrl),
    fetchBuffer(geistSemiBoldUrl),
    fetchBuffer(geistMonoUrl),
  ]).then(
    ([regular, semiBold, mono]) => ({ regular, semiBold, mono }),
    (error: unknown) => {
      fontsPromise = undefined;
      throw error;
    },
  ));

/** Builds the stretched PDF in the browser, loading the fonts on first use. */
export const warpedQrPdf = async (input: Omit<WarpedQrPdfInput, 'fonts'>): Promise<Blob> => {
  const bytes = await buildWarpedQrPdf({ ...input, fonts: await loadFonts() });
  return new Blob([bytes.slice()], { type: 'application/pdf' });
};

/** Builds the PDF in the browser, loading the fonts on first use. */
export const qrCardPdf = async (input: Omit<QrPdfInput, 'fonts'>): Promise<Blob> => {
  const bytes = await buildQrCardPdf({ ...input, fonts: await loadFonts() });
  return new Blob([bytes.slice()], { type: 'application/pdf' });
};
