import type { PrintableCode } from '@gamebook/api';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Loader2, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import logo from '@/assets/qr-logo.svg';
import { EndQr, ProgressQr, TeamLoginQr } from '@/components/qr/qr-cards';
import { qrCodeSvg, toDataUrl } from '@/components/qr/qr-svg';
import { Button } from '@/components/ui/button';
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
    <Button variant='outline' size='sm' onClick={() => void copy()} className='print:hidden'>
      {copied ? <Check /> : <Copy />} {copied ? 'Zkopírováno' : 'Kopírovat SVG'}
    </Button>
  );
};

/** Every QR code of the game: copy each one as SVG, or print them all on A4. */
export const PrintPage = () => {
  const codes = useQuery({
    queryKey: adminKeys.codes,
    queryFn: ({ signal }) => api((client) => client.admin.codes(), { signal }),
  });

  if (codes.isPending) return <Loader2 className='m-8 size-6 animate-spin' />;
  if (codes.isError) return <p className='p-8 text-destructive'>{errorMessage(codes.error)}</p>;

  return (
    <div className='flex flex-col gap-4 p-6 print:p-0'>
      <div className='flex items-center gap-4 print:hidden'>
        <p className='text-sm text-muted-foreground'>
          {codes.data.length} kódů. Přihlašovací kód týmu patří jen jemu, kód místa platí pro
          všechny týmy.
        </p>
        <span className='flex-1' />
        <Button variant='outline' onClick={() => window.print()} disabled={codes.data.length === 0}>
          <Printer /> Tisknout na A4
        </Button>
      </div>
      <div className='flex flex-wrap gap-4 print:gap-[0.5cm]'>
        {codes.data.map((entry) => (
          <div key={entry.code} className='flex flex-col items-center gap-2 print:contents'>
            {entry.kind === 'T' ? (
              <TeamLoginQr value={entry.code} teamName={entry.label} logo={logo} />
            ) : entry.kind === 'E' ? (
              <EndQr value={entry.code} locationName={entry.label} logo={logo} />
            ) : (
              <ProgressQr value={entry.code} locationName={entry.label} logo={logo} />
            )}
            <CopySvgButton entry={entry} />
          </div>
        ))}
      </div>
    </div>
  );
};
