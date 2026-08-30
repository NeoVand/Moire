import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The scene zoo's capture bridge, for the golden-image harness only: dev
// server, ?zoo in the URL, nothing in a production build.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('zoo')) {
  void import('./zoo/bridge')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
