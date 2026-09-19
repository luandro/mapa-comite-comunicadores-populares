import { describe, expect, it } from 'vitest'
import { K_MAX, K_MIN } from './camera'

// Zoom-out context map (feat/zoom-out-context-map): the camera's k floor drops
// from 1 to K_MIN so the context underlayer is reachable. Every floor reads
// these two exports (scaleExtent, writeTransform, zoomBy, flyTo's default
// minK), so the constants themselves are the contract (SPEC §6: k ∈
// [K_MIN, K_MAX] — same-commit rule for SPEC constants).

describe('K_MIN contract', () => {
  it('K_MIN is 0.55 (zoom-out floor — context asset margins solved for it)', () => {
    expect(K_MIN).toBe(0.55)
  })

  it('K_MIN stays below K_MAX (a degenerate [k, k] extent would freeze zoom)', () => {
    expect(K_MIN).toBeLessThan(K_MAX)
  })
})
