import { IconLogin, IconMapPin } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { type QrCardText, qrCardText } from './qr-card-text';
import { QrCode } from './qr-code';

interface QrCardProps {
  readonly value: string;
  readonly className?: string;
}

/**
 * Card with a fixed physical width, in the colors of the app theme. Only the code stays dark on
 * white to scan in dark mode too; printed, the whole card is black on white.
 */
const QrCard = ({
  value,
  className,
  icon,
  eyebrow,
  title,
  hint,
}: QrCardProps & QrCardText & { readonly icon: ReactNode }) => (
  <figure
    className={cn(
      'flex w-[8cm] break-inside-avoid flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground print:border-2 print:border-black print:bg-white print:text-black',
      className,
    )}
  >
    <figcaption className='flex flex-col gap-1'>
      <span className='flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase'>
        {icon}
        {eyebrow}
      </span>
      {title !== undefined && <span className='text-2xl leading-tight font-semibold'>{title}</span>}
    </figcaption>
    <QrCode value={value} className='rounded-md' />
    <div className='flex items-end justify-between gap-2 text-xs'>
      <span>{hint}</span>
      <span className='font-mono text-[10px] opacity-60'>{value}</span>
    </div>
  </figure>
);

/** Logs a team into the game. One per team; the team cannot rename itself. */
export const TeamLoginQr = ({
  teamName,
  ...props
}: QrCardProps & { readonly teamName: string }) => (
  <QrCard {...props} {...qrCardText('T', teamName)} icon={<IconLogin className='size-3.5' />} />
);

/** Moves any team on at a location. The name is for organisers placing the code. */
export const ProgressQr = ({
  locationName,
  ...props
}: QrCardProps & { readonly locationName?: string }) => (
  <QrCard
    {...props}
    {...qrCardText('L', locationName)}
    icon={<IconMapPin className='size-3.5' />}
  />
);
