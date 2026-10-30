import type { Meta, StoryObj } from '@storybook/react-vite'
import logo from '@/assets/qr-logo.svg'
import { QrCode } from './qr-code'
import { EndQr, ProgressQr, TeamLoginQr } from './qr-cards'

const meta = {
  title: 'QR/Cards',
  args: { logo },
} satisfies Meta

export default meta

export const TeamLogin: StoryObj<typeof TeamLoginQr> = {
  render: (args) => <TeamLoginQr {...args} />,
  args: { value: 'T:12:K7QM', teamName: 'Vlci' },
}

export const Progress: StoryObj<typeof ProgressQr> = {
  render: (args) => <ProgressQr {...args} />,
  args: { value: 'L:32:9FZM', locationName: 'Studna na nádvoří' },
}

export const End: StoryObj<typeof EndQr> = {
  render: (args) => <EndQr {...args} />,
  args: { value: 'E:1:3XW0' },
}

export const WithoutLogo: StoryObj<typeof ProgressQr> = {
  render: (args) => <ProgressQr {...args} />,
  args: { value: 'L:32:9FZM', locationName: 'Studna na nádvoří', logo: undefined },
}

/** Sheet as it comes out of the printer: cards flow into columns on A4. */
export const PrintSheet: StoryObj = {
  render: () => (
    <div className='flex w-[21cm] flex-wrap gap-4 bg-white p-[1cm]'>
      <TeamLoginQr value='T:1:4NQ2' teamName='Vlci' logo={logo} />
      <TeamLoginQr value='T:2:Z81C' teamName='Sokoli' logo={logo} />
      <ProgressQr value='L:32:9FZM' locationName='Studna' logo={logo} />
      <EndQr value='E:1:3XW0' logo={logo} />
    </div>
  ),
}

export const CodeOnly: StoryObj<typeof QrCode> = {
  render: (args) => (
    <div className='w-64'>
      <QrCode {...args} />
    </div>
  ),
  args: { value: 'L:32:9FZM', logo },
}
