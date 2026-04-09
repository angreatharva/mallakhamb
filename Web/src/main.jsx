import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './index.css'
import App from './App.jsx'
import ServiceWorkerUpdatePrompt from './components/ServiceWorkerUpdatePrompt'
import { registerServiceWorker } from './utils/registerSW'
import { reportWebVitals } from './utils/webVitals'
import { queryClient } from './utils/queryClient'

if (import.meta.env.PROD) {
  registerServiceWorker({
    onNeedRefresh: () => {
      window.dispatchEvent(new Event('sw:need-refresh'))
    },
    onOfflineReady: () => {
      window.dispatchEvent(new Event('sw:offline-ready'))
    },
  })
}

reportWebVitals()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ServiceWorkerUpdatePrompt />
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  </StrictMode>,
)
