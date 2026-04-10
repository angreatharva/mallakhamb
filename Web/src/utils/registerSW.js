import { Workbox } from 'workbox-window';

let workbox;

export function registerServiceWorker({ onNeedRefresh, onOfflineReady } = {}) {
  if (!('serviceWorker' in navigator)) return null;

  workbox = new Workbox('/sw.js');

  workbox.addEventListener('waiting', () => {
    onNeedRefresh?.();
  });

  workbox.addEventListener('activated', (event) => {
    if (!event.isUpdate) {
      onOfflineReady?.();
    }
  });

  workbox.addEventListener('controlling', () => {
    window.location.reload();
  });

  workbox.register();
  return workbox;
}

export function updateServiceWorker() {
  if (!workbox) return;
  workbox.messageSkipWaiting();
}

export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}
