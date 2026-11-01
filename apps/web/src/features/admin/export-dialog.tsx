import type { PrintableCode } from '@gamebook/api';
import { Check, Copy, Download, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { QrCode } from '@/components/qr/qr-code';
import type { PaperFormat } from '@/components/qr/qr-pdf';
import { type NoiseShape, type QrStyle, QUIET_ZONE, qrCodeSvg } from '@/components/qr/qr-svg';
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

type Format = 'svg' | PaperFormat;

const FORMATS: { value: Format; label: string }[] = [
  { value: 'svg', label: 'SVG' },
  { value: 'A4', label: 'PDF A4' },
  { value: 'A5', label: 'PDF A5' },
];

const SIDES: { value: ViewerSide; label: string }[] = [
  { value: 'bottom', label: 'U spodního okraje' },
  { value: 'top', label: 'U horního okraje' },
  { value: 'left', label: 'U levého okraje' },
  { value: 'right', label: 'U pravého okraje' },
];

const isSide = (value: string): value is ViewerSide => SIDES.some((side) => side.value === value);

const MAX_DISTANCE = 20;

const NOISE_SHAPES: { value: NoiseShape; label: string }[] = [
  { value: 'square', label: 'Čtverec' },
  { value: 'circle', label: 'Kruh' },
];

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
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
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
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
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
 * Every way to get a QR code out, in one place: format (SVG, PDF on A4 or A5), copy or download,
 * and optionally mirrored and stretched for an angled view (anamorphosis). The PDF of an unmodified
 * code is the full card; a modified one is the bare code with a note for the organisers.
 */
export const ExportDialog = ({
  entry,
  open,
  onOpenChange,
}: {
  entry: PrintableCode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [format, setFormat] = useState<Format>('svg');
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
    effective.angle > 0 && `zkresleni-${effective.angle}`,
    view.mirrorX && 'zrcadlo-vodorovne',
    view.mirrorY && 'zrcadlo-svisle',
  ]
    .filter(Boolean)
    .join('-');

  const svg = async () =>
    modified ? warpedQrSvg(entry.code, effective, style) : qrCodeSvg(entry.code, style);

  const pdf = async (paper: PaperFormat) => {
    // pdf-lib and the fonts are loaded only when someone actually asks for a PDF.
    const { qrCardPdf, warpedQrPdf } = await import('@/components/qr/qr-pdf');
    const common = {
      kind: entry.kind,
      value: entry.code,
      label: entry.label,
      format: paper,
      style,
    };
    return modified ? warpedQrPdf({ ...common, anamorphosis: effective }) : qrCardPdf(common);
  };

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
      if (format === 'svg') {
        saveBlob(
          new Blob([await svg()], { type: 'image/svg+xml' }),
          fileName(entry, 'svg', suffix),
        );
      } else {
        const name = fileName(
          entry,
          'pdf',
          [suffix, format.toLowerCase()].filter(Boolean).join('-'),
        );
        saveBlob(await pdf(format), name);
      }
    }, 'Soubor se nepodařilo vytvořit.');

  const copy = () =>
    run(async () => {
      await copySvg(await svg());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, 'Kopírování se nepovedlo. Povolte prohlížeči přístup ke schránce.');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Stáhnout {entry.label}</DialogTitle>
          <DialogDescription className='font-mono'>{entry.code}</DialogDescription>
        </DialogHeader>

        <div className='grid gap-6 sm:grid-cols-[1fr_16rem]'>
          <div className='flex h-72 items-center justify-center rounded-lg border bg-white p-4'>
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

          <div className='flex flex-col gap-5'>
            <div className='flex flex-col gap-2'>
              <Label>Formát</Label>
              <Segmented value={format} options={FORMATS} onChange={setFormat} />
              <p className='text-xs text-muted-foreground'>
                {format === 'svg'
                  ? 'Samotný kód.'
                  : modified
                    ? 'Upravený kód přes celou stránku, pod ním poznámka pro organizátory.'
                    : 'Celá karta s názvem a nápovědou, jako na obrazovce.'}
              </p>
            </div>

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
              <Checkbox
                checked={view.mirrorX}
                onChange={(mirrorX) => setView({ ...view, mirrorX })}
              >
                Vodorovně (levá ↔ pravá)
              </Checkbox>
              <Checkbox
                checked={view.mirrorY}
                onChange={(mirrorY) => setView({ ...view, mirrorY })}
              >
                Svisle (horní ↔ dolní)
              </Checkbox>
            </fieldset>
          </div>
        </div>

        {modified && <p className='text-sm text-muted-foreground'>{viewerHint(effective)}</p>}

        <DialogFooter className='gap-2'>
          <Button
            variant='outline'
            onClick={() => void copy()}
            disabled={busy || format !== 'svg'}
            title={format === 'svg' ? 'Zkopírovat SVG do schránky' : 'Kopírovat jde jen SVG'}
          >
            {copied ? <Check /> : <Copy />} {copied ? 'Zkopírováno' : 'Kopírovat'}
          </Button>
          <Button onClick={() => void download()} disabled={busy}>
            {busy ? <Loader2 className='animate-spin' /> : <Download />} Stáhnout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
