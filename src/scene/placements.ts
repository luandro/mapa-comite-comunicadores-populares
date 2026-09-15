import { SCENE_HEIGHT, SCENE_WIDTH } from '../data/constants'
import type { Point } from '../data/types'

/**
 * Calibrated placement for every non-base asset (AGENTS invariant 2 — no shared
 * coordinates between asset files). Uniform scale ONLY: no rotation (SPEC §3).
 */
export interface Placement {
  x: number
  y: number
  scale?: number
}

/**
 * Scene-coordinate focus point: at k = 1 the viewport centers on it (then
 * clamps); `reset()` returns to it. Placeholder center for Phase 1 — the real
 * point is chosen at the Phase 1.5 calibration pass.
 */
export const initialFraming: Point = { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 }

/** City land-mass placements — filled at Phase 1.5 calibration (uniform scale only). */
export const cityPlacements: Record<string, Placement> = {}

/** Wave band placements — filled at Phase 1.5 calibration. */
export const wavePlacements: Record<string, Placement> = {}
