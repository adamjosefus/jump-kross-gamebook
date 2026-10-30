import { withThemeByClassName } from '@storybook/addon-themes'
import type { Preview } from '@storybook/react-vite'
import '../src/index.css'

const preview: Preview = {
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light' }),
    (Story) => (
      <div className='bg-background text-foreground min-h-screen p-8'>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
}

export default preview
