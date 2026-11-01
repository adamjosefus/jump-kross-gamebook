import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import { type QrStyle, qrGeometry } from './qr-svg';

export interface QrCodeProps {
  readonly value: string;
  /** Noise around the code and the width of its white margin. */
  readonly style?: QrStyle | undefined;
  readonly className?: string;
}

/**
 * QR code drawn as one SVG path, always dark on white so it scans in dark mode and in print.
 */
export const QrCode = ({ value, style, className }: QrCodeProps) => {
  const { size, path } = useMemo(() => qrGeometry(value, style), [value, style]);

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
    </svg>
  );
};
