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
      ignored: ['**/.agents/**', '**/.claude/**', '**/.codex/**'],
    },
  },
})
