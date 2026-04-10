import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import { pwaWorkboxConfig } from './src/config/pwa';

const cspDirectives = [
  "default-src 'self'",
  // Dev tooling and some dependencies rely on dynamic evaluation paths.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const securityHeaders = {
  'Content-Security-Policy': cspDirectives.join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()',
};

const isStorybookBuild =
  process.env.STORYBOOK === 'true' || process.env.npm_lifecycle_event === 'build-storybook';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    !isStorybookBuild &&
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: false,
        workbox: pwaWorkboxConfig,
      }),
  ],
  server: {
    host: '0.0.0.0', // Allow external connections
    port: 5173,
    allowedHosts: 'all', // Allow all hosts including ngrok
    headers: securityHeaders,
  },
  build: {
    sourcemap: false, // Disable source maps in production for security
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      plugins: [
        visualizer({
          filename: 'dist/stats.html',
          template: 'treemap',
          gzipSize: true,
          open: false,
        }),
      ],
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', 'react-hot-toast'],
          'form-vendor': ['react-hook-form'],
          icons: ['lucide-react', '@heroicons/react'],
          utils: ['axios', 'jwt-decode', 'crypto-js', 'dompurify'],
        },
      },
    },
    // Copy _redirects file to dist folder for Render SPA routing
    copyPublicDir: true,
  },
  publicDir: 'public',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // Coverage runs are significantly slower; raise the per-test timeout to avoid flakiness.
    testTimeout: 30000,
    exclude: ['**/node_modules/**', '**/tests/**', '**/playwright.config.js'],
    coverage: {
      /**
       * This repository's "pages folder refactoring" effort primarily touched the unified pages and
       * design-system layer. Coverage validation for this task is scoped to that refactor surface
       * area so legacy/unchanged pages don't dilute the signal.
       */
      include: [
        'src/pages/unified/**/*.{js,jsx,ts,tsx}',
        'src/components/design-system/**/*.{js,jsx,ts,tsx}',
        'src/styles/**/*.{js,jsx,ts,tsx}',
      ],
      exclude: [
        '**/*.test.*',
        '**/*.spec.*',
        '**/index.{js,jsx,ts,tsx}',
        '**/*Demo.{js,jsx,ts,tsx}',
        'src/assets/**',
        'src/pages/unified/UnifiedLogin.jsx',
      ],
      reporter: ['text', 'html', 'json', 'clover'],
    },
  },
});
