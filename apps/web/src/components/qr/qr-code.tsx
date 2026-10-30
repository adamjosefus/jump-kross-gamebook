import QRCode from 'qrcode'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

export interface QrCodeProps {
  readonly value: string
  /** Image placed in the middle of the code. Keep it simple and high-contrast. */
  readonly logo?: string | undefined
  /** Share of the code width taken by the logo; ~0.22 keeps level-H codes readable. */
  readonly logoScale?: number
  readonly className?: string
}

/** Quiet zone around the code, in modules (the spec asks for 4). */
const MARGIN = 4

/**
 * QR code drawn as one SVG path, always dark on white so it scans in dark mode and in print.
 * Error correction is level H, which tolerates the logo covering the centre.
 */
export const QrCode = ({ value, logo, logoScale = 0.22, className }: QrCodeProps) => {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'H' })
    let d = ''
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) d += `M${col + MARGIN} ${row + MARGIN}h1v1h-1z`
      }
    }
    return { size: modules.size + MARGIN * 2, path: d }
  }, [value])

  const logoSize = (size - MARGIN * 2) * logoScale
  const logoAt = (size - logoSize) / 2
  const pad = 0.8

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`QR kód ${value}`}
      shapeRendering="crispEdges"
      className={cn('block aspect-square w-full bg-white', className)}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
      {logo !== undefined && (
        <>
          <rect
            x={logoAt - pad}
            y={logoAt - pad}
            width={logoSize + pad * 2}
            height={logoSize + pad * 2}
            rx={1}
            fill="#fff"
          />
          <image href={logo} x={logoAt} y={logoAt} width={logoSize} height={logoSize} />
        </>
      )}
    </svg>
  )
}
