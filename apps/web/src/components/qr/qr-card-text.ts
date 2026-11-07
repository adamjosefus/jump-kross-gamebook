/** Kind of printed code: team login or one of the story's codes. */
export type QrCardKind = 'T' | 'L';

export interface QrCardText {
  readonly eyebrow: string;
  readonly title: string | undefined;
  readonly hint: string;
}

/** Wording of a card, shown on the on-screen card. */
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
