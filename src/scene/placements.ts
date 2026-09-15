import { SCENE_HEIGHT, SCENE_WIDTH } from '../data/constants'
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
 * clamps); `reset()` returns to it. Placeholder center — the real point is
 * chosen at the Phase 1.5 calibration pass (densest org cluster, not water).
 */
export const initialFraming: Point = { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 }

/**
 * City land-mass placements — first pass, uniform scale only (SPEC §3).
 * Belém: big left/central mass; Ananindeua: upper right; Moju: lower right
 * (per `Mapa.jpeg` composition).
 */
export const cityPlacements: Record<'belem' | 'ananindeua' | 'moju', CityPlacement> = {
  belem: { x: 1004, y: 22, scale: 0.6787, labelAnchor: { x: 1412, y: 380 } },
  ananindeua: { x: 1366, y: 39, scale: 1.1611, labelAnchor: { x: 1745, y: 382 } },
  moju: { x: 64, y: 858, scale: 0.7212, labelAnchor: { x: 337, y: 1258 } },
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
export const squigglePlacement: Placement = { x: 0, y: 0 }

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
