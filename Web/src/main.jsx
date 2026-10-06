import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { preloadHome } from './pages/public/home/preload'

// The landing page: fetch its chunk and first-screen fonts alongside the app's boot, not after it.
if (window.location.pathname === '/') preloadHome()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
