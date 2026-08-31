import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useLibraryStore } from './store/library'
import { startTransport } from './store/transport'

// The scene zoo's capture bridge, for the golden-image harness only: dev
// server, ?zoo in the URL, nothing in a production build.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('zoo')) {
  void import('./zoo/bridge')
}

// Restore the working session before the first paint. It is one indexedDB read,
// and doing it here rather than in an effect is what keeps the app from showing
// its default construction for a frame before replacing it with the author's.
startTransport()

void useLibraryStore
  .getState()
  .hydrate()
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
