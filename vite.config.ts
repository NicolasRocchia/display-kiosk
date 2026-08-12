import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const buildId = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    {
      // El kiosk compara este asset contra su __BUILD_ID__ horneado y se recarga tras cada deploy
      name: 'emit-version-json',
      apply: 'build',
      applyToEnvironment: (env) => env.name === 'client',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId }),
        })
      },
    },
  ],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
})
