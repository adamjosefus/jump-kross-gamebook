import { Camera, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

type CameraAccess = 'checking' | 'prompt' | 'requesting' | 'granted' | 'denied' | 'missing';

/**
 * Whether the page may use the camera. The permission is read without asking and followed while
 * the page is open, so allowing it in the browser's settings is picked up at once; `request()`
 * asks the player. Browsers without the Permissions API for the camera (Firefox) start at
 * `prompt`.
 */
const useCameraAccess = () => {
  const [state, setState] = useState<CameraAccess>('checking');
  useEffect(() => {
    let status: PermissionStatus | undefined;
    let cancelled = false;
    const follow = () => {
      if (cancelled || status === undefined) return;
      // A granted permission is checked by opening the camera only when the player asks.
      setState(
        status.state === 'granted' ? 'granted' : status.state === 'denied' ? 'denied' : 'prompt',
      );
    };
    navigator.permissions
      .query({ name: 'camera' })
      .then((result) => {
        status = result;
        status.addEventListener('change', follow);
        follow();
      })
      .catch(() => {
        if (!cancelled) setState('prompt');
      });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', follow);
    };
  }, []);

  const request = async () => {
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      for (const track of stream.getTracks()) track.stop();
      setState('granted');
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      setState(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'denied');
    }
  };

  return { state, request };
};

const TEXT: Record<CameraAccess, string> = {
  checking: '',
  granted: '',
  prompt: 'Ve hře budete skenovat QR kódy. Povolte aplikaci přístup ke kameře.',
  requesting: 'Potvrďte přístup ke kameře v dotazu prohlížeče.',
  denied:
    'Prohlížeč přístup ke kameře nepovolil. Povolte ho v nastavení stránky (u adresy nahoře) a zkuste to znovu.',
  missing: 'Telefon nemá kameru, kterou by šlo použít. Bez ní se hrát nedá.',
};

/**
 * Shows `children` (the scanner) only once the camera may be used; until then a screen asks for
 * the permission, and the game does not go on without it. Used before the login scan, so a team
 * finds out at the start, not at the first place.
 */
export const CameraGate = ({ children }: { children: ReactNode }) => {
  const insecure = !window.isSecureContext || navigator.mediaDevices === undefined;
  const { state, request } = useCameraAccess();

  if (!insecure && state === 'granted') return children;
  if (!insecure && state === 'checking')
    return (
      <div className='flex flex-1 items-center justify-center'>
        <Loader2 className='size-6 animate-spin' />
      </div>
    );

  return (
    <div className='flex flex-1 flex-col items-center justify-center gap-6 text-center'>
      <Camera className='size-12' strokeWidth={1.5} />
      <div className='flex max-w-xs flex-col gap-2'>
        <h2 className='text-xl font-semibold'>Povolte přístup ke kameře</h2>
        <p className='text-muted-foreground'>
          {insecure
            ? 'Kamera funguje jen na zabezpečené adrese (https). Otevřete hru přes ni.'
            : TEXT[state]}
        </p>
      </div>
      {!insecure && state !== 'missing' && (
        <Button
          size='lg'
          className='h-14 w-full max-w-xs text-base'
          disabled={state === 'requesting'}
          onClick={() => void request()}
        >
          {state === 'requesting' ? <Loader2 className='animate-spin' /> : <Camera />}
          {state === 'denied' ? 'Zkusit znovu' : 'Povolit kameru'}
        </Button>
      )}
    </div>
  );
};
