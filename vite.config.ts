import { defineConfig } from 'vite'

declare const process: { env: Record<string, string | undefined>; cwd(): string }
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
    // Honour an assigned port so a second session can preview beside the first.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    watch: {
      // Tailwind's content scan sees every file under the root, so writing a
      // figure or a .tex reloads the canvas and kills any long-running experiment
      // driving it. `paper/tools` stays watched: the page imports it.
      //
      // Anchored to the top-level paper/ directory: a bare `**/paper/figures/**`
      // also matches public/paper/figures/, and an ignored public file never
      // enters Vite's public-file cache -- a freshly generated tikz PNG then
      // 404s into the SPA fallback until the server restarts.
      ignored: [
        '**/.agents/**',
        '**/.claude/**',
        '**/.codex/**',
        '**/refs/**',
        `${process.cwd()}/paper/build/**`,
        `${process.cwd()}/paper/data/**`,
        `${process.cwd()}/paper/figures/**`,
        `${process.cwd()}/paper/*.tex`,
        `${process.cwd()}/paper/*.bib`,
      ],
    },
  },
})
