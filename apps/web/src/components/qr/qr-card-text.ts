/** Kind of printed code: team login or a location. */
export type QrCardKind = 'T' | 'L';

export interface QrCardText {
  readonly eyebrow: string;
  readonly title: string | undefined;
  readonly hint: string;
}

/** Wording of a card, shared by the on-screen card and the PDF export. */
export const qrCardText = (kind: QrCardKind, label?: string): QrCardText =>
  ({
    T: {
      eyebrow: 'Vstup do hry',
      title: label,
      hint: 'Naskenujte v aplikaci pro přihlášení týmu.',
    },
    L: {
      eyebrow: label ?? 'Stanoviště',
      title: undefined,
      hint: 'Naskenujte v aplikaci a pokračujte v příběhu.',
    },
  })[kind];
