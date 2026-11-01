import { Camera, Keyboard } from 'lucide-react';
import QrScanner from 'qr-scanner';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
export const QrScannerView = ({
  onCode,
  disabled = false,
}: {
  onCode: (code: string) => void;
  /** Codes read meanwhile are ignored, e.g. while the last one is being sent. */
  disabled?: boolean;
}) => {
  const video = useRef<HTMLVideoElement>(null);
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
    if (manual || video.current === null) return undefined;
    setCameraError(undefined);
    const scanner = new QrScanner(video.current, (result) => emit(result.data), {
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
    };
  }, [manual]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === '' || disabled) return;
    onCode(text.trim());
    setText('');
  };

  return (
    <div className='flex flex-col gap-3'>
      {manual ? (
        <form onSubmit={submit} className='flex gap-2'>
          <Input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value.toUpperCase())}
            placeholder='L-12-ABCD'
            autoCapitalize='characters'
            autoComplete='off'
            className='font-mono'
          />
          <Button type='submit' disabled={disabled}>
            Potvrdit
          </Button>
        </form>
      ) : (
        <div className='relative aspect-square overflow-hidden rounded-lg bg-muted'>
          <video ref={video} className='size-full object-cover' muted playsInline />
          {cameraError !== undefined && (
            <p className='absolute inset-0 flex items-center bg-background/90 p-6 text-center text-sm'>
              {cameraError}
            </p>
          )}
        </div>
      )}
      <Button variant='ghost' size='sm' onClick={() => setManual(!manual)}>
        {manual ? <Camera /> : <Keyboard />}
        {manual ? 'Použít fotoaparát' : 'Zadat kód ručně'}
      </Button>
    </div>
  );
};

/**
 * Content of a scan screen. It looks the same for every code, so it never tells how many codes
 * would work or where they lead.
 */
export const ScanPrompt = ({ onCode, busy }: { onCode: (code: string) => void; busy: boolean }) => (
  <>
    <div className='flex flex-col gap-2'>
      <h2 className='text-xl font-semibold'>Naskenujte QR kód</h2>
      <p className='text-muted-foreground'>Namiřte fotoaparát na QR kód.</p>
    </div>
    <QrScannerView onCode={onCode} disabled={busy} />
  </>
);
