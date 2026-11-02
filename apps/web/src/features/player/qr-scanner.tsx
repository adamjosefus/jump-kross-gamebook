import { IconLoader2, IconRotateClockwise } from '@tabler/icons-react';
import QrScanner from 'qr-scanner';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Why the camera did not start, for the player. `qr-scanner` reports a denied permission as
 * „Camera not found“, so the permission is asked separately.
 */
const cameraProblem = async (error: unknown) => {
  if (!window.isSecureContext || navigator.mediaDevices === undefined)
    return 'Kamera funguje jen na zabezpečené adrese (https).';
  const permission = await navigator.permissions
    ?.query({ name: 'camera' })
    .then((status) => status.state)
    .catch(() => undefined);
  const name = error instanceof Error ? error.name : '';
  if (permission === 'denied' || name === 'NotAllowedError')
    return 'Prohlížeč nepovolil přístup ke kameře. Povolte ho v nastavení stránky.';
  if (name === 'NotReadableError') return 'Kameru právě používá jiná aplikace. Zavřete ji.';
  if (name === 'NotFoundError' || error === 'Camera not found.') return 'Nenašla se žádná kamera.';
  return 'Kameru se nepodařilo spustit.';
};

/** The same code read again within this time is ignored, so one code is not sent twice. */
const REPEAT_MS = 3000;

/**
 * Camera scanner (`qr-scanner`, works on iOS Safari which has no `BarcodeDetector`). The camera
 * runs while the component is mounted, so a wrong code can be followed by another one.
 */
const QrScannerView = ({
  onCode,
  disabled = false,
  header,
}: {
  onCode: (code: string) => void;
  /** Codes read meanwhile are ignored, e.g. while the last one is being sent. */
  disabled?: boolean;
  /** Shown over the top of the camera. */
  header: ReactNode;
}) => {
  const stage = useRef<HTMLDivElement>(null);
  const [cameraError, setCameraError] = useState<string>();
  // A failed camera stays off until the player tries again.
  const failed = cameraError !== undefined;

  const last = useRef<{ code: string; at: number }>(undefined);
  const emit = useEffectEvent((code: string) => {
    const now = Date.now();
    if (disabled || (last.current?.code === code && now - last.current.at < REPEAT_MS)) return;
    last.current = { code, at: now };
    onCode(code);
  });

  useEffect(() => {
    const container = stage.current;
    if (failed || container === null) return undefined;
    // Every scanner gets its own video: a destroyed scanner stops the stream in its video 300 ms
    // later, which in a shared one would be the next scanner's camera (React runs effects twice
    // in development, so that happens on every mount).
    const video = document.createElement('video');
    // Black and white, by CSS only; the scanner reads the stream, not the painted picture.
    video.className = 'size-full object-cover grayscale contrast-125';
    video.muted = true;
    video.playsInline = true;
    container.append(video);
    const scanner = new QrScanner(video, (result) => emit(result.data), {
      preferredCamera: 'environment',
      highlightScanRegion: true,
      maxScansPerSecond: 8,
    });
    // A scanner torn down meanwhile (React runs effects twice in development) must not report.
    let current = true;
    scanner.start().catch(async (error: unknown) => {
      const message = await cameraProblem(error);
      if (current) setCameraError(message);
    });
    return () => {
      current = false;
      scanner.destroy();
      // The scan region overlay sits next to the video.
      container.replaceChildren();
    };
  }, [failed]);

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex flex-col gap-2'>{header}</div>
      <div className='flex flex-1 items-center justify-center py-6'>
        {/* Square across the column; capped by the height when the screen lies. */}
        <div className='relative flex aspect-square w-full max-w-[65dvh] items-center justify-center overflow-hidden rounded-xl bg-card'>
          <div ref={stage} className='absolute inset-0' />
          <div className='relative w-full px-4'>
            {disabled ? (
              <IconLoader2 className='mx-auto size-8 animate-spin' />
            ) : (
              cameraError !== undefined && (
                <div className='mx-auto flex max-w-xs flex-col items-center gap-3 text-center text-balance'>
                  <p>{cameraError}</p>
                  <Button variant='secondary' onClick={() => setCameraError(undefined)}>
                    <IconRotateClockwise /> Zkusit znovu
                  </Button>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * The scan screen: the camera as a square across the width of the story text. It looks the same for every code, so it
 * never tells how many codes would work or where they lead.
 */
export const ScanScreen = ({ onCode, busy }: { onCode: (code: string) => void; busy: boolean }) => (
  <QrScannerView
    onCode={onCode}
    disabled={busy}
    header={
      <>
        <h2 className='story-heading'>Naskenujte QR kód</h2>
        <p>Namiřte fotoaparát na QR kód.</p>
      </>
    }
  />
);
