import type { Point } from '../data/types'
import type { Box, TransformState } from './types'

/**
 * The viewport's visible extent in the camera's transform space (scene units at k = 1):
 * the CSS-px viewport corners pushed through the measurement owner's
 * `getScreenCTM().inverse()` (SPEC §3 measurement owner, §6 explicit extent).
 */
export interface SceneWindow {
  x0: number
  x1: number
  y0: number
  y1: number
}

/**
 * Minimal affine CTM. `b`/`c` default to 0 (no skew in our layout), but the full
 * 2×2 inverse is used so a skewed matrix is still mapped correctly.
 */
interface RectCtm {
  a: number
  d: number
  e: number
  f: number
  b?: number
  c?: number
}

/** Screen (CSS px) point → scene point through the CTM's full 2×2 inverse. */
function invertCtm(ctm: RectCtm, screenX: number, screenY: number): Point {
  const b = ctm.b ?? 0
  const c = ctm.c ?? 0
  const det = ctm.a * ctm.d - c * b
  const localX = screenX - ctm.e
  const localY = screenY - ctm.f
  return {
    x: (ctm.d * localX - c * localY) / det,
    y: (ctm.a * localY - b * localX) / det,
  }
}

/**
 * The container's client-rect corners (origin + size) through the inverse CTM.
 * Under `xMidYMid slice` this is the slice-visible scene rectangle — what
 * d3-zoom's `extent` must be set to (the viewBox default is wrong in portrait).
 * The origin is a parameter (the container's `getBoundingClientRect()` box) so
 * the math never assumes the container sits at the viewport origin — it stays
 * in the same client coordinate space as the gesture clientX/Y handling.
 */
export function visibleWindow(
  originX: number,
  originY: number,
  viewportW: number,
  viewportH: number,
  ctm: RectCtm,
): SceneWindow {
  const tl = invertCtm(ctm, originX, originY)
  const br = invertCtm(ctm, originX + viewportW, originY + viewportH)
  return {
    x0: Math.min(tl.x, br.x),
    x1: Math.max(tl.x, br.x),
    y0: Math.min(tl.y, br.y),
    y1: Math.max(tl.y, br.y),
  }
}

/**
 * Pan-clamp domain: bounding-box union of the scene rect and hit-target bounds
 * (SPEC §6 — calibrated content may exceed the rect; targets must stay reachable).
 */
export function clampDomain(base: Box, hitBounds: Box[]): Box {
  let x0 = base.x
  let y0 = base.y
  let x1 = base.x + base.width
  let y1 = base.y + base.height
  for (const hit of hitBounds) {
    x0 = Math.min(x0, hit.x)
    y0 = Math.min(y0, hit.y)
    x1 = Math.max(x1, hit.x + hit.width)
    y1 = Math.max(y1, hit.y + hit.height)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * The usable window under a right-side obstruction (the desktop drawer): the
 * window's right edge retreats by the obstruction's viewport span converted to
 * scene units (`w / ctmA`) — SPEC §6. Shrinking the WINDOW (not growing the
 * domain) keeps the pan the drawer unlocks equal to its own CSS-px width at
 * every zoom k; a domain grow would scale it by k, which a static d3
 * translateExtent can never express. Only `w` is consumed: the sole
 * obstruction in this design is a right-side drawer.
 */
export function effectiveWindow(
  win: SceneWindow,
  obstruction: { w: number } | null,
  ctmA: number,
): SceneWindow {
  if (!obstruction) return win
  return { ...win, x1: win.x1 - obstruction.w / ctmA }
}

/**
 * Clamp one axis of a transform. The visible scene interval at state t is
 * `[(w0 - t)/k, (w1 - t)/k]`; when the scaled domain is narrower than the
 * window (inverted interval) the domain is centered instead.
 */
function clampAxis(t: number, k: number, w0: number, w1: number, d0: number, d1: number): number {
  if (k * (d1 - d0) <= w1 - w0) {
    return (w0 + w1) / 2 - (k * (d0 + d1)) / 2
  }
  const lower = w1 - k * d1
  const upper = w0 - k * d0
  return Math.min(upper, Math.max(lower, t))
}

/**
 * Per-frame pan clamp of a transform against the clamp domain. Never changes k —
 * k bounds are the zoom behavior's `scaleExtent`.
 */
export function clampTransform(t: TransformState, win: SceneWindow, domain: Box): TransformState {
  return {
    k: t.k,
    x: clampAxis(t.x, t.k, win.x0, win.x1, domain.x, domain.x + domain.width),
    y: clampAxis(t.y, t.k, win.y0, win.y1, domain.y, domain.y + domain.height),
  }
}
