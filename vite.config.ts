import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { processSvg } from './src/scene/pipeline.build'

/**
 * `?scene` imports: an asset id marked with the `scene` query (e.g.
 * `/na cuia/icons/svg/mapa cru.svg?scene`) is read from disk, run through the
 * scene build pipeline (style resolution + id prefixing, SPEC §3) and re-exported
 * as a string. `enforce: 'pre'` + `load` mirrors how core implements `?raw`:
 * we must claim the id BEFORE vite:asset's load turns it into a URL.
 * Vitest loads this config, so the transform applies there too.
 */
function naCuiaScene(): Plugin {
  let root = process.cwd()
  return {
    name: 'na-cuia-scene',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    load(id) {
      const queryAt = id.indexOf('?')
      if (queryAt === -1) return null
      const clean = id.slice(0, queryAt)
      if (!clean.endsWith('.svg')) return null
      if (!new URLSearchParams(id.slice(queryAt + 1)).has('scene')) return null
      // ids arrive root-absolute in dev (`/na cuia/…`) and fs-absolute in build
      const asset = decodeURIComponent(clean)
      const file = asset.startsWith('/')
        ? asset.startsWith(`${root}/`)
          ? asset
          : root + asset
        : resolve(root, asset)
      const prefix = basename(file, '.svg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      this.addWatchFile(file) // SVG edits invalidate the ?scene module (HMR)
      const processed = processSvg(readFileSync(file, 'utf8'), prefix)
      return { code: `export default ${JSON.stringify(processed)}`, map: null }
    },
  }
}

export default defineConfig({
  plugins: [react(), naCuiaScene()],
  // trycloudflare preview tunnels for the remote calibration loop (dev server only)
  server: { allowedHosts: ['.trycloudflare.com'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
