/**
 * Phase 3 entrance choreography (SPEC §5) — the poster waking up, atmospheric
 * restraint over spectacle: ONE ~3 s GSAP timeline fading/rising the map in
 * layer order (water rect is the ever-visible stage; waves → land/roads →
 * water-detail → cities → arrows → artifacts → pills → title).
 *
 * Rules honored here:
 * - transform/opacity ONLY, except the arrow dash-draw (stroke-dashoffset —
 *   the documented exception, AGENTS invariant 7 / SPEC §5).
 * - GSAP touches only nodes with no transform attribute and no CSS animation:
 *   base layer groups, calibrated interaction `<g>`s, the inner label divs
 *   (the outer `.label` anchor is rewritten per frame by `updateLabels` — two
 *   owners, two nodes, SPEC §3) and the wave band placement `<g>`s with
 *   OPACITY ONLY (their `transform` attribute is placement property —
 *   invariant 6).
 * - `getTotalLength()` is measured ONCE at build time, never inside the
 *   timeline (no layout-thrashing reads mid-animation).
 * - prefers-reduced-motion: no timeline, no priming — static final state and
 *   `INTRO_DONE_CLASS` from the first frame (SPEC §5 static fallback).
 */
import { gsap } from 'gsap'

/**
 * Toggled on `<html>` when the entrance completes (natural end, `skipIntro()`
 * or immediately under prefers-reduced-motion). React owns the title overlay
 * and its authored blob path (SPEC §3) — the `.app-title` reveal rule in
 * index.css keys off this class, so the scene owns the timing only.
 */
export const INTRO_DONE_CLASS = 'intro-done'

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Everything the entrance animates. All group wrappers, never painted nodes. */
export interface IntroTargets {
  /** Wave band placement `<g>`s — opacity only (transform is placement property). */
  waves: SVGGElement[]
  /** `layer-squiggles` group — not in the SPEC §5 sentence, fades with the water family. */
  squiggles: SVGGElement
  land: SVGGElement
  roads: SVGGElement
  waterDetail: SVGGElement
  /** City interaction `<g>`s (no transform attribute — the GSAP target). */
  cities: SVGGElement[]
  /** Inner `.label-city` divs (outer anchors are per-frame positioned). */
  cityLabels: HTMLElement[]
  arrows: { paths: SVGPathElement[]; dots: SVGCircleElement[] }
  /** Artifact interaction `<g>`s (no transform attribute — the GSAP target). */
  artifacts: SVGGElement[]
  /** Inner `.label-pill` divs (outer anchors are per-frame positioned). */
  pills: HTMLElement[]
}

/* Gentle entrance distances — scene units for SVG groups, scale for labels. */
const LAND_RISE_FROM = 24
const CITY_RISE_FROM = 30
const ARTIFACT_DROP_FROM = -48 // drops from above: negative translateY
const LABEL_POP_FROM = 0.7

/** Last resort when neither `getTotalLength` nor the `d` parse yields a length. */
const FALLBACK_ARROW_LENGTH = 200

/**
 * Deterministic fallback for `getTotalLength()` (jsdom ships no path math):
 * every authored arrow `d` is `M x,y Q cx,cy x,y` (layers.ts `arrowPath`), so
 * the quadratic Bézier can be integrated numerically. Browsers always take
 * the measured value; this keeps the dash math defined in tests.
 */
function quadLength(d: string): number {
  const n = d.match(/-?[\d.]+/g)?.map(Number) ?? []
  if (n.length < 6 || n.some((v) => !Number.isFinite(v))) return FALLBACK_ARROW_LENGTH
  const [x0, y0, cx, cy, x1, y1] = n.slice(0, 6) as [number, number, number, number, number, number]
  let length = 0
  let px = x0
  let py = y0
  const steps = 24
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1
    length += Math.hypot(x - px, y - py)
    px = x
    py = y
  }
  return length
}

/** Measured ONCE per path at build time (the documented read pattern). */
function measureArrowLength(path: SVGPathElement): number {
  try {
    if (typeof path.getTotalLength === 'function') {
      const measured = path.getTotalLength()
      if (Number.isFinite(measured) && measured > 0) return measured
    }
  } catch {
    // not implemented (jsdom) — fall through to the authored-`d` estimate
  }
  return quadLength(path.getAttribute('d') ?? '')
}

/** Hide every animated target at its entrance start state (build time, sync). */
export function primeIntroTargets(targets: IntroTargets): void {
  if (targets.waves.length) gsap.set(targets.waves, { opacity: 0 })
  gsap.set([targets.land, targets.roads], { opacity: 0, y: LAND_RISE_FROM })
  gsap.set([targets.squiggles, targets.waterDetail], { opacity: 0 })
  if (targets.cities.length) gsap.set(targets.cities, { opacity: 0, y: CITY_RISE_FROM })
  if (targets.cityLabels.length) gsap.set(targets.cityLabels, { opacity: 0, scale: LABEL_POP_FROM })
  if (targets.arrows.paths.length) {
    for (const path of targets.arrows.paths) {
      const length = measureArrowLength(path)
      path.setAttribute('stroke-dasharray', String(length))
      path.setAttribute('stroke-dashoffset', String(length))
    }
    gsap.set(targets.arrows.paths, { opacity: 0 })
  }
  if (targets.arrows.dots.length) gsap.set(targets.arrows.dots, { opacity: 0 })
  if (targets.artifacts.length) gsap.set(targets.artifacts, { opacity: 0, y: ARTIFACT_DROP_FROM })
  if (targets.pills.length) gsap.set(targets.pills, { opacity: 0, scale: LABEL_POP_FROM })
}

/**
 * The ~3 s entrance (SPEC §5 order). Gentle `power1.out` throughout — no
 * bouncing; the arrow draw uses `power1.inOut` so the stroke eases in and out
 * of its travel. Position parameters keep the total just over 3 s with real
 * data (11 orgs); the fixture's smaller counts simply end sooner.
 */
export function buildIntroTimeline(
  targets: IntroTargets,
  onComplete: () => void,
): gsap.core.Timeline {
  const tl = gsap.timeline({ defaults: { ease: 'power1.out' }, onComplete })
  // The water rect never animates — it is the stage the poster wakes up on.
  if (targets.waves.length) tl.to(targets.waves, { opacity: 1, duration: 0.5, stagger: 0.1 }, 0)
  tl.to([targets.land, targets.roads], { opacity: 1, y: 0, duration: 0.6, stagger: 0.15 }, 0.2)
  tl.to([targets.squiggles, targets.waterDetail], { opacity: 1, duration: 0.5, stagger: 0.1 }, 0.55)
  if (targets.cities.length) {
    tl.to(targets.cities, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12 }, 0.7)
  }
  if (targets.cityLabels.length) {
    tl.to(targets.cityLabels, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.12 }, 0.85)
  }
  if (targets.arrows.paths.length) {
    // Dash-draw: the ONE non-transform/opacity animation (documented exception).
    // A quick opacity lead-in also hides the marker-end arrowhead until the
    // stroke starts traveling — markers ignore dash state.
    tl.to(
      targets.arrows.paths,
      { attr: { 'stroke-dashoffset': 0 }, duration: 0.55, stagger: 0.05, ease: 'power1.inOut' },
      1.3,
    )
    tl.to(targets.arrows.paths, { opacity: 1, duration: 0.2, stagger: 0.05 }, 1.3)
  }
  if (targets.arrows.dots.length) {
    tl.to(targets.arrows.dots, { opacity: 1, duration: 0.3, stagger: 0.05 }, 1.35)
  }
  if (targets.artifacts.length) {
    tl.to(targets.artifacts, { opacity: 1, y: 0, duration: 0.45, stagger: 0.06 }, 1.9)
  }
  if (targets.pills.length) {
    tl.to(targets.pills, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.04 }, 2.55)
  }
  // The title fade is React-owned: INTRO_DONE_CLASS (toggled by mount.ts when
  // this timeline completes) drives the `.app-title` reveal in index.css.
  return tl
}

/** Jump every animated target to its final state — used by skipIntro(). */
export function finalizeIntroTargets(targets: IntroTargets): void {
  if (targets.waves.length) gsap.set(targets.waves, { opacity: 1 })
  gsap.set([targets.land, targets.roads], { opacity: 1, y: 0 })
  gsap.set([targets.squiggles, targets.waterDetail], { opacity: 1 })
  if (targets.cities.length) gsap.set(targets.cities, { opacity: 1, y: 0 })
  if (targets.cityLabels.length) gsap.set(targets.cityLabels, { opacity: 1, scale: 1 })
  if (targets.arrows.paths.length) {
    for (const path of targets.arrows.paths) path.setAttribute('stroke-dashoffset', '0')
    gsap.set(targets.arrows.paths, { opacity: 1 })
  }
  if (targets.arrows.dots.length) gsap.set(targets.arrows.dots, { opacity: 1 })
  if (targets.artifacts.length) gsap.set(targets.artifacts, { opacity: 1, y: 0 })
  if (targets.pills.length) gsap.set(targets.pills, { opacity: 1, scale: 1 })
}
