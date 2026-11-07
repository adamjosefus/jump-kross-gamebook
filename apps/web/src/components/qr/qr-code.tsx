import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import { type QrStyle, qrGeometry } from './qr-svg';

export interface QrCodeProps {
  readonly value: string;
  /** Noise around the code and the width of its white margin. */
  readonly style?: QrStyle | undefined;
  /** Without a background, the modules in the text color; otherwise dark on white. */
  readonly plain?: boolean;
  readonly className?: string;
}

/**
 * QR code drawn as one SVG path, dark on white so it scans in dark mode and in print; `plain`, it
 * has no background and takes the color of the text around it.
 */
export const QrCode = ({ value, style, plain = false, className }: QrCodeProps) => {
  const { size, path } = useMemo(() => qrGeometry(value, style), [value, style]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role='img'
      aria-label={`QR kód ${value}`}
      shapeRendering='crispEdges'
      className={cn('block aspect-square w-full', !plain && 'bg-white', className)}
    >
      {!plain && <rect width={size} height={size} fill='#fff' />}
      <path d={path} fill={plain ? 'currentColor' : '#000'} />
    </svg>
  );
};
