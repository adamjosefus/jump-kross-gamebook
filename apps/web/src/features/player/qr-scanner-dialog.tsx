import { Camera, Keyboard } from 'lucide-react';
import QrScanner from 'qr-scanner';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface QrScannerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCode: (code: string) => void;
  readonly title?: string;
}

/**
 * Camera scanner (`qr-scanner`, works on iOS Safari which has no `BarcodeDetector`) with a manual
 * fallback: the code is printed under every QR, so it can be typed in when the camera fails.
 */
export const QrScannerDialog = ({
  open,
  onOpenChange,
  onCode,
  title = 'Naskenujte QR kód',
}: QrScannerDialogProps) => {
  const video = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState(false);
  const [cameraError, setCameraError] = useState<string>();
  const [text, setText] = useState('');

  const finish = (code: string) => {
    setManual(false);
    setText('');
    onCode(code);
  };
  const emit = useEffectEvent((code: string) => finish(code));

  useEffect(() => {
    if (!open || manual || video.current === null) return undefined;
    setCameraError(undefined);
    let done = false;
    const scanner = new QrScanner(
      video.current,
      (result) => {
        if (done) return;
        done = true;
        scanner.stop();
        emit(result.data);
      },
      { preferredCamera: 'environment', highlightScanRegion: true, maxScansPerSecond: 8 },
    );
    scanner.start().catch(() => {
      setCameraError(
        'Kameru se nepodařilo spustit. Povolte přístup ke kameře, nebo zadejte kód ručně.',
      );
    });
    return () => {
      done = true;
      scanner.destroy();
    };
  }, [open, manual]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() !== '') finish(text.trim());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setManual(false);
          setText('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {manual ? 'Opište kód vytištěný pod QR kódem.' : 'Namiřte fotoaparát na QR kód.'}
          </DialogDescription>
        </DialogHeader>
        {manual ? (
          <form onSubmit={submit} className='flex gap-2'>
            <Input
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value.toUpperCase())}
              placeholder='L:12:ABCD'
              autoCapitalize='characters'
              autoComplete='off'
              className='font-mono'
            />
            <Button type='submit'>Potvrdit</Button>
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
      </DialogContent>
    </Dialog>
  );
};
