import { IconRotateClockwise } from '@tabler/icons-react';
import QrScanner from 'qr-scanner';
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

import { ScanFrame, type ScanPoint } from './scan-frame';

/**
 * Why the camera did not start, for the player. `qr-scanner` reports a denied permission as
 * „Camera not found“, so the permission is asked separately.
 */
const cameraProblem = async (error: unknown) => {
  if (!window.isSecureContext || navigator.mediaDevices === undefined) {
    return 'Kamera funguje jen na zabezpečené adrese (https).';
  }

  const permission = await navigator.permissions
    ?.query({ name: 'camera' })
    .then((status) => status.state)
    .catch(() => undefined);
  const name = error instanceof Error ? error.name : '';
  if (permission === 'denied' || name === 'NotAllowedError') {
    return 'Prohlížeč nepovolil přístup ke kameře. Povolte ho v nastavení stránky.';
  }

  if (name === 'NotReadableError') {
    return 'Kameru právě používá jiná aplikace. Zavřete ji.';
  }

  if (name === 'NotFoundError' || error === 'Camera not found.') {
    return 'Nenašla se žádná kamera.';
  }

  return 'Kameru se nepodařilo spustit.';
};

/** The same code read again within this time is ignored, so one code is not sent twice. */
const REPEAT_MS = 3000;

/**
 * A code is sent only after it stays in view this long, so the player can still change their
 * mind. Short, so a scan feels quick; a glance past a wrong code is still not enough to send it.
 */
const ARM_MS = 1000;

/**
 * How many frames a second the scanner reads. More frames find a code sooner after it comes into
 * view; the decoder runs in a worker, so the page stays smooth.
 */
const SCANS_PER_SECOND = 15;

/**
 * The camera the player last picked, kept for the next scan screens while the page is open. The
 * back one by default: codes are scanned on the spot, not held up to the player's face.
 */
let chosenCamera: QrScanner.FacingMode = 'environment';

/** How long the check mark over an accepted code shows before the game moves on. */
export const ACCEPTED_MS = 900;

/** How long the exclamation mark over a code that does not work stays before aiming again. */
const REJECTED_MS = 1600;

/**
 * What the game said to a sent code: `accepted` is shown with a check mark, `rejected` (the code
 * does not work, or could not be sent) with an exclamation mark. Nothing is shown when the game
 * handles the code in its own way, e.g. by asking first.
 */
export type ScanOutcome = 'accepted' | 'rejected' | undefined;

/**
 * A code not read for this long has left the view and is not sent. The scanner reads up to
 * `SCANS_PER_SECOND` times a second but misses some frames, e.g. when the camera moves.
 */
const LOST_MS = 800;

/** The picture shows once this many frames in a row came at the same size. */
const STEADY_FRAMES = 6;

/** Without frame callbacks, the picture shows this long after it started or last changed size. */
const STEADY_MS = 400;

/**
 * Calls `onSteady` once the camera's picture has settled. When the camera starts, iOS Safari paints
 * the video black and then a few frames boxed in the wrong aspect before the picture fills the
 * square, so the video is kept hidden until then. Returns a cleanup that cancels the wait.
 */
const whenSteady = (video: HTMLVideoElement, onSteady: () => void) => {
  let done = false;
  const finish = () => {
    if (done) {
      return;
    }

    done = true;
    onSteady();
  };

  // Old iPhones (before iOS 15.4) have no frame callbacks; the types claim every browser does.
  const frameCallbacks = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  if (frameCallbacks) {
    let size = '';
    let steadyFrames = 0;
    let handle = 0;
    const frame: VideoFrameRequestCallback = (_now, { width, height }) => {
      steadyFrames = `${width}×${height}` === size ? steadyFrames + 1 : 1;
      size = `${width}×${height}`;
      if (steadyFrames >= STEADY_FRAMES) {
        finish();
      } else if (!done) {
        handle = video.requestVideoFrameCallback(frame);
      }
    };

    handle = video.requestVideoFrameCallback(frame);
    return () => {
      done = true;
      video.cancelVideoFrameCallback(handle);
    };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = () => {
    clearTimeout(timer);
    timer = setTimeout(finish, STEADY_MS);
  };

  video.addEventListener('playing', wait);
  video.addEventListener('resize', wait);
  return () => {
    done = true;
    clearTimeout(timer);
    video.removeEventListener('playing', wait);
    video.removeEventListener('resize', wait);
  };
};

/**
 * Sizes the video element to the picture's own aspect, centered and overflowing the square on its
 * longer side. The square then never shows bars, even in the frames where Safari does not apply
 * `object-fit` yet, and on cameras that ignore the request for a square picture.
 */
const coverSquare = (video: HTMLVideoElement) => {
  const { videoWidth: width, videoHeight: height } = video;
  if (width === 0 || height === 0) {
    return;
  }

  video.style.width = width >= height ? `${(width / height) * 100}%` : '100%';
  video.style.height = width >= height ? '100%' : `${(height / width) * 100}%`;
};

/**
 * A point of the video picture in the camera square (0 to 1): the video covers the square, so its
 * shorter side fills it and the longer one is cut evenly. A mirrored video (a front camera) flips.
 */
const inSquare = (video: HTMLVideoElement, point: QrScanner.Point): ScanPoint => {
  const side = Math.min(video.videoWidth, video.videoHeight);
  const x = (point.x - (video.videoWidth - side) / 2) / side;
  return {
    x: video.style.transform.includes('scaleX(-1)') ? 1 - x : x,
    y: (point.y - (video.videoHeight - side) / 2) / side,
  };
};

/**
 * A filled camera with the arrows of turning around cut out of it. Tabler has the camera with the
 * arrows only as an outline; the paths are those of its `IconCameraRotate`.
 */
const CameraSwitchIcon = ({ className }: { readonly className?: string }) => {
  // Without the characters React may put in an id, which would break `url(#…)`.
  const mask = useId().replaceAll(/[^\w-]/g, '');
  return (
    <svg viewBox='0 0 24 24' className={className} aria-hidden='true'>
      <mask id={mask}>
        <rect width='24' height='24' fill='white' />
        <g fill='none' stroke='black' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M11.245 15.904a3 3 0 0 0 3.755 -2.904m-2.25 -2.905a3 3 0 0 0 -3.75 2.905' />
          <path d='M14 13h2v2' />
          <path d='M10 13h-2v-2' />
        </g>
      </mask>
      <path
        mask={`url(#${mask})`}
        fill='currentColor'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinejoin='round'
        d='M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2'
      />
    </svg>
  );
};

/**
 * Camera scanner (`qr-scanner`, works on iOS Safari which has no `BarcodeDetector`). The camera
 * runs while the component is mounted, so a wrong code can be followed by another one.
 */
const QrScannerView = ({
  onCode,
  disabled = false,
  header,
}: {
  readonly onCode: (code: string) => ScanOutcome | Promise<ScanOutcome>;
  /** Codes read meanwhile are ignored, e.g. while the last one is being sent. */
  readonly disabled?: boolean;
  /** Shown over the top of the camera. */
  readonly header: ReactNode;
}) => {
  const stage = useRef<HTMLDivElement>(null);
  const [cameraError, setCameraError] = useState<string>();
  const scanner = useRef<QrScanner>(undefined);
  const [camera, setCamera] = useState(chosenCamera);
  // The switch shows only on a phone or tablet with a back and a front camera, known once one runs.
  const [canSwitch, setCanSwitch] = useState(false);
  const [switching, setSwitching] = useState(false);
  const switchCamera = async () => {
    const next = camera === 'environment' ? 'user' : 'environment';
    chosenCamera = next;
    setCamera(next);
    setSwitching(true);
    try {
      await scanner.current?.setCamera(next);
    } finally {
      setSwitching(false);
    }
  };

  // A failed camera stays off until the player tries again.
  const failed = cameraError !== undefined;

  // A refused code is also held until it leaves the view: one the node does not accept would
  // otherwise be sent, and refused with a toast, every few seconds.
  const last = useRef<{ readonly code: string; readonly at: number; readonly untilLost: boolean }>(
    undefined,
  );
  // The code waiting to be sent, where the last read code is and when it was read.
  const [arming, setArming] = useState<string>();
  const [corners, setCorners] = useState<readonly ScanPoint[]>();
  // The last sent code from sending to its answer, until the scanner aims again.
  const [answer, setAnswer] = useState<'busy' | 'accepted' | 'rejected'>();
  const seenAt = useRef(0);
  const emit = useEffectEvent((code: string, found: readonly ScanPoint[]) => {
    const now = Date.now();
    seenAt.current = now;
    setCorners(found);
    if (disabled || answer !== undefined) {
      return;
    }

    if (
      last.current?.code === code &&
      (last.current.untilLost || now - last.current.at < REPEAT_MS)
    ) {
      return;
    }

    setArming(code);
  });
  const send = useEffectEvent(async (code: string) => {
    setArming(undefined);
    setAnswer('busy');
    const outcome = await Promise.resolve(onCode(code)).catch(() => 'rejected' as const);
    // Counted from the answer, so a code left in view is not sent again right away.
    last.current = { code, at: Date.now(), untilLost: outcome === 'rejected' };
    setAnswer(outcome);
  });

  // An exclamation mark stays a while, then the scanner aims again; a check mark stays until the
  // game moves on.
  useEffect(() => {
    if (answer !== 'rejected') {
      return undefined;
    }

    const timer = setTimeout(() => setAnswer(undefined), REJECTED_MS);
    return () => clearTimeout(timer);
  }, [answer]);

  // A code not read for a while has left the view: it is not sent and the shade lets it go.
  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - seenAt.current <= LOST_MS) {
        return;
      }

      setArming(undefined);
      setCorners(undefined);
      if (last.current?.untilLost === true) {
        last.current = { ...last.current, untilLost: false };
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // A code held in view for `ARM_MS` is sent.
  useEffect(() => {
    if (arming === undefined) {
      return undefined;
    }

    const timer = setTimeout(() => void send(arming), ARM_MS);
    return () => clearTimeout(timer);
  }, [arming]);

  // Nothing waits to be sent while the last code is.
  if (disabled && arming !== undefined) {
    setArming(undefined);
  }

  useEffect(() => {
    const container = stage.current;
    if (failed || container === null) {
      return undefined;
    }

    // Every scanner gets its own video: a destroyed scanner stops the stream in its video 300 ms
    // later, which in a shared one would be the next scanner's camera (React runs effects twice
    // in development, so that happens on every mount).
    const video = document.createElement('video');
    // Black and white, by CSS only; the scanner reads the stream, not the painted picture. Hidden
    // (not by `visibility`, which the library overrides) until the picture settles, then it fades
    // in over the gray square.
    video.className =
      'absolute top-1/2 left-1/2 size-full max-w-none -translate-1/2 object-cover grayscale contrast-125 opacity-0 transition-opacity duration-300 motion-reduce:transition-none';
    video.muted = true;
    video.playsInline = true;
    const fit = () => coverSquare(video);
    video.addEventListener('loadedmetadata', fit);
    video.addEventListener('resize', fit);
    // The library stops the camera while the page is hidden and opens it anew when the player
    // comes back (`emptied` marks the stop), so the picture is hidden and settles again each time.
    let stopWaiting = () => {};

    const hideUntilSteady = () => {
      stopWaiting();
      video.classList.add('opacity-0');
      stopWaiting = whenSteady(video, () => video.classList.remove('opacity-0'));
    };

    hideUntilSteady();
    video.addEventListener('emptied', hideUntilSteady);
    container.append(video);
    // The library is patched (patches/qr-scanner@1.4.2.patch) to read mirrored codes no more, to
    // always use its own decoder, as the browser's `BarcodeDetector` may read them, and to ask the
    // camera for a square picture like the square it is shown in.
    const instance = new QrScanner(
      video,
      (result) =>
        emit(
          result.data,
          result.cornerPoints.map((point) => inSquare(video, point)),
        ),
      {
        returnDetailedScanResult: true,
        preferredCamera: chosenCamera,
        maxScansPerSecond: SCANS_PER_SECOND,
      },
    );
    scanner.current = instance;
    // A scanner torn down meanwhile (React runs effects twice in development) must not report;
    // `start()` cannot be aborted, so the cleanup flags it instead.
    let current = true;
    instance.start().then(
      async () => {
        // Only a camera that tells which way it faces sits on a phone or tablet with a back and
        // a front one. A laptop's webcam tells nothing; there the switch would only open the
        // same camera again, mirrored, and a virtual camera (e.g. the iPhone's Continuity
        // Camera or a video call app) would count as a second one.
        const stream = video.srcObject instanceof MediaStream ? video.srcObject : undefined;
        const facing = stream?.getVideoTracks()[0]?.getSettings().facingMode;
        // The full list is known only once the camera is allowed, i.e. now. A failed listing
        // only hides the switch; the camera itself runs.
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        const cameras = devices.filter((device) => device.kind === 'videoinput');
        if (current) {
          setCanSwitch((facing === 'environment' || facing === 'user') && cameras.length > 1);
        }
      },
      async (error: unknown) => {
        const message = await cameraProblem(error);
        if (current) {
          setCameraError(message);
        }
      },
    );
    return () => {
      current = false;
      video.removeEventListener('emptied', hideUntilSteady);
      stopWaiting();
      video.removeEventListener('loadedmetadata', fit);
      video.removeEventListener('resize', fit);
      instance.destroy();
      if (scanner.current === instance) {
        scanner.current = undefined;
      }

      container.replaceChildren();
    };
  }, [failed]);

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex flex-col gap-2'>{header}</div>
      {/* Where the column fills the player's screen (a phone held upright, also in the admin's
          phone preview) the camera reaches past its padding to the screen's edges. The screen's
          own width decides, not the browser window's. */}
      <div className='flex flex-1 items-center justify-center py-6 @max-xl/player:-mr-(--safe-area-padding-right) @max-xl/player:-ml-(--safe-area-padding-left)'>
        {/* Square across the column, capped by the height on a low screen. There it falls short
            of the edges, so it is square-cornered only when it spans the whole width (100cqw, the
            player's screen): the radius is 0 once 65dvh reaches that width. */}
        <div className='relative flex aspect-square w-full max-w-[65dvh] items-center justify-center overflow-hidden rounded-xl bg-muted @max-xl/player:rounded-[clamp(0px,(100cqw_-_65dvh)_*_100,var(--radius-xl))]'>
          <div ref={stage} className='absolute inset-0' />
          {cameraError === undefined ? (
            <ScanFrame
              state={answer ?? (disabled ? 'busy' : arming === undefined ? 'aiming' : 'arming')}
              armMs={ARM_MS}
              corners={corners}
            />
          ) : (
            <div className='relative mx-auto flex max-w-xs flex-col items-center gap-3 px-4 text-center text-balance'>
              <p>{cameraError}</p>
              <Button variant='secondary' onClick={() => setCameraError(undefined)}>
                <IconRotateClockwise /> Zkusit znovu
              </Button>
            </div>
          )}
          {cameraError === undefined && canSwitch && (
            <Button
              variant='secondary'
              size='icon-lg'
              className='absolute right-3 bottom-3 size-11 rounded-full shadow-md'
              aria-label={
                camera === 'environment' ? 'Přepnout na přední kameru' : 'Přepnout na zadní kameru'
              }
              disabled={switching}
              onClick={() => void switchCamera()}
            >
              <CameraSwitchIcon className='size-5' />
            </Button>
          )}
          <span className='sr-only' role='status'>
            {answer === 'accepted'
              ? 'Kód přijat.'
              : answer === 'rejected'
                ? 'Tento kód tady nefunguje.'
                : answer === 'busy' || disabled
                  ? 'Načítání…'
                  : ''}
          </span>
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
  readonly onCode: (code: string) => ScanOutcome | Promise<ScanOutcome>;
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
