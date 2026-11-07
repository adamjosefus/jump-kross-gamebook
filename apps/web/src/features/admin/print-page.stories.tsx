import type { Meta, StoryObj } from '@storybook/react-vite';

import { CodeList } from './print-page';

const meta = {
  title: 'Admin/QR kódy',
  component: CodeList,
  args: {
    codes: [
      {
        kind: 'T',
        id: 1,
        label: 'Klan I',
        code: 'T-1-K7QM3F',
        scanTexts: ['Naskenujte kód svého klanu.'],
      },
      {
        kind: 'T',
        id: 2,
        label: 'Klan II',
        code: 'T-2-P4XW8D',
        scanTexts: ['Naskenujte kód svého klanu.'],
      },
      {
        kind: 'T',
        id: 3,
        label: 'Klan III',
        code: 'T-3-H2NV6R',
        scanTexts: ['Naskenujte kód svého klanu.'],
      },
      { kind: 'L', id: 31, label: 'Starý mlýn', code: 'L-31-B8TC2K', scanTexts: [] },
      {
        kind: 'L',
        id: 32,
        label: 'Studna na nádvoří',
        code: 'L-32-9FZM7K',
        scanTexts: ['Kód visí na rumpálu studny.'],
      },
      {
        kind: 'L',
        id: 33,
        label: 'Kaple u lesa',
        code: 'L-33-Q6JD4S',
        scanTexts: ['Hledejte u dveří kaple.', 'Kód je na zadní straně kaple.'],
      },
    ],
  },
} satisfies Meta<typeof CodeList>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
