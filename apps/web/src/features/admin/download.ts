import type { PrintableCode } from '@gamebook/api';

/** File name like `qr-tym-vlci-T-12.svg` or `qr-tym-vlci-T-12-a4.pdf`: readable, without diacritics, unique per code. */
export const fileName = (entry: PrintableCode, extension: string, suffix?: string) => {
  const slug = entry.label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const kind = { T: 'tym', L: 'misto', E: 'cil' }[entry.kind];
  return `qr-${[kind, slug, entry.kind, entry.id, suffix].filter(Boolean).join('-')}.${extension}`;
};

export const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
