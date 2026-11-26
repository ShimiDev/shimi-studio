import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// התוסף של Cloudflare מריץ את ה-Worker ואת D1 מקומית בזמן `npm run dev`
export default defineConfig({
  root: '.',
  plugins: [react(), cloudflare()],
  build: { chunkSizeWarningLimit: 900 },
})
