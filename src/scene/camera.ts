import { select } from 'd3-selection'
import { zoom, zoomTransform, ZoomTransform } from 'd3-zoom'
import { gsap } from 'gsap'
import { SCENE_HEIGHT, SCENE_RECT, SCENE_WIDTH } from '../data/constants'
import { clampTransform, effectiveWindow, visibleWindow, type SceneWindow } from './clamp'
import type {
  Box,
  Camera,
  CameraOptions,
  FlyToOptions,
  ObstructionRect,
  TransformState,
} from './types'

export const K_MAX = 4

const DEFAULT_DURATION = 1.1
const DEFAULT_EASE = 'power2.inOut'
const DEFAULT_PADDING = 60
const RESET_DURATION = 0.6
const RECLAMP_DURATION = 0.35
const COMPAT_DBLCLICK_MS = 700

/**
 * d3-zoom + GSAP camera over the slice-covered scene (SPEC §6).
 *
 * State truth is d3-zoom's element-owned transform on the scene svg; k/tx/ty are
 * ONLY ever read from it (`zoomTransform`), never from DOM attributes (AGENTS 8).
 * Viewport↔scene math reads ONLY the measurement owner's CTM. GSAP animates a
 * plain proxy and every frame writes through `zoom.transform`; because d3's
 * programmatic `transform()` applies no extents, each write is pre-clamped with
 * the same `clampTransform` math d3's built-in constrain uses on gestures
 * (verified equivalent), so a gesture interrupting a flight never jumps.
 */
export function createCamera(opts: CameraOptions): Camera {
  const { container, sceneSvg, cameraNode, measureSvg, initialCenter, onFrame } = opts
  const baseDomain: Box = opts.domain ?? SCENE_RECT

  // Full-rect fallback until the first successful CTM read (jsdom / pre-layout).
  let win: SceneWindow = { x0: 0, y0: 0, x1: SCENE_WIDTH, y1: SCENE_HEIGHT }
  let ctmA = 1
  let obstruction: ObstructionRect | null = null
  let destroyed = false
  let flyTween: gsap.core.Tween | null = null

  const svgSel = select(sceneSvg)

  /** Last known-finite transform — d3's own state restore point when a
   * poisoned (NaN) frame arrives (see the zoom-handler guard below). */
  let lastGood = new ZoomTransform(1, initialCenter.x, initialCenter.y)

  /**
   * The usable window with the obstruction applied as a right-edge shrink
   * (SPEC §6): the drawer's own CSS-px width is the exact extra pan budget it
   * unlocks, at every k. The clamp domain (translateExtent) stays baseDomain.
   * Single choke point: every window consumer reads the same win/obstruction/ctmA triple.
   */
  function effWin(): SceneWindow {
    return effectiveWindow(win, obstruction, ctmA)
  }

  const behavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, K_MAX])
    .on('start', (event) => {
      // Real gestures carry a sourceEvent; programmatic writes do not.
      if (event.sourceEvent) killActiveFly()
    })
    .on('zoom', (event) => {
      // A pill-started touch forwards a synthetic stream into d3; if a
      // native contact ever lands at the SAME coordinates, d3's pinch math
      // divides by zero separation and emits NaN k/x/y (codex r4 repro).
      // d3 assigns __zoom BEFORE emitting, so a bare return leaves
      // sceneSvg.__zoom poisoned — every later gesture/fly reads NaN from
      // it and the camera bricks for the session (opus gate P1). Restore
      // the last good transform into the exact slot d3 owns, then skip the
      // poisoned frame.
      const t = event.transform
      if (!Number.isFinite(t.k) || !Number.isFinite(t.x) || !Number.isFinite(t.y)) {
        svgSel.call(behavior.transform, lastGood)
        return
      }
      lastGood = t
      cameraNode.setAttribute('transform', t.toString())
      onFrame({ x: t.x, y: t.y, k: t.k })
    })

  // Push the current window/domain as d3 extents (translateExtent takes no
  // accessor, so both are set as static arrays whenever they change).
  function updateExtents(): void {
    const w = effWin()
    behavior
      .extent([
        [w.x0, w.y0],
        [w.x1, w.y1],
      ])
      .translateExtent([
        [baseDomain.x, baseDomain.y],
        [baseDomain.x + baseDomain.width, baseDomain.y + baseDomain.height],
      ])
  }

  function refreshWindow(): void {
    const ctm = measureSvg.getScreenCTM?.() ?? null
    // The container's client box, not an assumed (0, 0) viewport origin — the
    // same coordinate space as the gesture clientX/Y math.
    const rect = container.getBoundingClientRect()
    if (ctm && rect.width > 0 && rect.height > 0) {
      win = visibleWindow(rect.x, rect.y, rect.width, rect.height, {
        a: ctm.a,
        b: ctm.b,
        c: ctm.c,
        d: ctm.d,
        e: ctm.e,
        f: ctm.f,
      })
      ctmA = ctm.a
    }
    // Push extents even without a CTM (jsdom / pre-layout): leaving d3 on its
    // defaultExtent reads viewBox.baseVal — unimplemented there, wrong under
    // slice. The full-rect fallback `win` keeps construction non-degenerate;
    // the next RO/CTM hit refines it.
    updateExtents()
  }

  function killActiveFly(): void {
    if (flyTween) {
      flyTween.kill()
      flyTween = null
    }
  }

  function state(): TransformState {
    const t = zoomTransform(sceneSvg)
    return { x: t.x, y: t.y, k: t.k }
  }

  function writeTransform(t: TransformState): void {
    // Clamp k FIRST, then the translation against that clamped k — an
    // overshooting ease (back.out) must never write a pair (x, y) clamped
    // against a k that is not the one actually written.
    const k = Math.min(K_MAX, Math.max(1, t.k))
    const clamped = clampTransform({ ...t, k }, effWin(), baseDomain)
    behavior.transform(svgSel, new ZoomTransform(k, clamped.x, clamped.y))
  }

  function reClampNow(): void {
    const current = state()
    const clamped = clampTransform(current, effWin(), baseDomain)
    if (clamped.x !== current.x || clamped.y !== current.y) writeTransform(current)
  }

  // --- GSAP: one context, reverted on destroy ---------------------------------

  const ctx = gsap.context(() => {}, sceneSvg)
  const proxy: TransformState = { x: 0, y: 0, k: 1 }

  function flyToTransform(target: TransformState, duration: number, ease: string): void {
    killActiveFly() // a new fly replaces the previous tween
    const from = state()
    const clamped = clampTransform(target, effWin(), baseDomain)
    if (clamped.x === from.x && clamped.y === from.y && clamped.k === from.k) return
    proxy.x = from.x
    proxy.y = from.y
    proxy.k = from.k
    flyTween = ctx.add(() =>
      gsap.to(proxy, {
        x: clamped.x,
        y: clamped.y,
        k: clamped.k,
        duration,
        ease,
        onUpdate: () => writeTransform(proxy),
        onComplete: () => {
          flyTween = null
        },
      }),
    )
  }

  // --- public API --------------------------------------------------------------

  function flyTo(target: Box, flyOpts?: FlyToOptions): void {
    refreshWindow()
    const padding = flyOpts?.padding ?? DEFAULT_PADDING
    const maxK = Math.min(flyOpts?.maxK ?? K_MAX, K_MAX)
    const duration = flyOpts?.duration ?? DEFAULT_DURATION
    const ease = flyOpts?.ease ?? DEFAULT_EASE
    const w = effWin()
    const kFit = Math.min(
      (w.x1 - w.x0) / (target.width + 2 * padding),
      (w.y1 - w.y0) / (target.height + 2 * padding),
    )
    const k = Math.min(maxK, Math.max(1, kFit))
    // Center in the UNOBSTRUCTED window so the target sits beside the drawer.
    flyToTransform(
      {
        x: (w.x0 + w.x1) / 2 - k * (target.x + target.width / 2),
        y: (w.y0 + w.y1) / 2 - k * (target.y + target.height / 2),
        k,
      },
      duration,
      ease,
    )
  }

  function zoomBy(factor: number): void {
    killActiveFly()
    refreshWindow()
    const kTarget = Math.min(K_MAX, Math.max(1, zoomTransform(sceneSvg).k * factor))
    // About the extent centroid, i.e. the visible window's center.
    behavior.scaleTo(svgSel, kTarget)
  }

  function reset(): void {
    refreshWindow()
    const w = effWin()
    flyToTransform(
      {
        x: (w.x0 + w.x1) / 2 - initialCenter.x,
        y: (w.y0 + w.y1) / 2 - initialCenter.y,
        k: 1,
      },
      RESET_DURATION,
      DEFAULT_EASE,
    )
  }

  function setObstruction(rect: ObstructionRect | null): void {
    obstruction = rect
    updateExtents()
    if (!rect) {
      // Obstruction cleared: the window grew back — glide to the nearest
      // in-window state, no jump (SPEC §6).
      flyToTransform(state(), RECLAMP_DURATION, 'power2.out')
    }
  }

  // --- touch bookkeeping (compat dblclick suppression) -------------------------

  let lastTouchUp = -Infinity

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'touch') lastTouchUp = performance.now()
  }

  // --- wiring ------------------------------------------------------------------

  svgSel.call(behavior)

  // d3-zoom owns double-tap zoom end to end: touch double-taps reroute into
  // its dblclick handler (zoom.js touchended, carrying changedTouches) and get
  // the same 250 ms transition as a desktop double-click. Chromium ALSO
  // synthesizes a compat mouse dblclick after two taps (`touch-action: none`
  // disabled the native double-tap zoom, so the browser falls back to click
  // events) — left alone, the same two taps would zoom ×4. Suppress only that
  // compat event: a non-touch dblclick shortly after a real touch is skipped;
  // the reroute (changedTouches) and desktop dblclick always pass.
  const nativeDblClick = svgSel.on('dblclick.zoom')
  if (nativeDblClick) {
    svgSel.on('dblclick.zoom', (event: MouseEvent, d: unknown) => {
      if (!('changedTouches' in event) && performance.now() - lastTouchUp < COMPAT_DBLCLICK_MS)
        return
      nativeDblClick.call(sceneSvg, event, d)
    })
  }

  sceneSvg.addEventListener('pointerup', onPointerUp)

  const ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          refreshWindow()
          reClampNow()
        })
  ro?.observe(container)

  // First paint: k = 1 centered on the focus point, clamped — portrait starts on
  // the densest cluster, not open water (SPEC §3 calibration note).
  refreshWindow()
  const w = effWin()
  writeTransform({
    x: (w.x0 + w.x1) / 2 - initialCenter.x,
    y: (w.y0 + w.y1) / 2 - initialCenter.y,
    k: 1,
  })

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    killActiveFly()
    ctx.revert()
    ro?.disconnect()
    sceneSvg.removeEventListener('pointerup', onPointerUp)
    svgSel.on('.zoom', null)
  }

  return { getState: state, setObstruction, flyTo, zoomBy, reset, destroy }
}
