import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { Draft } from './draft';
import { FocusDialog } from './focus-dialog';
import { startTrail, type FocusTrail } from './focus-trail';
import { SAMPLE_DRAFT } from './sample-draft';

/** The dialog over the sample draft; the way walked and the edits are kept in the story. */
const Walking = ({ start }: { readonly start: string }) => {
  const [draft, setDraft] = useState<Draft>(SAMPLE_DRAFT);
  const [trail, setTrail] = useState<FocusTrail | undefined>(startTrail(start));
  return (
    <>
      <button
        type='button'
        className='rounded-md border px-3 py-1.5 text-sm'
        onClick={() => {
          setTrail(startTrail(start));
        }}
      >
        Otevřít detail
      </button>
      <FocusDialog draft={draft} trail={trail} onTrail={setTrail} onChange={setDraft} />
    </>
  );
};

const meta = {
  title: 'Editor/Detail v dialogu',
  component: Walking,
} satisfies Meta<typeof Walking>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opened from the canvas: no way back yet; opening a choice's node brings the „Zpět“ button. */
export const Opened: Story = {
  name: 'Otevřený z plátna',
  args: { start: 'cesta_domu' },
};
