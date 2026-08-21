import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Vocabulary Voice Tutor',
        short_name: 'Vocabulary Tutor',
        description: 'Private English and German word and sentence practice.',
        theme_color: '#1747d1',
        background_color: '#f4f0e7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    host: process.env.VITE_DEV_HOST ?? '127.0.0.1',
    port: Number(process.env.VITE_DEV_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': {
        target:
          process.env.GATEWAY_PROXY_URL ?? 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
})
