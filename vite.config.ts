import { defineConfig } from 'vite'

declare const process: { env: Record<string, string | undefined> }
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    watch: {
      // Tailwind's content scan sees every file under the root, so writing a
      // figure or a .tex reloads the canvas and kills any long-running experiment
      // driving it. `paper/tools` stays watched: the page imports it.
      ignored: [
        '**/.agents/**',
        '**/.claude/**',
        '**/.codex/**',
        '**/refs/**',
        '**/paper/build/**',
        '**/paper/data/**',
        '**/paper/figures/**',
        '**/paper/*.tex',
        '**/paper/*.bib',
      ],
    },
  },
})
