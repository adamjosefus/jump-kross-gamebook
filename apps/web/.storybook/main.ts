import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  // The cello samples the slide buttons play.
  staticDirs: ['../public'],
  addons: ['@storybook/addon-themes'],
  framework: '@storybook/react-vite',
};

export default config;
