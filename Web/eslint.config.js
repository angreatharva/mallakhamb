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
      // Design system rules - warn in development, can be upgraded to error later
      'design-system/no-hardcoded-colors': 'warn',
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
    // Folders the design-language rollout has finished: a hard-coded colour is
    // an error here, so the token rule cannot slide back (PLAN Phase 6). Add a
    // folder once its count reaches zero; `npm run lint:ratchet` holds the rest.
    files: [
      'src/components/ui/**/*.{js,jsx}',
      'src/components/shell/**/*.{js,jsx}',
      'src/components/brand/**/*.{js,jsx}',
      'src/components/competition/**/*.{js,jsx}',
      'src/components/layout/**/*.{js,jsx}',
      'src/pages/player/**/*.{js,jsx}',
      'src/pages/unified/**/*.{js,jsx}',
      'src/pages/shared/**/*.{js,jsx}',
      'src/pages/public/*.{js,jsx}',
    ],
    rules: {
      'design-system/no-hardcoded-colors': 'error',
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
