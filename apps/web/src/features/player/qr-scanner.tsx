import { IconRotateClockwise } from '@tabler/icons-react';
import QrScanner from 'qr-scanner';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

import { ScanFrame, type ScanPoint } from './scan-frame';

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
 * 8 times a second but misses some frames, e.g. when the camera moves.
 */
const LOST_MS = 800;

/** The picture shows once this many frames in a row came at the same size. */
const STEADY_FRAMES = 6;

/** Without frame callbacks, the picture shows this long after it started or last changed size. */
const STEADY_MS = 400;

/**
 * Calls `then` once the camera's picture has settled. On first start iOS Safari paints the video
 * black and then a few frames boxed in the wrong aspect before the picture fills the square, so
 * the video is kept hidden until then. Returns a cleanup that cancels the wait.
 */
const whenSteady = (video: HTMLVideoElement, then: () => void) => {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    then();
  };
  // Old iPhones (before iOS 15.4) have no frame callbacks; the types claim every browser does.
  const frameCallbacks = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  if (frameCallbacks) {
    let size = '';
    let same = 0;
    let handle = 0;
    const frame: VideoFrameRequestCallback = (_now, { width, height }) => {
      same = `${width}×${height}` === size ? same + 1 : 0;
      size = `${width}×${height}`;
      if (same + 1 >= STEADY_FRAMES) finish();
      else if (!done) handle = video.requestVideoFrameCallback(frame);
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
 * `object-fit` yet.
 */
const coverSquare = (video: HTMLVideoElement) => {
  const { videoWidth: width, videoHeight: height } = video;
  if (width === 0 || height === 0) return;
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
    if (disabled || answer !== undefined) return;
    if (
      last.current?.code === code &&
      (last.current.untilLost || now - last.current.at < REPEAT_MS)
    )
      return;
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
    if (answer !== 'rejected') return undefined;
    const timer = setTimeout(() => setAnswer(undefined), REJECTED_MS);
    return () => clearTimeout(timer);
  }, [answer]);

  // A code not read for a while has left the view: it is not sent and the shade lets it go.
  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - seenAt.current <= LOST_MS) return;
      setArming(undefined);
      setCorners(undefined);
      if (last.current?.untilLost === true) last.current = { ...last.current, untilLost: false };
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // A code held in view for `ARM_MS` is sent.
  useEffect(() => {
    if (arming === undefined) return undefined;
    const timer = setTimeout(() => void send(arming), ARM_MS);
    return () => clearTimeout(timer);
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
    const stopWaiting = whenSteady(video, () => video.classList.remove('opacity-0'));
    container.append(video);
    // The library is patched (patches/qr-scanner@1.4.2.patch) to read mirrored codes no more and
    // to always use its own decoder, as the browser's `BarcodeDetector` may read them.
    const scanner = new QrScanner(
      video,
      (result) =>
        emit(
          result.data,
          result.cornerPoints.map((point) => inSquare(video, point)),
        ),
      {
        returnDetailedScanResult: true,
        preferredCamera: 'environment',
        maxScansPerSecond: 8,
      },
    );
    // A scanner torn down meanwhile (React runs effects twice in development) must not report;
    // `start()` cannot be aborted, so the cleanup flags it instead.
    let current = true;
    scanner.start().catch(async (error: unknown) => {
      const message = await cameraProblem(error);
      if (current) setCameraError(message);
    });
    return () => {
      current = false;
      stopWaiting();
      video.removeEventListener('loadedmetadata', fit);
      video.removeEventListener('resize', fit);
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
