import { describe, expect, it } from 'vitest'
import { initialFraming } from './placements'
import { unfocusFlight } from './unfocus'

// Issue #11 state machine: which box does an artifact deselect fly back to?
// Pure decision only — the flight itself is camera.flyTo (DOM-bound; its
// clamping math is covered by clamp.test.ts).

describe('unfocusFlight', () => {
  it('restores a captured framing verbatim under padding 0 (k recomputed from the box size)', () => {
    // A portrait k = 1 framing: the ≈934-unit visible band of the 3023-wide scene.
    const captured = { x: 1044.46, y: 0, width: 934.2, height: 2021.19 }
    const flight = unfocusFlight(captured, initialFraming)
    expect(flight.box).toEqual(captured)
    expect(flight.opts).toEqual({ padding: 0 })
  })

  it('never caps maxK on a captured framing (a zoom up to K_MAX is restored)', () => {
    const flight = unfocusFlight({ x: 0, y: 0, width: 800, height: 600 }, initialFraming)
    expect(flight.opts.maxK).toBeUndefined()
  })

  it('never pins minK on a captured framing (a k<1 zoom-out framing restores below 1)', () => {
    // Zoom-out → focus → deselect round-trip (codex r1 P1): the captured box
    // recomputes its own k, so a framing captured at K_MIN must fly back at
    // k < 1 — no minK override may lift it to 1.
    const flight = unfocusFlight({ x: 0, y: 0, width: 5000, height: 3400 }, initialFraming)
    expect(flight.opts.minK).toBeUndefined()
  })

  it('falls back to a zero-area box at initialFraming pinned to k = 1 on both edges', () => {
    const flight = unfocusFlight(null, initialFraming)
    expect(flight.box).toEqual({ x: initialFraming.x, y: initialFraming.y, width: 0, height: 0 })
    // maxK AND minK: the fallback is the reset() target — exactly k = 1, never
    // a K_MIN zoom-out of the empty point box.
    expect(flight.opts).toEqual({ padding: 0, maxK: 1, minK: 1 })
  })

  it('fallback honors any framing point, not just the shipped calibration', () => {
    const flight = unfocusFlight(null, { x: 10, y: 20 })
    expect(flight.box).toEqual({ x: 10, y: 20, width: 0, height: 0 })
  })

  it("does not mutate the caller's captured box", () => {
    const captured = { x: 1, y: 2, width: 3, height: 4 }
    unfocusFlight(captured, initialFraming)
    expect(captured).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})
