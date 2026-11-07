import type { PrintableCode } from '@gamebook/api';
import { IconCheck, IconCopy, IconDownload, IconLoader2 } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { QrCode } from '@/components/qr/qr-code';
import {
  type NoiseShape,
  type QrStyle,
  type QrSvgOptions,
  QUIET_ZONE,
  qrCodeSvg,
} from '@/components/qr/qr-svg';
import {
  type Anamorphosis,
  DEFAULT_ANAMORPHOSIS,
  MAX_ANGLE,
  qrExtent,
  safeDistance,
  type ViewerSide,
  viewerHint,
  warpedQr,
  warpedQrSvg,
} from '@/components/qr/qr-warp';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { copySvg, fileName, saveBlob } from './download';

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

const SIDES: readonly Option<ViewerSide>[] = [
  { value: 'bottom', label: 'U spodního okraje' },
  { value: 'top', label: 'U horního okraje' },
  { value: 'left', label: 'U levého okraje' },
  { value: 'right', label: 'U pravého okraje' },
] as const;

const isSide = (value: string): value is ViewerSide => SIDES.some((side) => side.value === value);

/** The viewer's side in a file name. */
const SIDE_SLUG: Readonly<Record<ViewerSide, string>> = {
  bottom: 'zdola',
  top: 'shora',
  left: 'zleva',
  right: 'zprava',
} as const;

const MAX_DISTANCE = 20;

const NOISE_SHAPES: readonly Option<NoiseShape>[] = [
  { value: 'square', label: 'Čtverec' },
  { value: 'circle', label: 'Kruh' },
] as const;

const MAX_NOISE = 24;

/**
 * Narrowest white margin offered. Measured with the browser's QR reader on blurred, tiny, rotated
 * and angled shots: with noise, a margin of 1 module read as well as 4, while 0 failed clearly more.
 */
const MIN_QUIET_ZONE = 1;

/** Segmented control: one of a few options as a row of buttons. */
const Segmented = <T extends string>({
  value,
  options,
  onChange,
}: {
  readonly value: T;
  readonly options: readonly Option<T>[];
  readonly onChange: (value: T) => void;
}) => (
  <div className='flex rounded-lg border p-0.5'>
    {options.map((option) => (
      <Button
        key={option.value}
        variant={option.value === value ? 'secondary' : 'ghost'}
        size='sm'
        className='flex-1'
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </Button>
    ))}
  </div>
);

const Checkbox = ({
  checked,
  onChange,
  children,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children: React.ReactNode;
}) => (
  <label className='flex items-center gap-2 text-sm'>
    <input
      type='checkbox'
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className='size-4 accent-foreground'
    />
    {children}
  </label>
);

/**
 * Every way to get a QR code out as SVG, in one place: copy or download, optionally with noise
 * around it and mirrored and stretched for an angled view (anamorphosis).
 */
export const ExportDialog = ({
  entry,
  open,
  onOpenChange,
}: {
  readonly entry: PrintableCode;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) => {
  const [warp, setWarp] = useState(false);
  const [view, setView] = useState(DEFAULT_ANAMORPHOSIS);
  const [noiseOn, setNoiseOn] = useState(false);
  const [noiseShape, setNoiseShape] = useState<NoiseShape>('square');
  const [noiseWidth, setNoiseWidth] = useState(8);
  const [quietZone, setQuietZone] = useState(QUIET_ZONE);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // The margin can only be narrowed together with noise; a plain code keeps the standard one.
  const style = useMemo<QrStyle | undefined>(
    () => (noiseOn ? { noise: { shape: noiseShape, width: noiseWidth }, quietZone } : undefined),
    [noiseOn, noiseShape, noiseWidth, quietZone],
  );
  const noise = style?.noise;
  // The noise reaches further from the eye than the code, so it sets how close the eye may be.
  const extent = useMemo(() => qrExtent(entry.code, style), [entry.code, style]);
  const closest = safeDistance(view.angle, extent);
  const effective = useMemo<Anamorphosis>(
    () => ({
      ...view,
      angle: warp ? view.angle : 0,
      distance: Math.max(view.distance, safeDistance(view.angle, extent)),
    }),
    [view, warp, extent],
  );
  const modified = effective.angle > 0 || view.mirrorX || view.mirrorY;
  const preview = useMemo(
    () => (modified ? warpedQr(entry.code, effective, style) : undefined),
    [entry.code, effective, modified, style],
  );

  const suffix = [
    noise !== undefined && `sum-${noise.shape === 'circle' ? 'kruh' : 'ctverec'}-${noise.width}`,
    style !== undefined && quietZone !== QUIET_ZONE && `okraj-${quietZone}`,
    // The side and the distance change the picture as much as the angle does.
    effective.angle > 0 &&
      `zkresleni-${effective.angle}-${SIDE_SLUG[view.side]}-${String(effective.distance).replace('.', '_')}x`,
    view.mirrorX && 'zrcadlo-vodorovne',
    view.mirrorY && 'zrcadlo-svisle',
  ]
    .filter(Boolean)
    .join('-');

  const svg = async (options?: QrSvgOptions) =>
    modified
      ? warpedQrSvg(entry.code, effective, style, options)
      : qrCodeSvg(entry.code, style, options);

  const run = async (task: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await task();
    } catch {
      toast.error(failure);
    } finally {
      setBusy(false);
    }
  };

  const download = () =>
    run(async () => {
      saveBlob(new Blob([await svg()], { type: 'image/svg+xml' }), fileName(entry, 'svg', suffix));
    }, 'Soubor se nepodařilo vytvořit.');

  const copy = () =>
    run(async () => {
      // Pasted into a design, only the dark shapes are wanted; the file keeps its white background.
      await copySvg(await svg({ background: false }));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, 'Kopírování se nepovedlo. Povolte prohlížeči přístup ke schránce.');

  const copyText = () => {
    navigator.clipboard.writeText(entry.code).then(
      () => toast.success(`Zkopírováno: ${entry.code}`),
      () => toast.error('Kód se nepodařilo zkopírovat.'),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Exportovat {entry.label}</DialogTitle>
          {/* The code's text, to type it in when testing without a camera. */}
          <DialogDescription className='flex items-center gap-1 font-mono'>
            {entry.code}
            <Button
              variant='ghost'
              size='icon-xs'
              title='Zkopírovat text kódu'
              aria-label={`Zkopírovat text kódu ${entry.code}`}
              onClick={copyText}
            >
              <IconCopy />
            </Button>
          </DialogDescription>
        </DialogHeader>

        {/* A fixed height on wider screens, so the dialog keeps its size whatever is checked: the
          options scroll inside it and the hint under the preview has its own reserved space. */}
        <div className='grid gap-6 sm:h-[30rem] sm:grid-cols-[1fr_16rem] sm:grid-rows-[minmax(0,1fr)]'>
          <div className='flex min-h-0 flex-col gap-3'>
            <div className='flex h-72 items-center justify-center rounded-lg border bg-white p-4 sm:h-auto sm:min-h-0 sm:flex-1'>
              {preview === undefined ? (
                <QrCode value={entry.code} style={style} className='max-h-full w-auto' />
              ) : (
                <svg
                  viewBox={`0 0 ${preview.width} ${preview.height}`}
                  role='img'
                  aria-label={`Upravený QR kód ${entry.code}`}
                  className='max-h-full max-w-full'
                  style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
                >
                  <rect width={preview.width} height={preview.height} fill='#fff' />
                  <path d={preview.path} fill='#000' />
                </svg>
              )}
            </div>
            <p className='text-sm text-muted-foreground sm:min-h-[4lh]'>
              {modified ? viewerHint(effective) : null}
            </p>
          </div>

          <div className='-mr-2 flex min-h-0 flex-col gap-5 pr-2 sm:overflow-y-auto'>
            <div className='flex flex-col gap-3'>
              <Checkbox checked={noiseOn} onChange={setNoiseOn}>
                Šum kolem kódu
              </Checkbox>
              {noiseOn && (
                <div className='flex flex-col gap-3 border-l-2 pl-3'>
                  <Segmented value={noiseShape} options={NOISE_SHAPES} onChange={setNoiseShape} />
                  <div className='flex flex-col gap-1.5'>
                    <Label htmlFor='export-noise'>Šířka šumu: {noiseWidth} modulů</Label>
                    <input
                      id='export-noise'
                      type='range'
                      min={1}
                      max={MAX_NOISE}
                      step={1}
                      value={noiseWidth}
                      onChange={(event) => setNoiseWidth(Number(event.target.value))}
                      className='accent-foreground'
                    />
                    <p className='text-xs text-muted-foreground'>
                      Náhodné čtverečky ztíží čtení okem, čtečka je ignoruje.
                    </p>
                  </div>
                  <div className='flex flex-col gap-1.5'>
                    <Label htmlFor='export-quiet-zone'>
                      Bílý okraj: {quietZone} {quietZone === 1 ? 'modul' : 'moduly'}
                    </Label>
                    <input
                      id='export-quiet-zone'
                      type='range'
                      min={MIN_QUIET_ZONE}
                      max={QUIET_ZONE}
                      step={1}
                      value={quietZone}
                      onChange={(event) => setQuietZone(Number(event.target.value))}
                      className='accent-foreground'
                    />
                    <p className='text-xs text-muted-foreground'>
                      Odděluje kód od šumu. Norma chce 4 moduly. Čtečce Apple (jako ve fotoaparátu
                      iPhonu) stačil v testu i 1 modul; jiné čtečky ověřené nejsou a pod 2 moduly s
                      nimi může být problém.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className='flex flex-col gap-3'>
              <Checkbox checked={warp} onChange={setWarp}>
                Zkreslit pro šikmý pohled
              </Checkbox>
              {warp && (
                <div className='flex flex-col gap-3 border-l-2 pl-3'>
                  <Select
                    value={view.side}
                    onValueChange={(side) => {
                      if (isSide(side)) setView({ ...view, side });
                    }}
                  >
                    <SelectTrigger size='sm' className='w-full' aria-label='Kde stojí divák'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SIDES.map((side) => (
                        <SelectItem key={side.value} value={side.value}>
                          Divák {side.label.toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className='flex flex-col gap-1.5'>
                    <Label htmlFor='export-angle'>Úhel od kolmice: {view.angle}°</Label>
                    <input
                      id='export-angle'
                      type='range'
                      min={5}
                      max={MAX_ANGLE}
                      step={5}
                      value={view.angle}
                      onChange={(event) => setView({ ...view, angle: Number(event.target.value) })}
                      className='accent-foreground'
                    />
                  </div>
                  <div className='flex flex-col gap-1.5'>
                    <Label htmlFor='export-distance'>
                      Vzdálenost oka: {String(effective.distance).replace('.', ',')}× šířka kódu
                    </Label>
                    <input
                      id='export-distance'
                      type='range'
                      min={closest}
                      max={MAX_DISTANCE}
                      step={0.5}
                      value={effective.distance}
                      onChange={(event) =>
                        setView({ ...view, distance: Number(event.target.value) })
                      }
                      className='accent-foreground'
                    />
                  </div>
                </div>
              )}
            </div>

            <fieldset className='flex flex-col gap-2'>
              <legend className='mb-2 text-sm leading-none font-medium'>Zrcadlit</legend>
              {/* One axis at most: both together are only a 180° turn, not a mirror image. */}
              <Checkbox
                checked={view.mirrorX}
                onChange={(mirrorX) =>
                  setView({ ...view, mirrorX, mirrorY: view.mirrorY && !mirrorX })
                }
              >
                Vodorovně (levá ↔ pravá)
              </Checkbox>
              <Checkbox
                checked={view.mirrorY}
                onChange={(mirrorY) =>
                  setView({ ...view, mirrorY, mirrorX: view.mirrorX && !mirrorY })
                }
              >
                Svisle (horní ↔ dolní)
              </Checkbox>
            </fieldset>
          </div>
        </div>

        <DialogFooter className='gap-2'>
          <Button
            variant='outline'
            onClick={() => void copy()}
            disabled={busy}
            title='Zkopírovat SVG bez bílého pozadí do schránky'
          >
            {copied ? <IconCheck /> : <IconCopy />} {copied ? 'Zkopírováno' : 'Kopírovat SVG'}
          </Button>
          <Button onClick={() => void download()} disabled={busy}>
            {busy ? <IconLoader2 className='animate-spin' /> : <IconDownload />} Stáhnout SVG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
