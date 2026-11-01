import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, PageSizes, rgb } from 'pdf-lib';

import geistRegularUrl from '@/assets/fonts/Geist-Regular.ttf?url';
import geistSemiBoldUrl from '@/assets/fonts/Geist-SemiBold.ttf?url';
import geistMonoUrl from '@/assets/fonts/GeistMono-Regular.ttf?url';

import { type QrCardKind, qrCardText } from './qr-card-text';
import { DEFAULT_LOGO_SCALE, qrGeometry } from './qr-svg';

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
  /** PNG of the logo placed in the middle of the code. */
  readonly logoPng?: Uint8Array | undefined;
}

const black = rgb(0, 0, 0);
const white = rgb(1, 1, 1);
const grey = rgb(0.4, 0.4, 0.4);

/** Points per millimetre. */
const MM = 72 / 25.4;

/** Splits text into lines no wider than `maxWidth`; a single over-long word stays on its own line. */
const wrap = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (line !== '' && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
};

/** Rounded rectangle as an SVG path with its top-left corner at the origin (y pointing down). */
const roundedRect = (width: number, height: number, r: number) =>
  `M${r} 0H${width - r}A${r} ${r} 0 0 1 ${width} ${r}V${height - r}` +
  `A${r} ${r} 0 0 1 ${width - r} ${height}H${r}A${r} ${r} 0 0 1 0 ${height - r}` +
  `V${r}A${r} ${r} 0 0 1 ${r} 0Z`;

/**
 * One card per page, laid out like the on-screen card: label on top, the code as large as the page
 * allows, hint and code text at the bottom. Everything is vector except the logo.
 */
export const buildQrCardPdf = async ({
  kind,
  value,
  label,
  format,
  fonts,
  logoPng,
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
  const s = width / PageSizes.A4[0];
  const margin = 12 * MM * s;
  const padding = 12 * MM * s;
  const cardWidth = width - margin * 2;
  const cardHeight = height - margin * 2;
  const contentWidth = cardWidth - padding * 2;
  const left = margin + padding;

  page.drawSvgPath(roundedRect(cardWidth, cardHeight, 8 * MM * s), {
    x: margin,
    y: height - margin,
    borderColor: black,
    borderWidth: 2 * s,
    color: white,
  });

  // Header from the top down.
  let cursor = height - margin - padding;
  const eyebrowSize = 13 * s;
  const tracking = eyebrowSize * 0.12;
  cursor -= eyebrowSize;
  let x = left;
  for (const char of text.eyebrow.toLocaleUpperCase('cs')) {
    page.drawText(char, { x, y: cursor, size: eyebrowSize, font: semiBold, color: black });
    x += semiBold.widthOfTextAtSize(char, eyebrowSize) + tracking;
  }
  if (text.title !== undefined) {
    const titleSize = 44 * s;
    cursor -= 8 * s;
    for (const line of wrap(text.title, semiBold, titleSize, contentWidth)) {
      cursor -= titleSize;
      page.drawText(line, { x: left, y: cursor, size: titleSize, font: semiBold, color: black });
      cursor -= titleSize * 0.15;
    }
  }
  const headerBottom = cursor - 6 * MM * s;

  // Footer from the bottom up: hint on the left, code value on the right.
  const hintSize = 13 * s;
  const codeSize = 11 * s;
  const codeWidth = mono.widthOfTextAtSize(value, codeSize);
  const hintLines = wrap(text.hint, regular, hintSize, contentWidth - codeWidth - 6 * MM * s);
  let footer = margin + padding;
  page.drawText(value, {
    x: left + contentWidth - codeWidth,
    y: footer,
    size: codeSize,
    font: mono,
    color: grey,
  });
  for (const line of hintLines.toReversed()) {
    page.drawText(line, { x: left, y: footer, size: hintSize, font: regular, color: black });
    footer += hintSize * 1.3;
  }
  const footerTop = footer + 6 * MM * s - hintSize * 0.3;

  // The code fills the space between, centred. Its quiet zone is part of the geometry.
  const geometry = qrGeometry(value, DEFAULT_LOGO_SCALE);
  const qrSide = Math.min(contentWidth, headerBottom - footerTop);
  const module = qrSide / geometry.size;
  const qrLeft = left + (contentWidth - qrSide) / 2;
  const qrTop = footerTop + (headerBottom - footerTop + qrSide) / 2;
  page.drawSvgPath(geometry.path, { x: qrLeft, y: qrTop, scale: module, color: black });

  if (logoPng !== undefined) {
    const { at, size, pad } = geometry.logo;
    const frame = (size + pad * 2) * module;
    page.drawSvgPath(roundedRect(frame, frame, module), {
      x: qrLeft + (at - pad) * module,
      y: qrTop - (at - pad) * module,
      color: white,
    });
    const image = await pdf.embedPng(logoPng);
    page.drawImage(image, {
      x: qrLeft + at * module,
      y: qrTop - (at + size) * module,
      width: size * module,
      height: size * module,
    });
  }

  return pdf.save();
};

const fetchBuffer = async (url: string) => (await fetch(url)).arrayBuffer();

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

/** Rasterises an image URL (SVG included) into a square PNG for embedding. */
const rasterize = async (url: string, pixels = 1024): Promise<Uint8Array> => {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Prohlížeč nepodporuje canvas.');
  context.drawImage(image, 0, 0, pixels, pixels);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Logo se nepodařilo převést.'))),
      'image/png',
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
};

/** Builds the PDF in the browser, loading the fonts and the logo on first use. */
export const qrCardPdf = async (
  input: Omit<QrPdfInput, 'fonts' | 'logoPng'> & { readonly logo?: string | undefined },
): Promise<Blob> => {
  const [fonts, logoPng] = await Promise.all([
    loadFonts(),
    input.logo === undefined ? undefined : rasterize(input.logo),
  ]);
  const bytes = await buildQrCardPdf({ ...input, fonts, logoPng });
  return new Blob([bytes.slice()], { type: 'application/pdf' });
};
