import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0', // Allow external connections
    port: 5173,
    allowedHosts: ['localhost', '127.0.0.1', '.ngrok-free.app'], // Restrict allowed hosts for security (resolves MED-15)
    // frame-ancestors only works as a response header — a <meta> CSP cannot
    // carry it. index.html says so; render.yaml sets the same header for the
    // deployed site. This keeps dev honest rather than protected-in-prod-only.
    headers: {
      'Content-Security-Policy': "frame-ancestors 'none'"
    }
  },
  build: {
    sourcemap: false, // Disable source maps in production for security
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', 'react-hot-toast'],
          'form-vendor': ['react-hook-form'],
          'icons': ['lucide-react'],
          'utils': ['axios', 'jwt-decode', 'crypto-js', 'dompurify']
        }
      }
    },
    // Copy _redirects file to dist folder for Render SPA routing
    chunkSizeWarningLimit: 1000
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
    // Scoped to src so Vitest never tries to run the Playwright specs in e2e/,
    // which its default glob would otherwise match on `*.spec.js`.
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      // Only source that ships. Without this the report is dominated by
      // config, tests and generated output, and the numbers mean nothing.
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/**/*.test.{js,jsx}',
        'src/setupTests.js',
        'src/main.jsx',
        // Presentational design-system pieces: markup and tokens, no logic
        // worth asserting, and including them buries the code that matters.
        'src/components/design-system/**',
        'src/styles/**',
        'src/assets/**',
      ],
    },
  },
  publicDir: 'public',
})
