import type { PrintableCode } from '@gamebook/api';
import { IconCopy, IconDownload, IconLoader2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { ProgressQr, TeamLoginQr } from '@/components/qr/qr-cards';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

import { ExportDialog } from './export-dialog';
import { adminKeys } from './queries';

/**
 * A card with buttons in its top right corner: one copies the code's text, to type it in when
 * testing without a camera, the other opens every export option.
 */
const CodeCard = ({ entry }: { readonly entry: PrintableCode }) => {
  const [open, setOpen] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(entry.code).then(
      () => toast.success(`Zkopírováno: ${entry.code}`),
      () => toast.error('Kód se nepodařilo zkopírovat.'),
    );
  };
  return (
    <div className='relative'>
      {entry.kind === 'T' ? (
        <TeamLoginQr value={entry.code} teamName={entry.label} />
      ) : (
        <ProgressQr value={entry.code} locationName={entry.label} />
      )}
      <div className='absolute top-3 right-3 flex gap-1 print:hidden'>
        <Button
          variant='outline'
          size='icon'
          title='Zkopírovat text kódu'
          aria-label={`Zkopírovat text kódu ${entry.label}`}
          onClick={copy}
        >
          <IconCopy />
        </Button>
        <Button
          variant='outline'
          size='icon'
          title='Stáhnout'
          aria-label={`Stáhnout ${entry.label}`}
          onClick={() => setOpen(true)}
        >
          <IconDownload />
        </Button>
      </div>
      <ExportDialog entry={entry} open={open} onOpenChange={setOpen} />
    </div>
  );
};

/**
 * Every QR code of the game; each card's download button opens all export options. Printed from
 * the browser, the page shows the cards alone, as many pages as they take.
 */
export const PrintPage = () => {
  const codes = useQuery({
    queryKey: adminKeys.codes,
    queryFn: ({ signal }) => api((client) => client.admin.codes(), { signal }),
  });

  if (codes.isPending) return <IconLoader2 className='m-8 size-6 animate-spin' />;
  if (codes.isError) return <p className='p-8 text-destructive'>{errorMessage(codes.error)}</p>;

  return (
    <div className='flex flex-col gap-4 p-6'>
      <div className='flex items-center gap-4 print:hidden'>
        <p className='text-sm text-muted-foreground'>
          {codes.data.length} kódů. Přihlašovací kód týmu patří jen jemu, kód místa platí pro
          všechny týmy. Týmy i místa jsou součástí příběhu.
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
