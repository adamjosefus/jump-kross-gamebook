import type { PrintableCode } from '@gamebook/api';
import { FileImage, FileText, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { PaperFormat } from '@/components/qr/qr-pdf';
import {
  type Anamorphosis,
  DEFAULT_ANAMORPHOSIS,
  MAX_ANGLE,
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

import { fileName, saveBlob } from './download';

const SIDES: { value: ViewerSide; label: string }[] = [
  { value: 'bottom', label: 'U spodního okraje' },
  { value: 'top', label: 'U horního okraje' },
  { value: 'left', label: 'U levého okraje' },
  { value: 'right', label: 'U pravého okraje' },
];

const isSide = (value: string): value is ViewerSide => SIDES.some((side) => side.value === value);

const MAX_DISTANCE = 20;

/** Keeps the distance far enough for the angle, so the print never runs off to infinity. */
const withAngle = (current: Anamorphosis, angle: number): Anamorphosis => ({
  ...current,
  angle,
  distance: Math.max(current.distance, safeDistance(angle)),
});

/**
 * The code stretched for a viewer who sees it at an angle (on the floor, high on a wall): from
 * that spot it looks like an ordinary square code. Preview and downloads share one setting.
 */
export const WarpDialog = ({
  entry,
  open,
  onOpenChange,
}: {
  entry: PrintableCode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [view, setView] = useState(DEFAULT_ANAMORPHOSIS);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => warpedQr(entry.code, view), [entry.code, view]);
  const minDistance = safeDistance(view.angle);
  const suffix = `zkresleni-${view.angle}`;

  const downloadSvg = () =>
    saveBlob(
      new Blob([warpedQrSvg(entry.code, view)], { type: 'image/svg+xml' }),
      fileName(entry, 'svg', suffix),
    );
  const downloadPdf = async (format: PaperFormat) => {
    setBusy(true);
    try {
      const { warpedQrPdf } = await import('@/components/qr/qr-pdf');
      const pdf = await warpedQrPdf({
        kind: entry.kind,
        value: entry.code,
        label: entry.label,
        format,
        anamorphosis: view,
      });
      saveBlob(pdf, fileName(entry, 'pdf', `${suffix}-${format.toLowerCase()}`));
    } catch {
      toast.error('Soubor se nepodařilo vytvořit.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>QR kód se zkreslením</DialogTitle>
          <DialogDescription>
            Pro kód, na který se kouká šikmo, třeba na zemi nebo vysoko na zdi. Vytištěný vypadá
            natažený, z místa diváka jako obyčejný čtverec. Logo se do zkresleného kódu nevejde.
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 sm:grid-cols-[1fr_12rem]'>
          <div className='flex h-64 items-center justify-center rounded-lg border bg-white p-2'>
            <svg
              viewBox={`0 0 ${preview.width} ${preview.height}`}
              role='img'
              aria-label={`Zkreslený QR kód ${entry.code}`}
              className='max-h-full max-w-full'
              style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
            >
              <rect width={preview.width} height={preview.height} fill='#fff' />
              <path d={preview.path} fill='#000' />
            </svg>
          </div>

          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='warp-side'>Kde stojí divák</Label>
              <Select
                value={view.side}
                onValueChange={(side) => {
                  if (isSide(side)) setView({ ...view, side });
                }}
              >
                <SelectTrigger id='warp-side' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIDES.map((side) => (
                    <SelectItem key={side.value} value={side.value}>
                      {side.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='warp-angle'>Úhel od kolmice: {view.angle}°</Label>
              <input
                id='warp-angle'
                type='range'
                min={0}
                max={MAX_ANGLE}
                step={5}
                value={view.angle}
                onChange={(event) => setView(withAngle(view, Number(event.target.value)))}
                className='accent-foreground'
              />
              <p className='text-xs text-muted-foreground'>
                0° je pohled zpředu, 90° by byl z boku.
              </p>
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='warp-distance'>
                Vzdálenost oka: {String(view.distance).replace('.', ',')}× šířka kódu
              </Label>
              <input
                id='warp-distance'
                type='range'
                min={minDistance}
                max={MAX_DISTANCE}
                step={0.5}
                value={view.distance}
                onChange={(event) => setView({ ...view, distance: Number(event.target.value) })}
                className='accent-foreground'
              />
              <p className='text-xs text-muted-foreground'>
                Měří se od oka ke středu kódu. Šířka kódu je jeho šířka středem.
              </p>
            </div>
          </div>
        </div>

        <p className='text-sm text-muted-foreground'>{viewerHint(view)}</p>

        <DialogFooter className='gap-2'>
          <Button variant='outline' onClick={downloadSvg}>
            <FileImage /> SVG
          </Button>
          <Button variant='outline' onClick={() => void downloadPdf('A4')} disabled={busy}>
            {busy ? <Loader2 className='animate-spin' /> : <FileText />} PDF na A4
          </Button>
          <Button variant='outline' onClick={() => void downloadPdf('A5')} disabled={busy}>
            {busy ? <Loader2 className='animate-spin' /> : <FileText />} PDF na A5
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
