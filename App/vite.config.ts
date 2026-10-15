import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.BASE_PATH ?? '/CW.ShowerTimer/';
export default defineConfig({
  base,
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'icons/*.png'],
    manifest: {
      name: 'Shower Timer', short_name: 'Shower', lang: 'en',
      description: 'Your shower, at your pace. Private and offline.',
      start_url: base, scope: base, display: 'standalone',
      background_color: '#10191e', theme_color: '#10191e',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico}'], navigateFallback: `${base}index.html`, cleanupOutdatedCaches: true },
    devOptions: { enabled: false }
  })],
  build: { target: 'es2022' }
});
