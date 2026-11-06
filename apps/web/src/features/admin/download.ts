import type { PrintableCode } from '@gamebook/api';

/** File name like `qr-tym-vlci-T-12.svg`: readable, without diacritics, unique per code. */
export const fileName = (entry: PrintableCode, extension: string, suffix?: string) => {
  const slug = entry.label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const kind = ({ T: 'tym', L: 'misto' } as const)[entry.kind];
  return `qr-${[kind, slug, entry.kind, entry.id, suffix].filter(Boolean).join('-')}.${extension}`;
};

export const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  // The anchor is a DOM element; its attributes are set in place as the DOM API requires.
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Puts the SVG on the clipboard both as an image (pastes into design tools that accept it) and as
 * text (pastes into Figma, Illustrator or a code editor).
 */
export const copySvg = async (svg: string) => {
  const text = new Blob([svg], { type: 'text/plain' });
  const image = new Blob([svg], { type: 'image/svg+xml' });
  if (typeof ClipboardItem !== 'undefined' && ClipboardItem.supports?.('image/svg+xml')) {
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/plain': text, 'image/svg+xml': image }),
    ]);
  } else {
    await navigator.clipboard.writeText(svg);
  }
};
