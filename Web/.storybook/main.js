import { mergeConfig } from 'vite';

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs', 'storybook-dark-mode'],
  staticDirs: ['../public'],
  docs: {
    autodocs: true,
  },
  viteFinal: async (config) => {
    const withoutPwa = {
      ...config,
      plugins: (config.plugins || []).flat().filter((plugin) => plugin?.name !== 'vite-plugin-pwa'),
    };

    return mergeConfig(withoutPwa, {
      server: {
        fs: {
          strict: false,
        },
      },
    });
  },
};

export default config;
