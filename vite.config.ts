import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'pack/species.json'],
      manifest: {
        name: 'Madras Field Notes — சென்னை களக் குறிப்புகள்',
        short_name: 'MadrasFieldNotes',
        description: 'Offline bird and plant identification for IIT Madras and Chennai',
        theme_color: '#1b5e20',
        background_color: '#faf6ef',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,wasm}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(huggingface\.co|.*\.hf\.co|cdn-lfs\.huggingface\.co)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'huggingface-models',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 60
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ]
})
