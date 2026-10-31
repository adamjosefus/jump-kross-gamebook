import { checkpoint, defineStory } from '@gamebook/core';

type State = {
  gold: number;
  hatColor: 'red' | 'blue';
};

/**
 * The gamebook. Every node is one step of the story: `blocks` are its screens (markdown, one
 * screen each, optionally with a `theme`), `choices` lead to other nodes. A `checkpoint` stops the
 * team until it scans the QR code of that location.
 */
export const story = defineStory<State>()({
  INTRO: {
    initialState: { gold: 100, hatColor: 'red' },
    blocks: [
      {
        theme: 'intro',
        content: `
          # Ztracený rukopis

          Vítejte v klášteře. Před vámi je den plný rozhodnutí — a každé z nich si příběh zapamatuje.
        `,
      },
    ],
    choices: [{ label: 'Začít', goto: 'A1' }],
  },

  A1: {
    blocks: (s) => [
      `Stojíte před branou kláštera. Brána je zamčená, ale vedle ní sedí **stařec** a prodává klíče. Máte u sebe ${s.gold} zlaťáků.`,
      { theme: 'letter', content: '„Klíč za dvacet. Levněji to nebude.“' },
    ],
    choices: [
      {
        label: 'Koupit klíč',
        goto: 'B1',
        nextState: (s) => ({ hatColor: 'blue', gold: s.gold - 20 }),
      },
      { label: 'Obejít zeď', goto: 'A2' },
    ],
  },

  A2: {
    blocks: [
      'Zeď je vysoká, ale u studny na nádvoří prý bývá průchod.',
      checkpoint(1, 'Vydejte se ke **studni na nádvoří**. Až tam budete, naskenujte QR kód.'),
      { theme: 'night', content: 'Ve stínu studny objevíte úzká dvířka. Vedou dovnitř.' },
    ],
    choices: [{ label: 'Pokračovat', goto: 'B1' }],
  },

  B1: {
    blocks: (s) => [
      `Pohodlně si nosil svoji ${s.hatColor === 'red' && s.gold >= 34 ? 'červenou čepici' : 'chudou pokrývku hlavy'}.`,
      'Ale pak najednou… se stalo něco nečekaného.',
    ],
    choices: [
      { label: 'Bojovat', goto: 'C1' },
      {
        label: 'Koupit meč',
        goto: 'C2',
        when: (s) => s.gold >= 90,
        nextState: (s) => ({ gold: s.gold - 90 }),
      },
    ],
  },

  C1: { end: true, blocks: ['Prohráli jste, ale příběh si vás pamatuje.'] },

  C2: { end: true, blocks: ['Vyhráli jste!'] },
});
