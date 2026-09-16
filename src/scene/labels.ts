/**
 * Controller-owned HTML label layer (SPEC §3 / AGENTS invariant 12): a sibling
 * of the scene SVG and `#measure`, outside any camera transform in both camera
 * modes. `renderLabels` builds org pills + city name labels from structured
 * `ComiteData` fields (never HTML from data); `updateLabels` repositions every
 * label per camera frame through the measurement owner's CTM.
 */
import { gsap } from 'gsap'
import type { ComiteData, Point } from '../data/types'
import { orgProjects } from './layers'
import { cityPlacements } from './placements'
import type { TransformState } from './types'

/** jsdom's getScreenCTM() is null — this identity keeps label math defined in tests. */
export const IDENTITY_CTM: DOMMatrix =
  typeof DOMMatrix === 'function'
    ? new DOMMatrix()
    : ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as unknown as DOMMatrix)

export function createLabelsLayer(parent: HTMLElement): {
  el: HTMLDivElement
  destroy(): void
} {
  const el = document.createElement('div')
  el.id = 'labels'
  el.setAttribute('aria-hidden', 'true')
  parent.appendChild(el)
  let destroyed = false
  return {
    el,
    destroy() {
      if (destroyed) return
      destroyed = true
      el.remove()
    },
  }
}

/**
 * One label = outer `.label` anchor (JS writes `transform: translate(px,py)`
 * on it per frame) wrapping the inner `.label-pill`/`.label-city` div whose
 * GSAP properties own the offset around the anchor point — two transform
 * owners, two nodes (SPEC §3).
 */
function appendLabel(
  el: HTMLElement,
  id: string,
  point: Point,
  text: string,
  kind: 'label-pill' | 'label-city',
): void {
  const anchor = document.createElement('div')
  anchor.className = 'label'
  anchor.dataset.labelId = id
  anchor.dataset.x = String(point.x)
  anchor.dataset.y = String(point.y)
  const label = document.createElement('div')
  label.className = kind
  label.textContent = text // structured fields only — never HTML from data (SPEC §3)
  // The offset around the anchor is a GSAP property (percent-based) — NOT CSS
  // `transform` on the same node. The intro tweens scale on these divs, and
  // GSAP bakes any pre-existing CSS transform to px on first touch (fractional
  // widths round wrong + font-swap reflows would de-center labels permanently —
  // opus P1). One owner: JS per-frame on the anchor, GSAP property on the div.
  if (kind === 'label-pill') {
    // Org boxes are anchored to the totem BASE and grow below it. Keeping the
    // top edge as the transform origin means the intro pop does not pull the
    // box back over the totem while it scales in.
    gsap.set(label, { xPercent: -50, yPercent: 0, y: PILL_BASE_OFFSET })
  } else {
    gsap.set(label, { xPercent: -50, yPercent: -50 })
  }
  anchor.appendChild(label)
  el.appendChild(anchor)
}

function cityLabelAnchor(cityId: string): Point | null {
  if (cityId === 'belem' || cityId === 'ananindeua' || cityId === 'moju') {
    return cityPlacements[cityId].labelAnchor
  }
  return null
}

/** Org pills anchored at each artifact pos + city name labels at labelAnchor. */
export function renderLabels(
  el: HTMLElement,
  data: ComiteData,
  artifacts: Record<string, { x: number; y: number }>,
): void {
  for (const [orgId, project] of orgProjects(data)) {
    const point = artifacts[orgId]
    if (!point) continue
    appendLabel(el, orgId, point, project.name, 'label-pill')
  }
  for (const [cityId, city] of Object.entries(data.maps)) {
    const anchor = cityLabelAnchor(cityId)
    if (!anchor) continue
    appendLabel(el, `city:${cityId}`, anchor, city.name, 'label-city')
  }
}

/**
 * Position every label: `screen = ctm · (k·point + [tx, ty])` — the camera
 * transform applies in scene coords first, then the measurement owner's
 * camera-free CTM; both translations included, or pans drift (AGENTS 12).
 *
 * Per-pill distance-from-center gate (SPEC §5, mobile only): a pill farther
 * than `PILL_CENTER_R × 1.1` from the viewport center gains `.is-far`
 * (opacity/visibility only), closer than `× 0.9` loses it — hysteresis keeps
 * the edge stable. Only applies when `gated` (the mobile flag passed by
 * mount.ts); desktop pills never fade.
 */
export function updateLabels(
  el: HTMLElement,
  state: TransformState,
  measureCtm: DOMMatrix,
  gated = false,
): void {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const cx = vw / 2
  const cy = vh / 2
  const radius = PILL_CENTER_R * Math.min(vw, vh)
  // Static-overlap resolution (poster close-out): org boxes are anchored
  // below their totems; in dense clusters (e.g. east Belém) two boxes can
  // collide at k=1. The push is applied on the ANCHOR translate — the inner
  // div's GSAP properties stay single-owner (SPEC §3) — and shrinks back to
  // 0 as zoom separates the anchors (box px size is camera-independent).
  const rects: LabelRect[] = []
  for (const child of el.children) {
    if (!(child instanceof HTMLDivElement)) continue
    const x = Number(child.dataset.x)
    const y = Number(child.dataset.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const sx = state.k * x + state.x
    const sy = state.k * y + state.y
    const px = measureCtm.a * sx + measureCtm.c * sy + measureCtm.e
    const py = measureCtm.b * sx + measureCtm.d * sy + measureCtm.f
    const pill = child.querySelector<HTMLElement>('.label-pill')
    if (pill) {
      const w = pill.offsetWidth
      const h = pill.offsetHeight
      if (w > 0 && h > 0)
        rects.push({
          id: child.dataset.labelId ?? '',
          x: px - w / 2,
          y: py + PILL_BASE_OFFSET,
          w,
          h,
        })
    }
    child.dataset.px = String(px)
    child.dataset.py = String(py)
  }
  const pushes = resolveEdgeClamp(rects, vw, vh, resolveLabelPush(rects))
  for (const child of el.children) {
    if (!(child instanceof HTMLDivElement)) continue
    const px = Number(child.dataset.px)
    const py = Number(child.dataset.py)
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue
    const push = pushes.get(child.dataset.labelId ?? '') ?? 0
    child.style.transform = `translate(${px}px, ${py + push}px)`
    // Per-pill distance gate (mobile only): the ANCHOR carries the screen
    // position; the inner .label-pill gains/loses .is-far with ±10%
    // hysteresis. Opacity/visibility only — hit targets and aria untouched.
    if (gated) {
      const pill = child.querySelector('.label-pill')
      if (pill) {
        const d = Math.hypot(px - cx, py - cy)
        const far = pill.classList.contains('is-far')
        if (!far && d > radius * 1.1) pill.classList.add('is-far')
        else if (far && d < radius * 0.9) pill.classList.remove('is-far')
      }
    }
  }
}

/* Phase 5: zoom-gated pill fade (SPEC §5 / TODO Phase 5, mobile only). */

/** Static-collision input for resolveLabelPush (screen px, box top-left). */
export interface LabelRect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Org boxes grow below the totem base — offset from anchor y to box top (px);
 * this IS the base offset appendLabel applies as the pill's GSAP `y`. */
export const PILL_BASE_OFFSET = 8

/** Vertical gap kept between stacked boxes (px). */
export const LABEL_STACK_GAP = 4

/**
 * Pure static-overlap resolution (unit-tested, no DOM): sort boxes by top y,
 * then push any box that overlaps an already-placed one straight down until
 * clear (LABEL_STACK_GAP). Horizontal overlap is required (>1px) so boxes
 * merely side by side never trigger pushes. Only downward moves — a box never
 * covers its totem; deterministic order keeps per-frame positions stable.
 */
export function resolveLabelPush(rects: LabelRect[]): Map<string, number> {
  const push = new Map<string, number>()
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: Array<{ x: number; y: number; w: number; h: number }> = []
  for (const r of sorted) {
    let dy = 0
    let clear = false
    while (!clear) {
      clear = true
      for (const p of placed) {
        const ox = Math.min(r.x + r.w, p.x + p.w) - Math.max(r.x, p.x)
        const oy = Math.min(r.y + dy + r.h, p.y + p.h) - Math.max(r.y + dy, p.y)
        if (ox > 1 && oy > 0) {
          dy = p.y + p.h + LABEL_STACK_GAP - r.y
          clear = false
        }
      }
    }
    if (dy > 0) push.set(r.id, dy)
    placed.push({ x: r.x, y: r.y + dy, w: r.w, h: r.h })
  }
  return push
}

/** Viewport edge margin (px) kept by resolveEdgeClamp on every side. */
export const LABEL_EDGE_MARGIN = 8

/**
 * Pure viewport edge clamp (unit-tested, no DOM): a second pass over the
 * static-overlap pushes that keeps every box fully inside the viewport
 * (LABEL_EDGE_MARGIN). A totem may sit at the slice-crop edge, but its name
 * must stay legible — legibility wins over totem clearance, so a box may be
 * pushed up over its own totem rather than hang clipped below the fold.
 * Vertical only (the anchor translate pushes on y); degenerate vw/vh (0 in
 * non-window environments) passes the inputs through untouched.
 */
export function resolveEdgeClamp(
  rects: LabelRect[],
  vw: number,
  vh: number,
  pushes: Map<string, number>,
): Map<string, number> {
  const out = new Map(pushes)
  if (vw <= 0 || vh <= 0) return out
  for (const r of rects) {
    const push = out.get(r.id) ?? 0
    const top = r.y + push
    if (top + r.h > vh - LABEL_EDGE_MARGIN) {
      out.set(r.id, push - (top + r.h - (vh - LABEL_EDGE_MARGIN)))
    } else if (top < LABEL_EDGE_MARGIN) {
      out.set(r.id, push + (LABEL_EDGE_MARGIN - top))
    }
  }
  return out
}

/**
 * Distance-from-center gate radius as a fraction of min(vw, vh) — the primary
 * mobile gate (SPEC §5): pills past it fade, ±10% hysteresis via PILL_FADE_*.
 */
export const PILL_CENTER_R = 0.45

/** Class toggled per-pill by updateLabels (distance gate) on mobile. */
export const PILL_FAR_CLASS = 'is-far'

/** Class toggled on #labels by updatePillFade; rules live in scene.css. */
export const PILLS_HIDDEN_CLASS = 'pills-hidden'

/**
 * Hysteresis band around `labelK` (±10%, TODO Phase 5): zooming below
 * `labelK × 0.9` hides the pills, zooming back above `labelK × 1.1` shows
 * them; inside the band the previous state holds (no flicker at the edge).
 */
export const LABEL_K = 1
export const PILL_FADE_LOW = 0.9
export const PILL_FADE_HIGH = 1.1

/** The hide decision at the band's lower edge (pure — unit-tested). */
export function pillsHiddenFor(k: number, labelK = LABEL_K): boolean {
  return k < labelK * PILL_FADE_LOW
}

/**
 * Apply the zoom gate to the labels layer — opacity/visibility ONLY (the
 * .pills-hidden rules in scene.css); hit targets, aria and focus are never
 * touched (hard constraint). True ±10% hysteresis: the class itself is the
 * state bit, so k inside the band (0.9·labelK, 1.1·labelK] keeps whatever
 * the last decision was.
 */
export function updatePillFade(el: HTMLElement, k: number, labelK = LABEL_K): void {
  const hidden = el.classList.contains(PILLS_HIDDEN_CLASS)
  if (hidden) {
    if (k > labelK * PILL_FADE_HIGH) el.classList.remove(PILLS_HIDDEN_CLASS)
  } else if (pillsHiddenFor(k, labelK)) {
    el.classList.add(PILLS_HIDDEN_CLASS)
  }
}
