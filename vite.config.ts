import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(async ({ mode }) => {
  const hostingPlugins =
    mode === 'test'
      ? []
      : [(await import('@cloudflare/vite-plugin')).cloudflare()]

  return {
    plugins: [
      ...hostingPlugins,
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Covil',
          short_name: 'Covil',
          description: 'Entre. Fale. Jogue.',
          theme_color: '#0b0d12',
          background_color: '#0b0d12',
          display: 'standalone',
          start_url: '/',
          lang: 'pt-BR',
          icons: [
            {
              src: '/favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
    },
  }
})
