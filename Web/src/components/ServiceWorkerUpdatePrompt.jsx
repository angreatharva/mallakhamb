import { useEffect, useState } from 'react'
import { updateServiceWorker } from '../utils/registerSW'

function ServiceWorkerUpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    const handleNeedRefresh = () => setNeedsRefresh(true)
    const handleOfflineReady = () => {
      setOfflineReady(true)
      window.setTimeout(() => setOfflineReady(false), 3500)
    }

    window.addEventListener('sw:need-refresh', handleNeedRefresh)
    window.addEventListener('sw:offline-ready', handleOfflineReady)

    return () => {
      window.removeEventListener('sw:need-refresh', handleNeedRefresh)
      window.removeEventListener('sw:offline-ready', handleOfflineReady)
    }
  }, [])

  if (!needsRefresh && !offlineReady) return null

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 9999,
        backgroundColor: '#111827',
        color: '#ffffff',
        border: '1px solid #374151',
        borderRadius: 10,
        padding: 14,
        maxWidth: 340,
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.45)',
      }}
    >
      {needsRefresh ? (
        <>
          <p style={{ margin: 0, marginBottom: 10 }}>A new version is available.</p>
          <button
            type="button"
            onClick={() => updateServiceWorker()}
            style={{
              border: 0,
              backgroundColor: '#FF6B35',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Update now
          </button>
        </>
      ) : (
        <p style={{ margin: 0 }}>Offline support is ready for this app.</p>
      )}
    </div>
  )
}

export default ServiceWorkerUpdatePrompt
