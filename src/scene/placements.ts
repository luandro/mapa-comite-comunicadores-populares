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
 * clamps); `reset()` returns to it. Chosen at Phase 1.5 calibration: the
 * densest org cluster (Belém mainland bottom-center: Na Cuia / Fogo no Rabo /
 * Hip-Hop / Quilombo), so portrait first paint centers content, not water.
 */
export const initialFraming: Point = { x: 1300, y: 1330 }

/**
 * City land-mass placements — calibrated against `Mapa.jpeg` (post-ship v1.0.1
 * fidelity pass: city-fill component matching, painted-bbox → mock-bbox solve).
 * Belém: big central mass with the bay; Ananindeua: joined at upper right;
 * Moju/Barcarena: elongated mass lower left (per `Mapa.jpeg` composition).
 */
export const cityPlacements: Record<'belem' | 'ananindeua' | 'moju', CityPlacement> = {
  belem: { x: 923.5, y: 75.7, scale: 0.8424, labelAnchor: { x: 1400, y: 560 } },
  ananindeua: { x: 1538.2, y: 19.9, scale: 0.7982, labelAnchor: { x: 1790, y: 330 } },
  moju: { x: 115.9, y: 759.3, scale: 0.832, labelAnchor: { x: 420, y: 1290 } },
}

/**
 * Wave band ROW placements (x/y + uniform row scale). The band scale
 * ×1.3994 (SCENE_WIDTH / 2160.32, uniform on BOTH axes — SPEC §5) COMPOSES
 * with `scale` here: the mounted band transform is
 * `translate(x,y) scale((scale ?? 1) × 1.3994)`. Bands calibrate at x = 0
 * (SPEC §5); first-pass rows sit in the upper-left sea per `Mapa.jpeg`.
 */
export const wavePlacements: Record<'onda1' | 'onda2' | 'onda4', Placement> = {
  onda1: { x: 0, y: 330 },
  onda2: { x: 0, y: 490 },
  onda4: { x: 0, y: 650 },
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
