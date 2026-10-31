import path from 'path'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * The production Content-Security-Policy (security audit 2026-10-31, M7).
 *
 * index.html carries ONE policy written for development: Vite's dev server
 * needs 'unsafe-inline'/'unsafe-eval', and connect-src lists every host a
 * developer might point the SPA at (localhost, ngrok, any *.onrender.com).
 * Shipped as-is, that let an injected script run eval and post data to any
 * attacker-owned onrender/ngrok address.
 *
 * A production build is built for exactly one API (VITE_API_URL), so this
 * rewrites two directives at build time and leaves everything else alone:
 *   - connect-src: 'self', that API's origin (https + wss for Socket.IO) and
 *     Razorpay;
 *   - script-src: 'self', a hash of each inline <script> in index.html, and
 *     Razorpay — no 'unsafe-inline', no 'unsafe-eval'.
 * Without an https VITE_API_URL (a local `vite build`, the preview configs)
 * the policy is left exactly as written, so nothing local changes.
 */
function productionCsp() {
  let apiUrl = ''
  return {
    name: 'mallakhamb-production-csp',
    apply: 'build',
    configResolved(config) {
      apiUrl = config.env.VITE_API_URL || process.env.VITE_API_URL || ''
    },
    transformIndexHtml(html) {
      let origin
      try {
        const url = new URL(apiUrl)
        if (url.protocol !== 'https:') return html
        origin = url.origin
      } catch {
        return html
      }
      const razorpay = 'https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com'
      const connect = `'self' ${origin} ${origin.replace(/^https:/, 'wss:')} ${razorpay}`
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
        .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
        .join(' ')
      const script = `'self' ${hashes} https://checkout.razorpay.com https://cdn.razorpay.com`
      return html.replace(
        /(<meta http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/,
        (_all, open, policy, close) => open + policy
          .replace(/connect-src[^;]*;/, `connect-src ${connect};`)
          .replace(/script-src[^;]*;/, `script-src ${script};`) + close
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), productionCsp()],
  /*
   * The look preview switch (design-language PLAN §4.4) as a build-time
   * constant: '' unless the build sets VITE_LOOK_OVERRIDE=1. Vite only inlines
   * env vars that exist, so without this an unset one stayed a runtime lookup
   * and the dev-only specimen chunk shipped in every production build.
   */
  define: {
    'import.meta.env.VITE_LOOK_OVERRIDE': JSON.stringify(process.env.VITE_LOOK_OVERRIDE || ''),
  },
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
    /*
     * Four workers, not one per core. The judge-screen tests render whole
     * screens in jsdom; with a worker per core (15 on a 16-core laptop) they
     * compete for the machine and the slowest took 3.5 s of the 5 s timeout, so
     * a busy machine tipped a different handful over the edge on every run
     * (master included). With four, the slowest takes 1.2 s. The timeout stays
     * at the default, so a real hang still fails.
     */
    maxWorkers: 4,
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
        // LiveRegion, the one presentational piece kept from the old design
        // system: markup, no logic worth asserting.
        'src/components/design-system/**',
        'src/styles/**',
        'src/assets/**',
      ],
    },
  },
  publicDir: 'public',
})
