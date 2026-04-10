import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './index.css';
import App from './App.jsx';
import ServiceWorkerUpdatePrompt from './components/ServiceWorkerUpdatePrompt';
import { validateEnv } from './config/envSchema';
import { registerServiceWorker } from './utils/registerSW';
import { reportWebVitals } from './utils/webVitals';
import { queryClient } from './utils/queryClient';

const renderEnvValidationError = (error) => {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  rootElement.innerHTML = `
    <div style="font-family: sans-serif; padding: 24px; max-width: 720px; margin: 40px auto; line-height: 1.6;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">Configuration error</h1>
      <p style="margin: 0 0 12px;">Environment validation failed. Please review your .env values.</p>
      <pre style="white-space: pre-wrap; background: #f8f8f8; border: 1px solid #ddd; padding: 12px; border-radius: 6px;">${error.message}</pre>
    </div>
  `;
};

try {
  validateEnv();

  if (import.meta.env.PROD) {
    registerServiceWorker({
      onNeedRefresh: () => {
        window.dispatchEvent(new Event('sw:need-refresh'));
      },
      onOfflineReady: () => {
        window.dispatchEvent(new Event('sw:offline-ready'));
      },
    });
  }

  reportWebVitals();

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <ServiceWorkerUpdatePrompt />
        {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
      </QueryClientProvider>
    </StrictMode>
  );
} catch (error) {
  renderEnvValidationError(error);
  throw error;
}
