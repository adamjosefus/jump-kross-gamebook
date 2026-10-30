import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import { DEFAULT_LOGO_SCALE, qrGeometry } from './qr-svg';

export interface QrCodeProps {
  readonly value: string;
  /** Image placed in the middle of the code. Keep it simple and high-contrast. */
  readonly logo?: string | undefined;
  /** Share of the code width taken by the logo; ~0.22 keeps level-H codes readable. */
  readonly logoScale?: number;
  readonly className?: string;
}

/**
 * QR code drawn as one SVG path, always dark on white so it scans in dark mode and in print.
 * Error correction is level H, which tolerates the logo covering the centre.
 */
export const QrCode = ({ value, logo, logoScale = DEFAULT_LOGO_SCALE, className }: QrCodeProps) => {
  const { size, path, logo: box } = useMemo(() => qrGeometry(value, logoScale), [value, logoScale]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role='img'
      aria-label={`QR kód ${value}`}
      shapeRendering='crispEdges'
      className={cn('block aspect-square w-full bg-white', className)}
    >
      <rect width={size} height={size} fill='#fff' />
      <path d={path} fill='#000' />
      {logo !== undefined && (
        <>
          <rect
            x={box.at - box.pad}
            y={box.at - box.pad}
            width={box.size + box.pad * 2}
            height={box.size + box.pad * 2}
            rx={1}
            fill='#fff'
          />
          <image href={logo} x={box.at} y={box.at} width={box.size} height={box.size} />
        </>
      )}
    </svg>
  );
};
