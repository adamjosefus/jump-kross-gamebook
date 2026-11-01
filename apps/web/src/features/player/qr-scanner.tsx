import { Camera, ChevronLeft, Keyboard, Loader2 } from 'lucide-react';
import QrScanner from 'qr-scanner';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MANUAL = 'Zadejte kód ručně.';

/**
 * Why the camera did not start, for the player. `qr-scanner` reports a denied permission as
 * „Camera not found“, so the permission is asked separately.
 */
const cameraProblem = async (error: unknown) => {
  if (!window.isSecureContext || navigator.mediaDevices === undefined)
    return `Kamera funguje jen na zabezpečené adrese (https). ${MANUAL}`;
  const permission = await navigator.permissions
    ?.query({ name: 'camera' })
    .then((status) => status.state)
    .catch(() => undefined);
  const name = error instanceof Error ? error.name : '';
  if (permission === 'denied' || name === 'NotAllowedError')
    return `Prohlížeč nepovolil přístup ke kameře. Povolte ho v nastavení stránky, nebo ${MANUAL.toLowerCase()}`;
  if (name === 'NotReadableError')
    return `Kameru právě používá jiná aplikace. Zavřete ji, nebo ${MANUAL.toLowerCase()}`;
  if (name === 'NotFoundError' || error === 'Camera not found.')
    return `Nenašla se žádná kamera. ${MANUAL}`;
  return `Kameru se nepodařilo spustit. ${MANUAL}`;
};

/** The same code read again within this time is ignored, so one code is not sent twice. */
const REPEAT_MS = 3000;

/**
 * Camera scanner (`qr-scanner`, works on iOS Safari which has no `BarcodeDetector`) with a manual
 * fallback: the code is printed under every QR, so it can be typed in when the camera fails. The
 * camera runs while the component is mounted, so a wrong code can be followed by another one.
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
  const [manual, setManual] = useState(false);
  const [cameraError, setCameraError] = useState<string>();
  const [text, setText] = useState('');

  const last = useRef<{ code: string; at: number }>(undefined);
  const emit = useEffectEvent((code: string) => {
    const now = Date.now();
    if (disabled || (last.current?.code === code && now - last.current.at < REPEAT_MS)) return;
    last.current = { code, at: now };
    onCode(code);
  });

  useEffect(() => {
    const container = stage.current;
    if (manual || container === null) return undefined;
    setCameraError(undefined);
    // Every scanner gets its own video: a destroyed scanner stops the stream in its video 300 ms
    // later, which in a shared one would be the next scanner's camera (React runs effects twice
    // in development, so that happens on every mount).
    const video = document.createElement('video');
    // Black and white, by CSS only; the scanner reads the stream, not the painted picture.
    video.className = 'size-full object-cover grayscale';
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
  }, [manual]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === '' || disabled) return;
    onCode(text.trim());
    setText('');
  };

  // The square sits edge to edge; only the text above and below keeps clear of the screen's edges.
  const sides =
    'pr-[calc(var(--safe-area-inset-right)+1.25rem)] pl-[calc(var(--safe-area-inset-left)+1.25rem)]';
  return (
    <div className='fixed inset-0 z-40 flex flex-col bg-black text-white'>
      <div className={cn('flex flex-col gap-2 pt-[calc(var(--safe-area-inset-top)+1rem)]', sides)}>
        {header}
      </div>
      <div className='flex flex-1 items-center justify-center py-6'>
        {/* Square and as wide as the screen; capped by the height when the screen lies. */}
        <div className='relative flex aspect-square w-full max-w-[65dvh] items-center justify-center overflow-hidden bg-white/5'>
          {!manual && <div ref={stage} className='absolute inset-0' />}
          <div className={cn('relative w-full', sides)}>
            {disabled ? (
              <Loader2 className='mx-auto size-8 animate-spin' />
            ) : manual ? (
              <form onSubmit={submit} className='flex w-full gap-2'>
                <Input
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value.toUpperCase())}
                  placeholder='L-12-ABCD'
                  autoCapitalize='characters'
                  autoComplete='off'
                  className='border-white/20 bg-white/10 font-mono text-white placeholder:text-white/40'
                />
                <Button type='submit' variant='secondary'>
                  Potvrdit
                </Button>
              </form>
            ) : (
              cameraError !== undefined && (
                <p className='mx-auto max-w-xs text-center text-sm text-white/80'>{cameraError}</p>
              )
            )}
          </div>
        </div>
      </div>
      <div
        className={cn('flex justify-center pb-[calc(var(--safe-area-inset-bottom)+1rem)]', sides)}
      >
        <Button
          variant='ghost'
          className='text-white hover:bg-white/10 hover:text-white'
          onClick={() => setManual(!manual)}
        >
          {manual ? <Camera /> : <Keyboard />}
          {manual ? 'Použít fotoaparát' : 'Zadat kód ručně'}
        </Button>
      </div>
    </div>
  );
};

/**
 * The scan screen: the camera as a square across the whole width. It looks the same for every code, so it
 * never tells how many codes would work or where they lead.
 */
export const ScanScreen = ({
  onCode,
  busy,
  onBack,
}: {
  onCode: (code: string) => void;
  busy: boolean;
  /** Back to the last screen of text; missing when there is none. */
  onBack?: () => void;
}) => (
  <QrScannerView
    onCode={onCode}
    disabled={busy}
    header={
      <>
        {onBack !== undefined && (
          <Button
            variant='ghost'
            size='sm'
            className='-ml-3 self-start text-white/80 hover:bg-white/10 hover:text-white'
            onClick={onBack}
          >
            <ChevronLeft /> Zpět
          </Button>
        )}
        <h2 className='text-xl font-semibold'>Naskenujte QR kód</h2>
        <p className='text-white/70'>Namiřte fotoaparát na QR kód.</p>
      </>
    }
  />
);
