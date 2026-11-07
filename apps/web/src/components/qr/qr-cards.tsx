import { IconLogin, IconQrcode } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { DEFAULT_SCAN_TEXT, type QrCardText, qrCardText } from './qr-card-text';
import { QrCode } from './qr-code';
import type { QrStyle } from './qr-svg';

/** The code without its own white margin, the same object every render so it is drawn once. */
const NO_QUIET_ZONE: QrStyle = { quietZone: 0 };

interface QrCardProps {
  readonly value: string;
  /**
   * The story's texts of the scan screens that take the code, the ones the players read while
   * scanning it; the player's default text when there are none.
   */
  readonly scanTexts?: readonly string[] | undefined;
  /**
   * Buttons in the bottom right corner, on a background of their own so they do not get lost in the
   * content under them; shown on hover or keyboard focus (always on touch screens), never printed.
   */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * Card as narrow as its code, which has a fixed physical width, unless `className` makes it wider;
 * the code stays in the middle. In the colors of the app theme, the code included: it has no
 * background or margin of its own and takes the text color. Printed, the whole card is black on
 * white and the card's padding is the code's quiet zone.
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
      'group relative flex w-min break-inside-avoid flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground print:border-2 print:border-black print:bg-white print:text-black',
      className,
    )}
  >
    <figcaption className='flex flex-col gap-1'>
      <span className='flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase'>
        {icon}
        {eyebrow}
      </span>
      {title !== undefined && <span className='text-lg leading-tight font-semibold'>{title}</span>}
    </figcaption>
    {/* The code in the middle; its text runs up on the left, centered between the edge and the
      code, and an empty column of the same width on the right keeps the code in the middle. */}
    <div className='-mx-4 grid grid-cols-[minmax(1.75rem,1fr)_auto_minmax(1.75rem,1fr)] items-center'>
      <span className='rotate-180 justify-self-center font-mono text-[10px] whitespace-nowrap opacity-60 [writing-mode:vertical-rl]'>
        {value}
      </span>
      <QrCode value={value} style={NO_QUIET_ZONE} plain className='my-3 w-[3.5cm]' />
    </div>
    <span className='flex flex-col gap-1 text-xs'>
      {(scanTexts.length === 0 ? [DEFAULT_SCAN_TEXT] : scanTexts).map((text) => (
        <span key={text}>{text}</span>
      ))}
    </span>
    {actions !== undefined && (
      <div className='absolute right-1 bottom-1 z-10 flex gap-1 rounded-xl bg-card p-1 opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 print:hidden [@media(hover:none)]:opacity-100'>
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
