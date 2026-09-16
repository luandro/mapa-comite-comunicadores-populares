/**
 * RUNTIME half of the scene pipeline (SPEC §2): split a processed base map
 * into layers by RESOLVED fill attribute, in document order — never by class
 * name (`prefixIds` renames classes) — and assert the node-count ground truth.
 * The build half (style resolution + id prefixing) lives in `pipeline.build.ts`
 * and is imported only by `vite.config.ts`; this module must stay free of it
 * so svogo never reaches the client bundle. Browser/jsdom only (DOMParser).
 */

/**
 * The three mounted base-map layers, keyed per SPEC §2, arrays in document
 * order. The sea is NOT a layer: v1.1 cut the ocean rect from the scene —
 * `.scene-root { background: #5da9a9 }` (scene.css) is the ocean.
 */
export interface BaseLayers {
  land: Element[]
  roads: Element[]
  waterDetail: Element[]
}

const LAYER_BY_FILL: Record<string, keyof BaseLayers> = {
  // '#5da9a9' (the sea rect fill) is deliberately absent: v1.1 unmounts the
  // ocean — the CSS background on .scene-root carries it instead.
  '#95c98e': 'land',
  '#58b254': 'roads',
  '#509393': 'waterDetail',
  '#99d3d8': 'waterDetail',
  '#abd5f3': 'waterDetail',
}

/**
 * Split a processed base map into layers by RESOLVED fill attribute, in
 * document order. Elements carrying none of the known fills (empty
 * groups, wrappers) are ignored. Fails loud when the map is not flat
 * (SPEC §2): `mapa cru` ships zero `<g>` wrappers and zero `transform`
 * attributes, and reparenting painted nodes into layer groups would silently
 * discard any ancestor geometry — a non-flat map must never mount shifted.
 */
export function partitionBase(processed: string): BaseLayers {
  const layers: BaseLayers = { land: [], roads: [], waterDetail: [] }
  const svg = new DOMParser().parseFromString(processed, 'image/svg+xml').documentElement
  if (svg.querySelector('g')) {
    throw new Error(
      'base map is not flat: <g> wrapper(s) present — reparenting would silently discard ancestor transforms',
    )
  }
  for (const element of svg.querySelectorAll('*')) {
    const layer = LAYER_BY_FILL[element.getAttribute('fill')?.toLowerCase() ?? '']
    if (!layer) continue
    if (element.hasAttribute('transform')) {
      throw new Error(
        `base map is not flat: <${element.localName}> carries a transform attribute — reparenting would silently discard it`,
      )
    }
    layers[layer].push(element)
  }
  return layers
}

/**
 * SPEC §2 ground truth for `mapa cru.svg` ABOVE the cut sea: 42 + 5 + 20 = 67
 * painted nodes. The single #5da9a9 sea <rect> is not mounted (v1.1 — the
 * `.scene-root` CSS background is the ocean).
 */
export const BASE_COUNTS = { land: 42, roads: 5, waterDetail: 20 } as const

/** Mount-time hard error (SPEC §2) when the base map does not partition exactly. */
export function assertBaseCounts(layers: BaseLayers): void {
  const mismatches = (Object.keys(BASE_COUNTS) as Array<keyof BaseLayers>)
    .filter((layer) => layers[layer].length !== BASE_COUNTS[layer])
    .map((layer) => `${layer}: expected ${BASE_COUNTS[layer]}, got ${layers[layer].length}`)
  if (mismatches.length > 0) {
    throw new Error(`Base map partition mismatch (${mismatches.join('; ')})`)
  }
}
