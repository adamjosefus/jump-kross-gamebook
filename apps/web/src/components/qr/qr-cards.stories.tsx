import type { Meta, StoryObj } from '@storybook/react-vite';

import logo from '@/assets/qr-logo.svg';

import { EndQr, ProgressQr, TeamLoginQr } from './qr-cards';
import { QrCode } from './qr-code';

const meta = {
  title: 'QR/Cards',
  args: { logo },
} satisfies Meta;

export default meta;

export const TeamLogin: StoryObj<typeof TeamLoginQr> = {
  render: (args) => <TeamLoginQr {...args} />,
  args: { value: 'T:12:K7QM', teamName: 'Vlci' },
};

export const Progress: StoryObj<typeof ProgressQr> = {
  render: (args) => <ProgressQr {...args} />,
  args: { value: 'L:32:9FZM', locationName: 'Studna na nádvoří' },
};

export const End: StoryObj<typeof EndQr> = {
  render: (args) => <EndQr {...args} />,
  args: { value: 'E:1:3XW0' },
};

export const WithoutLogo: StoryObj<typeof ProgressQr> = {
  render: (args) => <ProgressQr {...args} />,
  args: { value: 'L:32:9FZM', locationName: 'Studna na nádvoří', logo: undefined },
};

export const CodeOnly: StoryObj<typeof QrCode> = {
  render: (args) => (
    <div className='w-64'>
      <QrCode {...args} />
    </div>
  ),
  args: { value: 'L:32:9FZM', logo },
};
