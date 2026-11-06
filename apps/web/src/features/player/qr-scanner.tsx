import { IconRotateClockwise } from '@tabler/icons-react';
import QrScanner from 'qr-scanner';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

import { ScanFrame } from './scan-frame';

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

/** A code is sent only after it stays in view this long, so the player can still change their mind. */
const ARM_MS = 3000;

/**
 * A code not read for this long has left the view and is not sent. The scanner reads up to
 * 8 times a second but misses some frames, e.g. when the camera moves.
 */
const LOST_MS = 800;

/**
 * Camera scanner (`qr-scanner`, works on iOS Safari which has no `BarcodeDetector`). The camera
 * runs while the component is mounted, so a wrong code can be followed by another one.
 */
const QrScannerView = ({
  onCode,
  disabled = false,
  header,
}: {
  readonly onCode: (code: string) => void;
  /** Codes read meanwhile are ignored, e.g. while the last one is being sent. */
  readonly disabled?: boolean;
  /** Shown over the top of the camera. */
  readonly header: ReactNode;
}) => {
  const stage = useRef<HTMLDivElement>(null);
  const [cameraError, setCameraError] = useState<string>();
  // A failed camera stays off until the player tries again.
  const failed = cameraError !== undefined;

  const last = useRef<{ readonly code: string; readonly at: number }>(undefined);
  // The code waiting to be sent and when it was last read.
  const [arming, setArming] = useState<string>();
  const seenAt = useRef(0);
  const emit = useEffectEvent((code: string) => {
    const now = Date.now();
    if (disabled || (last.current?.code === code && now - last.current.at < REPEAT_MS)) return;
    seenAt.current = now;
    setArming(code);
  });
  const send = useEffectEvent((code: string) => {
    last.current = { code, at: Date.now() };
    setArming(undefined);
    onCode(code);
  });

  // A code held in view for `ARM_MS` is sent; one that leaves the view meanwhile is dropped.
  useEffect(() => {
    if (arming === undefined) return undefined;
    const sendTimer = setTimeout(() => send(arming), ARM_MS);
    const lostTimer = setInterval(() => {
      if (Date.now() - seenAt.current > LOST_MS) setArming(undefined);
    }, 100);
    return () => {
      clearTimeout(sendTimer);
      clearInterval(lostTimer);
    };
  }, [arming]);

  // Nothing waits to be sent while the last code is.
  if (disabled && arming !== undefined) setArming(undefined);

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
      maxScansPerSecond: 8,
    });
    // A scanner torn down meanwhile (React runs effects twice in development) must not report;
    // `start()` cannot be aborted, so the cleanup flags it instead.
    let current = true;
    scanner.start().catch(async (error: unknown) => {
      const message = await cameraProblem(error);
      if (current) setCameraError(message);
    });
    return () => {
      current = false;
      scanner.destroy();
      container.replaceChildren();
    };
  }, [failed]);

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex flex-col gap-2'>{header}</div>
      <div className='flex flex-1 items-center justify-center py-6'>
        {/* Square across the column; capped by the height when the screen lies. */}
        <div className='relative flex aspect-square w-full max-w-[65dvh] items-center justify-center overflow-hidden rounded-xl bg-muted'>
          <div ref={stage} className='absolute inset-0' />
          {cameraError === undefined ? (
            // The library scans the middle two thirds of the shorter side; the video covers the
            // square, so that is two thirds of it.
            <div className='absolute inset-[16.667%]'>
              <ScanFrame
                state={disabled ? 'busy' : arming === undefined ? 'aiming' : 'arming'}
                armMs={ARM_MS}
              />
            </div>
          ) : (
            <div className='relative mx-auto flex max-w-xs flex-col items-center gap-3 px-4 text-center text-balance'>
              <p>{cameraError}</p>
              <Button variant='secondary' onClick={() => setCameraError(undefined)}>
                <IconRotateClockwise /> Zkusit znovu
              </Button>
            </div>
          )}
          {disabled && (
            <span className='sr-only' role='status'>
              Načítání…
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * The scan screen: the camera as a square across the width of the story text. It looks the same for every code, so it
 * never tells how many codes would work or where they lead.
 */
export const ScanScreen = ({
  title = 'Naskenujte QR kód',
  text = 'Namiřte fotoaparát na QR kód.',
  onCode,
  busy,
}: {
  /** From the story; a default one without it. */
  readonly title?: string | undefined;
  /** From the story; a default one without it. */
  readonly text?: string | undefined;
  readonly onCode: (code: string) => void;
  readonly busy: boolean;
}) => (
  <QrScannerView
    onCode={onCode}
    disabled={busy}
    header={
      <>
        <h2 className='story-heading'>{title}</h2>
        <p>{text}</p>
      </>
    }
  />
);
