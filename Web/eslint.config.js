import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import unusedImports from 'eslint-plugin-unused-imports'
import { defineConfig, globalIgnores } from 'eslint/config'
import customRules from './eslint-rules/index.js'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'design-system': {
        rules: customRules,
      },
      react,
      'unused-imports': unusedImports,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react/prop-types': 'off',
      'no-unused-vars': 'off', // Turn off standard rule
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
      'react-refresh/only-export-components': 'off',
      // An error everywhere since the design-language rollout reached zero
      // literals (docs/design-language/REPORT.md); tokens only.
      'design-system/no-hardcoded-colors': 'error',
      'design-system/no-hardcoded-spacing': 'warn',
    },
  },
  {
    files: [
      '**/*.{test,spec}.{js,jsx}',
      '**/__tests__/**/*.{js,jsx}',
      'tests/**/*.{js,jsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
    rules: {
      'no-import-assign': 'off',
    },
  },
  {
    // Playwright specs and their config run in Node, not the browser — they
    // read process.env and never touch the DOM outside page.evaluate().
    files: ['e2e/**/*.{js,jsx}', 'playwright.config.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    // Two islands that draw in fixed colours on purpose (design-language PLAN
    // §8.6, §8.14): the Time Keeper's stopwatch (Apple's palette, in every
    // look) and Home's WebGL/canvas runtime (literal colours for the GPU).
    // Plus the three files that must spell colours out: the rule's own token
    // table, the pre-paint theme-color script (runs before any CSS), and
    // Tailwind's config.
    files: [
      'src/pages/judge/StopwatchFace.jsx', 'src/pages/judge/stopwatchPalette.js', 'src/pages/public/home/runtime/**/*.js',
      'eslint-rules/**/*.js', 'public/appearance-init.js', 'tailwind.config.js',
    ],
    rules: {
      'design-system/no-hardcoded-colors': 'off',
    },
  },
  {
    // The look packs ARE the token source (docs/design-language/PLAN.md §4.3):
    // the one place a raw colour or length is supposed to be written. The
    // rules already exempt styles/tokens.js for the same reason.
    files: ['src/styles/looks/**/*.js'],
    rules: {
      'design-system/no-hardcoded-colors': 'off',
      'design-system/no-hardcoded-spacing': 'off',
    },
  },
])
