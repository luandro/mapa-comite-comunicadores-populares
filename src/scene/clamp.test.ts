import { describe, expect, it } from 'vitest'
import { SCENE_HEIGHT, SCENE_RECT, SCENE_WIDTH } from '../data/constants'
import {
  clampDomain,
  clampTransform,
  effectiveWindow,
  visibleWindow,
  type SceneWindow,
} from './clamp'

const LAND_W = 1552
const LAND_H = 980
const PORT_W = 390
const PORT_H = 844

/** Visible scene height/width under cover at the given axis ratio. */
const LAND_VIS_H = (LAND_H * SCENE_WIDTH) / LAND_W // 980 scene units per 1552 css px of width
const PORT_VIS_W = (PORT_W * SCENE_HEIGHT) / PORT_H // 390 css px of height → scene units

/**
 * The exact CTM of a full-viewport `<svg viewBox="0 0 3023.11 2021.19"
 * preserveAspectRatio="xMidYMid slice">` — what the measurement owner reports
 * on a 16:9 laptop (1552×980) and a 9:19.5 phone (390×844).
 */
function coverCtm(vw: number, vh: number): { a: number; d: number; e: number; f: number } {
  const s = Math.max(vw / SCENE_WIDTH, vh / SCENE_HEIGHT)
  return { a: s, d: s, e: (vw - SCENE_WIDTH * s) / 2, f: (vh - SCENE_HEIGHT * s) / 2 }
}

const landWin = visibleWindow(0, 0, LAND_W, LAND_H, coverCtm(LAND_W, LAND_H))
const portWin = visibleWindow(0, 0, PORT_W, PORT_H, coverCtm(PORT_W, PORT_H))

/** Total pan range width on x at scale k (probe with far-out-of-range transforms). */
function panRange(win: SceneWindow, k: number): number {
  const lo = clampTransform({ x: -1e9, y: 0, k }, win, SCENE_RECT).x
  const hi = clampTransform({ x: 1e9, y: 0, k }, win, SCENE_RECT).x
  return hi - lo
}

describe('visibleWindow', () => {
  it('landscape 1552×980: full scene width visible, height centered (slice)', () => {
    expect(landWin.x0).toBeCloseTo(0, 9)
    expect(landWin.x1).toBeCloseTo(SCENE_WIDTH, 6)
    expect(landWin.y1 - landWin.y0).toBeCloseTo(LAND_VIS_H, 6) // ≈ 1908.92
    expect(landWin.y0).toBeCloseTo((SCENE_HEIGHT - LAND_VIS_H) / 2, 6) // ≈ 56.13
    expect(landWin.y1).toBeCloseTo(SCENE_HEIGHT - (SCENE_HEIGHT - LAND_VIS_H) / 2, 6)
  })

  it('portrait 390×844: full scene height visible, ≈934-unit band centered', () => {
    expect(portWin.y0).toBeCloseTo(0, 9)
    expect(portWin.y1).toBeCloseTo(SCENE_HEIGHT, 6)
    expect(portWin.x1 - portWin.x0).toBeCloseTo(PORT_VIS_W, 6) // ≈ 934.20
    expect(portWin.x0).toBeCloseTo((SCENE_WIDTH - PORT_VIS_W) / 2, 6) // ≈ 1044.46
    expect(portWin.x1).toBeCloseTo(SCENE_WIDTH - (SCENE_WIDTH - PORT_VIS_W) / 2, 6)
  })

  it('maps corners through a synthetic CTM (a=2, e=100, f=50)', () => {
    expect(visibleWindow(0, 0, 300, 200, { a: 2, d: 2, e: 100, f: 50 })).toEqual({
      x0: -50,
      y0: -25,
      x1: 100,
      y1: 75,
    })
  })

  it('uses the full 2×2 inverse (a ≠ d)', () => {
    expect(visibleWindow(0, 0, 300, 200, { a: 2, d: 4, e: 100, f: 50 })).toEqual({
      x0: -50,
      y0: -12.5,
      x1: 100,
      y1: 37.5,
    })
  })

  it('maps a container not at the viewport origin (non-zero rect)', () => {
    // Same CTM as above, container at client (10, 20): the window shifts by
    // (Δx/a, Δy/d) — no (0, 0) viewport assumption.
    expect(visibleWindow(10, 20, 300, 200, { a: 2, d: 2, e: 100, f: 50 })).toEqual({
      x0: -45,
      y0: -15,
      x1: 105,
      y1: 85,
    })
  })
})

describe('clampTransform · landscape', () => {
  it('k=1: x locked (window == scene width), y clamps to both exact boundaries', () => {
    const down = clampTransform({ x: 123.4, y: -777, k: 1 }, landWin, SCENE_RECT)
    expect(down.x).toBeCloseTo(0, 9)
    expect(down.y).toBeCloseTo(-landWin.y0, 9) // lower bound: y1 − k·height == −y0 by symmetry
    expect(down.k).toBe(1)

    const up = clampTransform({ x: 123.4, y: 777, k: 1 }, landWin, SCENE_RECT)
    expect(up.x).toBeCloseTo(0, 9)
    expect(up.y).toBeCloseTo(landWin.y0, 9) // upper bound: y0 − k·0
  })

  it('in-range transforms pass through untouched', () => {
    const t = clampTransform({ x: -1000, y: -1000, k: 2 }, landWin, SCENE_RECT)
    expect(t).toEqual({ x: -1000, y: -1000, k: 2 })
  })

  it('k=2 and k=4 widen the pan range (x: 0 → W → 3W)', () => {
    expect(panRange(landWin, 1)).toBeCloseTo(0, 6)
    expect(panRange(landWin, 2)).toBeCloseTo(SCENE_WIDTH, 6)
    expect(panRange(landWin, 4)).toBeCloseTo(3 * SCENE_WIDTH, 6)
  })

  it('k=4 clamps to the exact boundary on both sides', () => {
    const right = clampTransform({ x: 1e9, y: 0, k: 4 }, landWin, SCENE_RECT)
    expect(right.x).toBeCloseTo(0, 9) // upper: y-independent, x0 − 0
    const left = clampTransform({ x: -1e9, y: 0, k: 4 }, landWin, SCENE_RECT)
    expect(left.x).toBeCloseTo(SCENE_WIDTH - 4 * SCENE_WIDTH, 6) // lower: x1 − 4W
  })

  it('never changes k, however far out of range the translation is', () => {
    const t = clampTransform({ x: 1e9, y: 1e9, k: 3.7 }, landWin, SCENE_RECT)
    expect(t.k).toBe(3.7)
  })
})

describe('clampTransform · portrait', () => {
  it('k=1: y locked/centered (window height == scene height)', () => {
    const p = clampTransform({ x: 0, y: 456.7, k: 1 }, portWin, SCENE_RECT)
    expect(p.y).toBeCloseTo(0, 9)
  })

  it('k=1: x range is ≈2089 wide, clamping to the exact symmetric boundaries', () => {
    expect(panRange(portWin, 1)).toBeCloseTo(SCENE_WIDTH - PORT_VIS_W, 6) // ≈ 2088.91
    const right = clampTransform({ x: 5000, y: 0, k: 1 }, portWin, SCENE_RECT)
    expect(right.x).toBeCloseTo((SCENE_WIDTH - PORT_VIS_W) / 2, 6) // ≈ 1044.46
    const left = clampTransform({ x: -5000, y: 0, k: 1 }, portWin, SCENE_RECT)
    expect(left.x).toBeCloseTo(-(SCENE_WIDTH - PORT_VIS_W) / 2, 6)
  })

  it('k=2 and k=4 widen the x range', () => {
    expect(panRange(portWin, 2)).toBeCloseTo(2 * SCENE_WIDTH - PORT_VIS_W, 6) // ≈ 5112.02
    expect(panRange(portWin, 4)).toBeCloseTo(4 * SCENE_WIDTH - PORT_VIS_W, 6) // ≈ 11158.24
    const clamped = clampTransform({ x: 1e9, y: 0, k: 2 }, portWin, SCENE_RECT)
    expect(clamped.x).toBeCloseTo((SCENE_WIDTH - PORT_VIS_W) / 2, 6) // upper: x0 − k·0 == x0
  })
})

describe('clampTransform · centering', () => {
  it('centers the domain on both axes when it is smaller than the window', () => {
    const domain = { x: 1000, y: 1000, width: 500, height: 400 }
    const t = clampTransform({ x: 98765, y: -98765, k: 1 }, landWin, domain)
    expect(t.x).toBeCloseTo(SCENE_WIDTH / 2 - 1250, 6) // 261.56 — independent of t
    expect(t.y).toBeCloseTo(SCENE_HEIGHT / 2 - 1200, 6) // −189.44
  })

  it('mixed: clamps the wide axis while centering the narrow one', () => {
    const domain = { x: 0, y: 1000, width: 5000, height: 400 }
    const t = clampTransform({ x: -1e9, y: 98765, k: 1 }, landWin, domain)
    expect(t.x).toBeCloseTo(SCENE_WIDTH - 5000, 6) // lower bound, k=1
    expect(t.y).toBeCloseTo(SCENE_HEIGHT / 2 - 1200, 6) // centered
  })
})

describe('clampDomain', () => {
  it('unions the scene rect with hit bounds beyond it (right/bottom)', () => {
    const union = clampDomain(SCENE_RECT, [{ x: 3050, y: 1900, width: 100, height: 200 }])
    expect(union.x).toBeCloseTo(0, 9)
    expect(union.y).toBeCloseTo(0, 9)
    expect(union.width).toBeCloseTo(3150, 6)
    expect(union.height).toBeCloseTo(2100, 6)
  })

  it('unions with hit bounds extending past the left/top edges', () => {
    const union = clampDomain(SCENE_RECT, [{ x: -50, y: -30, width: 10, height: 10 }])
    expect(union).toEqual({
      x: -50,
      y: -30,
      width: SCENE_WIDTH + 50,
      height: SCENE_HEIGHT + 30,
    })
  })

  it('is a no-op for boxes inside the rect and for an empty list', () => {
    expect(clampDomain(SCENE_RECT, [])).toEqual({ ...SCENE_RECT })
    expect(clampDomain(SCENE_RECT, [{ x: 10, y: 10, width: 20, height: 20 }])).toEqual({
      ...SCENE_RECT,
    })
  })

  it('extends the reachable range: landscape k=1 x pans left once content exceeds the rect', () => {
    const union = clampDomain(SCENE_RECT, [{ x: 3050, y: 1900, width: 100, height: 200 }])
    // Without the union the landscape k=1 x range is the single point 0.
    const t = clampTransform({ x: -500, y: 0, k: 1 }, landWin, union)
    expect(t.x).toBeCloseTo(SCENE_WIDTH - 3150, 6) // ≈ −126.89, the new lower bound
  })
})

describe('effectiveWindow', () => {
  it('shrinks only the right edge, by the obstruction width in scene units', () => {
    const ctmA = LAND_W / SCENE_WIDTH
    const w = effectiveWindow(landWin, { w: 400 }, ctmA)
    expect(w.x0).toBe(landWin.x0)
    expect(w.y0).toBe(landWin.y0)
    expect(w.y1).toBe(landWin.y1)
    expect(w.x1).toBeCloseTo(landWin.x1 - 400 / ctmA, 9) // ≈ 2243.96
  })

  it('returns the window untouched for null', () => {
    expect(effectiveWindow(portWin, null, 1)).toBe(portWin)
  })

  it('unlock equals the drawer width at k=1.6 and k=4 (16:9 and 9:19.5), not k·w', () => {
    const aspects = [
      { win: landWin, ctmA: LAND_W / SCENE_WIDTH, drawerW: 400 },
      { win: portWin, ctmA: PORT_H / SCENE_HEIGHT, drawerW: 320 },
    ]
    for (const { win, ctmA, drawerW } of aspects) {
      const extras = [1.6, 4].map(
        (k) => panRange(effectiveWindow(win, { w: drawerW }, ctmA), k) - panRange(win, k),
      )
      for (const extra of extras) expect(extra).toBeCloseTo(drawerW / ctmA, 6)
      // k-independent by construction: a domain grow would scale the bonus by k.
      expect(extras[1]).toBeCloseTo(extras[0], 9)
    }
  })
})
