import { IconChevronLeft } from '@tabler/icons-react';
import { useRouter } from '@tanstack/react-router';
import { useState, useSyncExternalStore, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Below this width (Tailwind's `md`) the admin is on a phone: the floating panels open as subpages
 * over the whole page, and the playtest preview takes the whole width.
 */
export const NARROW_PX = 768;

const NARROW_QUERY = `(max-width: ${NARROW_PX - 0.02}px)`;

const subscribeNarrow = (onChange: () => void) => {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/** Whether the page is as narrow as a phone; follows a resize or a rotation. */
export const useNarrow = () =>
  useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW_QUERY).matches);

/**
 * The way back from a subpage kept in the URL. A subpage opened by a button here goes back in the
 * history, so the phone's back gesture and „Zpět“ do the same; one opened from a link or a reload
 * has nothing of the page behind it, so „Zpět“ replaces it with the page instead.
 */
export const useSubpageBack = (close: () => void) => {
  const router = useRouter();
  const [pushed, setPushed] = useState(false);
  return {
    /** Call when a button here opens the subpage. */
    opened: () => setPushed(true),
    back: () => {
      if (pushed && router.history.canGoBack()) {
        setPushed(false);
        router.history.back();
      } else {
        close();
      }
    },
  } as const;
};

/** A panel shown on a phone as a page of its own over the page it belongs to. */
export const Subpage = ({
  title,
  aside,
  onBack,
  children,
}: {
  readonly title: string;
  /** Next to the title on the right, such as a spinner. */
  readonly aside?: ReactNode;
  readonly onBack: () => void;
  readonly children: ReactNode;
}) => (
  <section className='absolute inset-0 z-10 flex animate-in flex-col bg-background fade-in slide-in-from-right-4'>
    <header className='flex items-center gap-1 border-b px-2 py-1'>
      <Button variant='ghost' size='sm' onClick={onBack}>
        <IconChevronLeft /> Zpět
      </Button>
      <h2 className='flex-1 truncate font-semibold'>{title}</h2>
      {aside}
    </header>
    <div className='min-h-0 flex-1 overflow-y-auto p-2'>{children}</div>
  </section>
);
