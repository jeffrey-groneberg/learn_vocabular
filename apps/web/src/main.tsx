import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { startBrowserTelemetry } from '@vocabulary/observability/browser'
import './index.css'
import App from './App.tsx'

startBrowserTelemetry(
  import.meta.env.VITE_APPLICATIONINSIGHTS_CONNECTION_STRING,
  import.meta.env.VITE_RELEASE,
)

const updateServiceWorker = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('vocabulary-tutor:update-ready'))
  },
})
window.addEventListener('vocabulary-tutor:apply-update', () => {
  void updateServiceWorker(true)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
