import type { Point } from '../data/types'

/** Axis-aligned box in scene coordinates. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Full camera transform. State truth lives in d3-zoom's element-owned transform. */
export interface TransformState {
  x: number
  y: number
  k: number
}

export interface FlyToOptions {
  /** seconds; default 1.1 */
  duration?: number
  /** GSAP ease name; default 'power2.inOut' */
  ease?: string
  /** breathing room around the target box, scene units; default 60 */
  padding?: number
  /** upper zoom clamp for this flight; default K_MAX */
  maxK?: number
  /** lower zoom clamp for this flight; default K_MIN. Focus flights pass 1 —
   * their targets must stay legible, never rest at a zoom-out scale. */
  minK?: number
}

/**
 * Viewport-space (CSS px) obstruction rect — desktop drawer only.
 *
 * Only a right-side drawer exists in this design; the clamp model consumes
 * just `w`, shrinking the visible window's right edge by the drawer's span
 * (SPEC §6). `x`/`y`/`h` are part of the controller API and unused by the clamp.
 */
export interface ObstructionRect {
  x: number
  y: number
  w: number
  h: number
}

export interface CameraOptions {
  /** element filling the viewport that owns layout (ResizeObserver target) */
  container: HTMLElement
  /** the scene <svg>; receives pointer gestures (d3-zoom attached here) */
  sceneSvg: SVGSVGElement
  /** transform target <g> inside the scene svg */
  cameraNode: SVGGElement
  /** measurement owner: untransformed full-viewport svg OUTSIDE the camera wrapper */
  measureSvg: SVGSVGElement
  /** scene-coordinate focus point; reset() returns to it at k = 1 */
  initialCenter: Point
  /** clamp domain, defaults to SCENE_RECT */
  domain?: Box
  /** called after every committed transform (gesture or tween) */
  onFrame: (state: TransformState) => void
  /**
   * Called after the camera's resize-owned layout refresh (RO fires): the
   * moment the cached measurement CTM changes — consumers of getFrameState
   * must re-project at least once so cached-metric labels re-clamp.
   */
  onResize?: () => void
}

/**
 * Camera-plane readouts for the per-frame subscribers (labels, hit sizing):
 * the camera-free measurement CTM plus the transform state. The CTM is
 * refreshed on resize/layout only (refreshWindow) — caching removes a
 * per-frame getScreenCTM() call from the frame path; the throttled-pan A/B
 * showed no measurable fps change (see the TODO perf gate record,
 * 2026-09-18). The cache is kept because the read is provably redundant
 * between resize/layout events, not for a measured win.
 */
export interface FrameState {
  measureCtm: DOMMatrix
  state: TransformState
}

export interface Camera {
  getState(): TransformState
  /**
   * Camera-plane frame snapshot: recompute (onFrame callback) with the
   * CURRENT controller state but the CACHED measurement CTM — cheap enough
   * for every committed transform frame; the CTM part only changes on resize.
   */
  getFrameState(): FrameState
  /**
   * Scene-coord box visible right now (last-known window ∘ controller state).
   * Issue #11 captures this before a focus fly; the deselect flies back to it.
   */
  framing(): Box
  /**
   * viewport-space rect (CSS px); null clears. Shrinks the visible window on
   * the obstructed (right) side (SPEC §6).
   */
  setObstruction(rect: ObstructionRect | null): void
  flyTo(target: Box, opts?: FlyToOptions): void
  zoomBy(factor: number): void
  reset(): void
  destroy(): void
}
