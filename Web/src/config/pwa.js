export const pwaWorkboxConfig = {
  globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  navigateFallback: 'index.html',
  runtimeCaching: [
    {
      urlPattern: ({ request }) =>
        ['style', 'script', 'worker', 'font', 'image'].includes(request.destination),
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
      },
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api/') || /\/api\//.test(url.pathname),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 8,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'navigation-cache',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        },
      },
    },
  ],
}
