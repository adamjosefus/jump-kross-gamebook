import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { SlideButton } from './slide-button';

const meta = {
  title: 'Player/SlideButton',
  component: SlideButton,
  decorators: [
    (Story) => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: { children: 'Vstoupit do mlýna', onConfirm: () => {} },
} satisfies Meta<typeof SlideButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongLabel: Story = {
  args: { children: 'Zvednout uvolněnou desku v podlaze a podívat se, co je pod ní' },
};

export const Disabled: Story = { args: { disabled: true } };

const SendingDemo = ({ children }: { children: string }) => {
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  return (
    <div className='flex flex-col gap-3'>
      <SlideButton
        disabled={busy}
        onConfirm={() => {
          setBusy(true);
          setTimeout(() => {
            setBusy(false);
            setCount((n) => n + 1);
          }, 1000);
        }}
      >
        {children}
      </SlideButton>
      <p className='text-sm text-muted-foreground'>Potvrzeno: {count}×</p>
    </div>
  );
};

/** Confirming sends the move for a second; the thumb waits at the end and then returns. */
export const Sending: Story = {
  render: () => <SendingDemo>Vstoupit do mlýna</SendingDemo>,
};

export const Choices: Story = {
  render: () => (
    <div className='flex flex-col gap-3'>
      <SlideButton onConfirm={() => {}}>Jít potmě dál</SlideButton>
      <SlideButton onConfirm={() => {}}>Počkat na ráno</SlideButton>
    </div>
  ),
};
