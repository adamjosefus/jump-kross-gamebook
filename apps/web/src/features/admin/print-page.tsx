import type { PrintableCode } from '@gamebook/api';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Download, FileImage, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import logo from '@/assets/qr-logo.svg';
import { EndQr, ProgressQr, TeamLoginQr } from '@/components/qr/qr-cards';
import type { PaperFormat } from '@/components/qr/qr-pdf';
import { qrCodeSvg, toDataUrl } from '@/components/qr/qr-svg';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api';

import { adminKeys } from './queries';

/**
 * Puts the SVG on the clipboard both as an image (pastes into design tools that accept it) and as
 * text (pastes into Figma, Illustrator or a code editor).
 */
const copySvg = async (svg: string) => {
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

const CopySvgButton = ({ entry }: { entry: PrintableCode }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copySvg(qrCodeSvg(entry.code, await toDataUrl(logo)));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Kopírování se nepovedlo. Povolte prohlížeči přístup ke schránce.');
    }
  };
  return (
    <Button variant='outline' size='sm' onClick={() => void copy()}>
      {copied ? <Check /> : <Copy />} {copied ? 'Zkopírováno' : 'Kopírovat SVG'}
    </Button>
  );
};

/** File name like `qr-tym-vlci-T-12.svg` or `qr-tym-vlci-T-12-a4.pdf`: readable, without diacritics, unique per code. */
const fileName = (entry: PrintableCode, extension: string, suffix?: string) => {
  const slug = entry.label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const kind = { T: 'tym', L: 'misto', E: 'cil' }[entry.kind];
  return `qr-${[kind, slug, entry.kind, entry.id, suffix].filter(Boolean).join('-')}.${extension}`;
};

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const DownloadButton = ({ entry }: { entry: PrintableCode }) => {
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch {
      toast.error('Soubor se nepodařilo vytvořit.');
    } finally {
      setBusy(false);
    }
  };
  const downloadSvg = () =>
    run(async () => {
      const svg = qrCodeSvg(entry.code, await toDataUrl(logo));
      saveBlob(new Blob([svg], { type: 'image/svg+xml' }), fileName(entry, 'svg'));
    });
  const downloadPdf = (format: PaperFormat) =>
    run(async () => {
      // pdf-lib and the fonts are loaded only when someone actually asks for a PDF.
      const { qrCardPdf } = await import('@/components/qr/qr-pdf');
      const pdf = await qrCardPdf({
        kind: entry.kind,
        value: entry.code,
        label: entry.label,
        format,
        logo,
      });
      saveBlob(pdf, fileName(entry, 'pdf', format.toLowerCase()));
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' disabled={busy}>
          {busy ? <Loader2 className='animate-spin' /> : <Download />} Stáhnout
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => void downloadSvg()}>
          <FileImage /> SVG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void downloadPdf('A4')}>
          <FileText /> PDF na A4
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void downloadPdf('A5')}>
          <FileText /> PDF na A5
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Every QR code of the game: copy or download each one (SVG, PDF on A4/A5). */
export const PrintPage = () => {
  const codes = useQuery({
    queryKey: adminKeys.codes,
    queryFn: ({ signal }) => api((client) => client.admin.codes(), { signal }),
  });

  if (codes.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (codes.isError) return <p className='p-8 text-destructive'>{errorMessage(codes.error)}</p>;

  return (
    <div className='flex flex-col gap-4 p-6'>
      <div className='flex items-center gap-4'>
        <p className='text-sm text-muted-foreground'>
          {codes.data.length} kódů. Přihlašovací kód týmu patří jen jemu, kód místa platí pro
          všechny týmy.
        </p>
      </div>
      <div className='flex flex-wrap gap-4'>
        {codes.data.map((entry) => (
          <div key={entry.code} className='flex flex-col items-center gap-2'>
            {entry.kind === 'T' ? (
              <TeamLoginQr value={entry.code} teamName={entry.label} logo={logo} />
            ) : entry.kind === 'E' ? (
              <EndQr value={entry.code} locationName={entry.label} logo={logo} />
            ) : (
              <ProgressQr value={entry.code} locationName={entry.label} logo={logo} />
            )}
            <div className='flex gap-2'>
              <CopySvgButton entry={entry} />
              <DownloadButton entry={entry} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
