import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Vite Configuration for Prompt Generator Studio
 * 
 * Service Worker Caching Notes:
 * - In production, the SW caches all assets for offline use
 * - During development/preview, use hard refresh (Ctrl+Shift+R / Cmd+Shift+R) 
 *   or clear site data if UI changes don't appear
 * - The SW uses 'autoUpdate' strategy to check for updates on page load
 * - To fully disable SW: unregister via DevTools > Application > Service Workers
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // Checks for updates on every load
      workbox: {
        cleanupOutdatedCaches: true, // Remove old caches automatically
      },
      devOptions: {
        enabled: false, // Disable SW in dev mode to prevent caching confusion
      },
      manifest: {
        name: 'Prompt Generator Studio',
        short_name: 'Prompt Studio',
        description: 'Professional AI video prompt generator with timeline scripting',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-256.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
})
