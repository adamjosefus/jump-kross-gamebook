import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';

import '../src/index.css';

const preview: Preview = {
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light' }),
    (Story) => (
      <div className='min-h-screen bg-background p-8 text-foreground'>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
};

export default preview;
