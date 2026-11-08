import { IconLogin, IconQrcode } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { type QrCardText, qrCardText } from './qr-card-text';
import { QrCode } from './qr-code';
import type { QrStyle } from './qr-svg';

/** The code without its own white margin, the same object every render so it is drawn once. */
const NO_QUIET_ZONE: QrStyle = { quietZone: 0 };

/** Stands in for a scan screen without a text of its own in the story. */
const NO_SCAN_TEXT = '—';

/**
 * Light outline buttons for `actions`: they show only over the card turned light, so they keep
 * light colors in dark mode too.
 */
export const QR_CARD_ACTION =
  'border-black/10 bg-white text-black hover:bg-black/5 hover:text-black dark:border-black/10 dark:bg-white dark:hover:bg-black/5';

interface QrCardProps {
  readonly value: string;
  /**
   * The story's texts of the scan screens that take the code, the ones the players read while
   * scanning it; `null` for a screen without its own. For the organisers on screen, never printed.
   */
  readonly scanTexts?: readonly (string | null)[] | undefined;
  /**
   * Buttons in the bottom right corner, on a background of their own so they do not get lost in the
   * content under them; shown on hover or keyboard focus (always on touch screens), never printed.
   * Style them with `QR_CARD_ACTION`.
   */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * Card as narrow as its code, which has a fixed physical width, unless `className` makes it wider;
 * the code stays in the middle, bigger in print. In the colors of the app theme, the code included:
 * it has no background or margin of its own and takes the text color. On hover or keyboard focus,
 * and in print, the card turns black on white, so the code scans in dark mode too; the card's
 * padding is the code's quiet zone.
 */
const QrCard = ({
  value,
  scanTexts = [],
  actions,
  className,
  icon,
  eyebrow,
  title,
}: QrCardProps & QrCardText & { readonly icon: ReactNode }) => (
  <figure
    className={cn(
      'group relative flex w-min break-inside-avoid flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 text-card-foreground focus-within:border-black/10 focus-within:bg-white focus-within:text-black hover:border-black/10 hover:bg-white hover:text-black print:border-2 print:border-black print:bg-white print:text-black',
      className,
    )}
  >
    <figcaption className='flex flex-col gap-1'>
      <span className='flex items-center gap-1.5 text-xs font-medium'>
        {icon}
        {eyebrow}
      </span>
      {title !== undefined && <span className='text-lg leading-tight font-semibold'>{title}</span>}
    </figcaption>
    {/* The code in the middle; its text runs up on the left, centered between the edge and the
      code, and stays gray on hover too. An empty column of the same width on the right keeps the
      code in the middle. */}
    <div className='-mx-4 grid grid-cols-[minmax(1.75rem,1fr)_auto_minmax(1.75rem,1fr)] items-center'>
      <span
        aria-hidden
        className='rotate-180 justify-self-center font-mono text-[10px] tracking-widest whitespace-nowrap opacity-60 [writing-mode:vertical-rl]'
      >
        {value}
      </span>
      <QrCode
        value={value}
        style={NO_QUIET_ZONE}
        plain
        className='my-3 w-[3.5cm] print:w-[5.5cm]'
      />
    </div>
    <span className='flex flex-col gap-1 text-xs print:hidden'>
      {(scanTexts.length === 0 ? [null] : scanTexts).map((text) => (
        <span key={text ?? ''}>{text ?? NO_SCAN_TEXT}</span>
      ))}
    </span>
    {actions !== undefined && (
      <div className='absolute right-1 bottom-1 z-10 flex gap-1 rounded-xl bg-white p-1 opacity-0 shadow-[0_0_0.75rem_0.5rem_white] group-focus-within:opacity-100 group-hover:opacity-100 print:hidden [@media(hover:none)]:opacity-100'>
        {actions}
      </div>
    )}
  </figure>
);

/** Logs a team into the game. One per team; the team cannot rename itself. */
export const TeamLoginQr = ({
  teamName,
  ...props
}: QrCardProps & { readonly teamName: string }) => (
  <QrCard {...props} {...qrCardText('T', teamName)} icon={<IconLogin className='size-3.5' />} />
);

/**
 * Moves any team on. The name tells the organisers where to put the card; the players see it too.
 */
export const ProgressQr = ({ name, ...props }: QrCardProps & { readonly name?: string }) => (
  <QrCard {...props} {...qrCardText('L', name)} icon={<IconQrcode className='size-3.5' />} />
);
