import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// `defineConfig` de vitest/config y no de vite: es el que además tipa la
// sección `test` de abajo.
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Qué Miro?',
        short_name: 'Qué Miro?',
        description: 'Tu biblioteca personal de películas y series.',
        theme_color: '#0B0D0E',
        background_color: '#0B0D0E',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // El bundle de Firebase pasa el límite por defecto de 2 MiB.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Los pósters de TMDB se cachean en runtime: la app queda usable
        // offline mostrando las portadas ya vistas.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Firebase es la mitad del peso y cambia poquísimo: en su propio chunk
        // se cachea aparte y no se invalida con cada deploy de la app.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom'],
          motion: ['motion/react'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true, // Para poder probarlo en el celu o red local
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Los specs de `e2e/` los corre Playwright, que trae su propio `test`:
    // si Vitest los levanta, falla al no encontrar el suyo.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
