import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { QrScannerView } from './qr-scanner';

export interface QrScannerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCode: (code: string) => void;
  readonly title?: string;
}

/** The scanner in a dialog, for the team's login code; the camera runs only while it is open. */
export const QrScannerDialog = ({
  open,
  onOpenChange,
  onCode,
  title = 'Naskenujte QR kód',
}: QrScannerDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className='sm:max-w-md'>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Namiřte fotoaparát na QR kód.</DialogDescription>
      </DialogHeader>
      {open && <QrScannerView onCode={onCode} />}
    </DialogContent>
  </Dialog>
);
