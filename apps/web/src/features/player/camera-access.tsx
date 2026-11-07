import { IconCamera, IconLoader2 } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ActionButton } from '@/components/action-button';

import { CameraHelp } from './camera-help';

type CameraAccess = 'checking' | 'prompt' | 'requesting' | 'granted' | 'denied' | 'missing';

/** Time the hardware gets to let go of the stream the permission check opened. */
const CAMERA_RELEASE_MS = 300;

/**
 * Whether the page may use the camera. The permission is read without asking and followed while
 * the page is open, so allowing it in the browser's settings is picked up at once; `request()`
 * asks the player. Browsers without the Permissions API for the camera (Firefox) start at
 * `prompt`.
 */
const useCameraAccess = () => {
  // Older iPhones have no Permissions API at all; they start at `prompt` like Firefox.
  const [state, setState] = useState<CameraAccess>(() =>
    navigator.permissions === undefined ? 'prompt' : 'checking',
  );
  useEffect(() => {
    // The status arrives asynchronously and the query cannot be aborted, so the cleanup has to
    // flag the effect as over and the listener has to find the status it was added to.
    let status: PermissionStatus | undefined;
    let cancelled = false;
    const follow = () => {
      if (cancelled || status === undefined) return;
      // A granted permission is checked by opening the camera only when the player asks.
      setState(
        status.state === 'granted' ? 'granted' : status.state === 'denied' ? 'denied' : 'prompt',
      );
    };
    const query = navigator.permissions?.query({ name: 'camera' });
    if (query === undefined) return undefined;
    query
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
      // Some Android phones free the camera a moment after the track ends; the scanner opening
      // it right away would be told it is in use by another app.
      await new Promise((resolve) => setTimeout(resolve, CAMERA_RELEASE_MS));
      setState('granted');
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      setState(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'denied');
    }
  };

  return { state, request };
};

const TEXT: Readonly<Record<CameraAccess, string>> = {
  checking: '',
  granted: '',
  prompt: 'Ve hře budete skenovat QR kódy. Povolte aplikaci přístup ke kameře.',
  requesting: 'Potvrďte přístup ke kameře v dotazu prohlížeče.',
  denied:
    'Prohlížeč přístup ke kameře nepovolil. Bez kamery se hrát nedá, povolte ji podle návodu.',
  missing: 'Telefon nemá kameru, kterou by šlo použít. Bez ní se hrát nedá.',
};

/**
 * Shows `children` (the scanner) only once the camera may be used; until then a screen asks for
 * the permission, and the game does not go on without it. Used before the login scan, so a team
 * finds out at the start, not at the first place.
 */
export const CameraGate = ({ children }: { readonly children: ReactNode }) => {
  const insecure = !window.isSecureContext || navigator.mediaDevices === undefined;
  const { state, request } = useCameraAccess();

  if (!insecure && state === 'granted') return children;
  if (!insecure && state === 'checking')
    return (
      <div className='flex flex-1 items-center justify-center'>
        <IconLoader2 className='size-6 animate-spin' />
      </div>
    );

  return (
    <div className='flex flex-1 flex-col items-center justify-center gap-6 text-center'>
      <IconCamera className='size-12' stroke={1.5} />
      <div className='flex max-w-xs flex-col gap-2 text-balance'>
        <h2 className='story-heading'>Povolte přístup ke kameře</h2>
        <p>
          {insecure
            ? 'Kamera funguje jen na zabezpečené adrese (https). Otevřete hru přes ni.'
            : TEXT[state]}
        </p>
      </div>
      {!insecure && state === 'denied' && (
        <div className='w-full max-w-sm'>
          <CameraHelp />
        </div>
      )}
      {!insecure && state !== 'missing' && (
        <ActionButton
          className='w-full max-w-xs'
          iconSide='start'
          icon={
            state === 'requesting' ? (
              <IconLoader2 className='size-5 animate-spin' />
            ) : (
              <IconCamera className='size-5' />
            )
          }
          disabled={state === 'requesting'}
          onClick={() => void request()}
        >
          {state === 'denied' ? 'Zkusit znovu' : 'Povolit kameru'}
        </ActionButton>
      )}
    </div>
  );
};
