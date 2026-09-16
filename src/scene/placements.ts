import type { Point } from '../data/types'

/**
 * Calibrated placement for every non-base asset (AGENTS invariant 2 — no shared
 * coordinates between asset files). Uniform scale ONLY: no rotation (SPEC §3).
 *
 * Every value below is a FIRST-PASS placeholder for the Phase 1.5 calibration
 * pass (side-by-side against `na cuia/Mapa.jpeg`); the shapes and names are
 * the contract, the numbers are recalibrated with the DEV tool.
 */
export interface Placement {
  x: number
  y: number
  scale?: number
}

/** City placement plus the scene-coord anchor of its name label (`#labels`). */
export interface CityPlacement extends Placement {
  labelAnchor: Point
}

/**
 * Scene-coordinate focus point: at k = 1 the viewport centers on it (then
 * clamps); `reset()` returns to it. Recalibrated post-ship (v1.0.1): y=850
 * keeps all 11 orgs on the 16:9 first paint (slice-crop shows ~1700 of 2021
 * scene units vertically; y only clamps in landscape, x only in portrait).
 */
export const initialFraming: Point = { x: 1900, y: 850 }

/**
 * City land-mass placements — calibrated against the real poster
 * (graft/.cache/gate/ref/poster.jpg); 2026-09-16 user QA nudged Belém
 * up three times (net −33,−70 from the original solve) to clear the
 * base-map islands — the asset's thinner fill keeps gate IoU ≈0.572 there
 * (floor 0.57). Belém: big central mass with the bay; Ananindeua: joined at upper right; Moju/Barcarena:
 * elongated mass lower left (per poster composition).
 */
export const cityPlacements: Record<'belem' | 'ananindeua' | 'moju', CityPlacement> = {
  belem: { x: 1440.1, y: 388.9, scale: 0.7247, labelAnchor: { x: 1890, y: 830 } },
  ananindeua: { x: 1948.4, y: 156.5, scale: 0.9297, labelAnchor: { x: 2230, y: 440 } },
  moju: { x: 469.5, y: 980.1, scale: 0.8728, labelAnchor: { x: 760, y: 1500 } },
}

/**
 * Water squiggle texture. Like the wave bands, the width-fit scale
 * (SCENE_WIDTH / viewBox width ≈ 1.3994) composes with `scale`.
 */
export const squigglePlacement: Placement = { x: 0, y: 32 }

/**
 * DEV calibration-tool default for the `Mapa.jpeg` underlay (1599×899):
 * width-fit to the scene rect, centered vertically. AGENTS invariant 3 —
 * DEV-only, never inlined into the production bundle.
 */
export const underlayPlacement: Placement = {
  x: -300,
  y: 5,
  scale: 1.895,
}
