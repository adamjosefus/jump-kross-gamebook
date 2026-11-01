import { Camera, Keyboard } from 'lucide-react';
import QrScanner from 'qr-scanner';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    scanner.start().catch(() => {
      setCameraError(
        'Kameru se nepodařilo spustit. Povolte přístup ke kameře, nebo zadejte kód ručně.',
      );
    });
    return () => scanner.destroy();
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
