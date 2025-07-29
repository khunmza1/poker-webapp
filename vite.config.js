import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Poker Night Ledger',
        short_name: 'PokerLedger',
        description: 'An app to track poker game buy-ins and settlements.',
        theme_color: '#111827',
        background_color: '#1f2937',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '192x192 poker.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '512x512 poker.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
