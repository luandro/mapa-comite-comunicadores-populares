import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { processSvg } from './src/scene/pipeline.build'
import ui from './src/data/ui.json'

/**
 * Build-time HTML content injection: `%ui.titleLines.0%`-style placeholders in
 * `index.html` are replaced from `src/data/ui.json` (the one externalized copy
 * of every user-facing string). Build-time, not runtime — link unfurlers
 * (WhatsApp etc.) don't run JS, so `<title>`/meta MUST be real HTML in the
 * served file. Zero hardcoded copy, zero runtime bytes, no title flash.
 */
function uiHtml(): Plugin {
  const apply = (html: string): string =>
    html.replace(/%ui\.([\w.]+)%/g, (_whole, path: string) => {
      let node: unknown = ui
      for (const key of path.split('.')) {
        if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) {
          throw new Error(`uiHtml: unknown placeholder %ui.${path}% (missing ui.json key)`)
        }
        node = (node as Record<string, unknown>)[key]
      }
      if (typeof node !== 'string') {
        throw new Error(`uiHtml: placeholder %ui.${path}% resolves to a non-string`)
      }
      // Editors type free text (quotes, `<`, `&`) that lands inside <title>
      // and quoted attribute values — escape for both contexts (CodeRabbit).
      return node
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    })
  return {
    name: 'na-cuia-ui-html',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => apply(html),
    },
  }
}

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

export default defineConfig(({ mode }) => ({
  plugins: [react(), naCuiaScene(), uiHtml()],
  // GH Pages project site: /mapa-comite-comunicadores-populares/ (Phase 7).
  base: mode === 'production' ? '/mapa-comite-comunicadores-populares/' : '/',
  // trycloudflare preview tunnels for the remote calibration loop (dev server only)
  server: { allowedHosts: ['.trycloudflare.com'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
  },
}))
