import type { PrintableCode } from '@gamebook/api';
import { IconShare2, IconLoader2, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ProgressQr, QR_CARD_ACTION, TeamLoginQr } from '@/components/qr/qr-cards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

import { ExportDialog } from './export-dialog';
import { adminKeys } from './queries';

/** A card with one button in its corner, opening every export option. */
const CodeCard = ({ entry }: { readonly entry: PrintableCode }) => {
  const [open, setOpen] = useState(false);
  const actions = (
    <Button
      variant='outline'
      size='icon'
      className={QR_CARD_ACTION}
      title='Exportovat'
      aria-label={`Exportovat ${entry.label}`}
      onClick={() => setOpen(true)}
    >
      <IconShare2 />
    </Button>
  );
  return (
    <>
      {entry.kind === 'T' ? (
        <TeamLoginQr
          value={entry.code}
          teamName={entry.label}
          scanTexts={entry.scanTexts}
          actions={actions}
          className='w-full'
        />
      ) : (
        <ProgressQr
          value={entry.code}
          name={entry.label}
          scanTexts={entry.scanTexts}
          actions={actions}
          className='w-full'
        />
      )}
      <ExportDialog entry={entry} open={open} onOpenChange={setOpen} />
    </>
  );
};

/** Lowercase without diacritics, so „studna“ finds „Studna na nádvoří“. */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** The sections of the page, one per kind of code. */
const SECTIONS = [
  {
    kind: 'T',
    title: 'Vstupní kódy',
    description: 'Přihlásí tým do hry. Každý tým má svůj vlastní.',
  },
  {
    kind: 'L',
    title: 'Herní kódy',
    description: 'Posunou v příběhu kterýkoli tým. Patří na místa, kudy hra vede.',
  },
] as const satisfies readonly {
  readonly kind: PrintableCode['kind'];
  readonly title: string;
  readonly description: string;
}[];

/**
 * Every QR code of the game in sections by kind, filtered by the text of their name or code; each
 * card's export button opens all export options. Printed, only the cards are left.
 */
export const CodeList = ({ codes }: { readonly codes: readonly PrintableCode[] }) => {
  const [filter, setFilter] = useState('');
  const words = fold(filter).split(/\s+/).filter(Boolean);
  const matching = codes.filter((entry) => {
    const text = fold(`${entry.label} ${entry.code}`);
    return words.every((word) => text.includes(word));
  });

  return (
    <div className='flex flex-col gap-8 p-6'>
      <div className='relative max-w-sm print:hidden'>
        <IconSearch className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          type='search'
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder='Hledat podle názvu nebo kódu'
          aria-label='Hledat kódy'
          className='pl-8'
        />
      </div>
      {matching.length === 0 && (
        <p className='text-sm text-muted-foreground print:hidden'>
          {words.length === 0
            ? 'Příběh nemá žádné kódy.'
            : `Žádný kód neodpovídá hledání „${filter.trim()}“.`}
        </p>
      )}
      {SECTIONS.map((section) => {
        const entries = matching.filter((entry) => entry.kind === section.kind);
        if (entries.length === 0) return null;
        return (
          <section key={section.kind} className='flex flex-col gap-4'>
            <header className='flex flex-col gap-1 print:hidden'>
              <h2 className='text-lg font-semibold'>
                {section.title}{' '}
                <span className='font-normal text-muted-foreground tabular-nums'>
                  {entries.length}
                </span>
              </h2>
              <p className='text-sm text-muted-foreground'>{section.description}</p>
            </header>
            <div className='grid grid-cols-[repeat(auto-fill,13rem)] gap-4 print:grid-cols-[repeat(auto-fill,8cm)]'>
              {entries.map((entry) => (
                <CodeCard key={entry.code} entry={entry} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

/** The QR codes of the game, loaded from the API. Printed from the browser, the page shows the cards
 * alone, as many pages as they take. */
export const PrintPage = () => {
  const codes = useQuery({
    queryKey: adminKeys.codes,
    queryFn: ({ signal }) => api((client) => client.admin.codes(), { signal }),
  });

  if (codes.isPending) return <IconLoader2 className='m-8 size-6 animate-spin' />;
  if (codes.isError) return <p className='p-8 text-destructive'>{errorMessage(codes.error)}</p>;
  return <CodeList codes={codes.data} />;
};
