import type { PrintableCode } from '@gamebook/api';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { ProgressQr, TeamLoginQr } from '@/components/qr/qr-cards';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

import { ExportDialog } from './export-dialog';
import { adminKeys } from './queries';

/** A card with a download button in its top right corner, opening every export option. */
const CodeCard = ({ entry }: { entry: PrintableCode }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className='relative'>
      {entry.kind === 'T' ? (
        <TeamLoginQr value={entry.code} teamName={entry.label} />
      ) : (
        <ProgressQr value={entry.code} locationName={entry.label} />
      )}
      <Button
        variant='outline'
        size='icon'
        title='Stáhnout'
        aria-label={`Stáhnout ${entry.label}`}
        onClick={() => setOpen(true)}
        className='absolute top-3 right-3 border-black/20 bg-white text-black hover:bg-black/5 hover:text-black dark:border-black/20 dark:bg-white dark:hover:bg-black/5'
      >
        <Download />
      </Button>
      <ExportDialog entry={entry} open={open} onOpenChange={setOpen} />
    </div>
  );
};

/** Every QR code of the game; each card's download button opens all export options. */
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
          všechny týmy. Týmy se zakládají na stránce Hra, místa jsou součástí příběhu.
        </p>
      </div>
      <div className='flex flex-wrap gap-4'>
        {codes.data.map((entry) => (
          <CodeCard key={entry.code} entry={entry} />
        ))}
      </div>
    </div>
  );
};
