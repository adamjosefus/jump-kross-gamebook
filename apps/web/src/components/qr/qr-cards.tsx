import { Flag, LogIn, MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { QrCode } from './qr-code'

interface QrCardProps {
  readonly value: string
  readonly logo?: string | undefined
  readonly className?: string
}

/**
 * Printable card: fixed physical width, black on white regardless of the app theme, so the
 * printed sheet looks the same as the preview.
 */
const QrCard = ({
  value,
  logo,
  className,
  icon,
  eyebrow,
  title,
  hint,
}: QrCardProps & { icon: ReactNode; eyebrow: string; title: string | undefined; hint: string }) => (
  <figure
    className={cn(
      'flex w-[8cm] break-inside-avoid flex-col gap-3 rounded-xl border-2 border-black bg-white p-5 text-black',
      className,
    )}
  >
    <figcaption className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase">
        {icon}
        {eyebrow}
      </span>
      {title !== undefined && <span className="text-2xl leading-tight font-semibold">{title}</span>}
    </figcaption>
    <QrCode value={value} logo={logo} />
    <div className="flex items-end justify-between gap-2 text-xs">
      <span>{hint}</span>
      <span className="font-mono text-[10px] opacity-60">{value}</span>
    </div>
  </figure>
)

/** Logs a team into the game. One per team; the team cannot rename itself. */
export const TeamLoginQr = ({ teamName, ...props }: QrCardProps & { readonly teamName: string }) => (
  <QrCard
    {...props}
    icon={<LogIn className="size-3.5" />}
    eyebrow="Vstup do hry"
    title={teamName}
    hint="Naskenujte v aplikaci pro přihlášení týmu."
  />
)

/** Moves any team on at a location. The name is for organisers placing the code. */
export const ProgressQr = ({ locationName, ...props }: QrCardProps & { readonly locationName?: string }) => (
  <QrCard
    {...props}
    icon={<MapPin className="size-3.5" />}
    eyebrow={locationName ?? 'Stanoviště'}
    title={undefined}
    hint="Naskenujte v aplikaci a pokračujte v příběhu."
  />
)

/** Ends the game at a finish location. */
export const EndQr = ({ locationName, ...props }: QrCardProps & { readonly locationName?: string }) => (
  <QrCard
    {...props}
    icon={<Flag className="size-3.5" />}
    eyebrow={locationName ?? 'Cíl'}
    title="Cíl"
    hint="Naskenujte v aplikaci a dokončete hru."
  />
)
