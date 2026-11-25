import type { Meta, StoryObj } from '@storybook/react-vite';

import { ProgressQr, TeamLoginQr } from './qr-cards';
import { QrCode } from './qr-code';

const meta = {
  title: 'QR/Cards',
} satisfies Meta;

export default meta;

export const TeamLogin: StoryObj<typeof TeamLoginQr> = {
  render: (args) => <TeamLoginQr {...args} />,
  args: { value: 'T-12-K7QM3F', teamName: 'Vlci' },
};

export const Progress: StoryObj<typeof ProgressQr> = {
  render: (args) => <ProgressQr {...args} />,
  args: { value: 'L-32-9FZM7K', name: 'Studna na nádvoří' },
};

/** A station's code says small what it is for the organisers: the arrival or the reward. */
export const StationCode: StoryObj<typeof ProgressQr> = {
  render: (args) => <ProgressQr {...args} />,
  args: { value: 'L-6-9FZM7K', name: 'Pekařka', note: 'Odměna · Pekárna' },
};

export const CodeOnly: StoryObj<typeof QrCode> = {
  render: (args) => (
    <div className='w-64'>
      <QrCode {...args} />
    </div>
  ),
  args: { value: 'L-32-9FZM7K' },
};
