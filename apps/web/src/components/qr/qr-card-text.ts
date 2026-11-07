/** Kind of printed code: team login or one of the story's codes. */
export type QrCardKind = 'T' | 'L';

export interface QrCardText {
  readonly eyebrow: string;
  readonly title: string | undefined;
}

/** Wording of a card, shown on the on-screen card. */
export const qrCardText = (kind: QrCardKind, label?: string): QrCardText =>
  ({
    T: { eyebrow: 'Vstup do hry', title: label },
    L: { eyebrow: label ?? 'Kód příběhu', title: undefined },
  })[kind];
