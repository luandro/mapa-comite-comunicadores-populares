/**
 * Controller-owned HTML label layer (SPEC §3 / AGENTS invariant 12): a sibling
 * of the scene SVG and `#measure`, outside any camera transform in both camera
 * modes. `renderLabels` builds org pills + city name labels from structured
 * `ComiteData` fields (never HTML from data); `updateLabels` repositions every
 * label per camera frame through the measurement owner's CTM.
 */
import { gsap } from 'gsap'
import type { ComiteData, Point } from '../data/types'
import { orgProjects, TOTEM_HEIGHT } from './layers'
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
    // Issue #13: the pill box doubles as its org's pointer-only tap target
    // (opens the same modal as the totem tap). data-label-for carries the org
    // id for mount.ts's delegated #labels click handler; the anchor and
    // .label-city stay pointer-events:none and #labels stays aria-hidden —
    // the totem SVG button remains the single focusable control per org
    // (SPEC §9 / AGENTS invariant 12).
    label.dataset.labelFor = id
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
 * Cached pill box sizes (px): a pill's px size is camera-independent — the
 * boxes live in screen space and only change when fonts finish loading (or
 * text content changes, which content-only data.json edits cannot do at
 * runtime). The cache removes 11 synchronous offsetWidth/offsetHeight layout
 * reads per frame (reads that revalidated layout the previous frame's
 * transform writes had dirtied); the throttled-pan A/B showed no measurable
 * fps change either way — see the TODO perf gate record (2026-09-18).
 * Invalidate with `invalidateLabelMetrics()` on font-load/resize/visibility
 * changes — NOT per frame.
 */
const pillSizeCache = new Map<HTMLElement, { w: number; h: number }>()

export function invalidateLabelMetrics(): void {
  pillSizeCache.clear()
}

function pillMetrics(pill: HTMLElement): { w: number; h: number } {
  let size = pillSizeCache.get(pill)
  if (!size) {
    size = { w: pill.offsetWidth, h: pill.offsetHeight }
    pillSizeCache.set(pill, size)
  }
  return size
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
      const { w, h } = pillMetrics(pill)
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
  // Issue #3 (item 3): the anchor reach scales with the camera so a totem
  // zoomed in near the crop line keeps its pill — u = measureCtm.a × k is
  // CSS px per scene unit (controller state + measurement owner, no DOM read).
  const pushes = resolveEdgeClamp(
    rects,
    vw,
    vh,
    resolveLabelPush(rects),
    pillAnchorSlack(measureCtm.a * state.k),
  )
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
 * Baseline reach (px) past the viewport edge for the anchor-on-screen rule:
 * ≈ half the totem height in CSS px at k = 1 on a phone. A totem's art box is
 * TOTEM_HEIGHT scene units tall, so at the slice crop its upper half stays
 * on-screen long after its base (the pill anchor) slipped below the fold —
 * the pill is then pulled up to hug the visible art instead of vanishing with
 * the base (2026-09-16 user QA: the bottom-row totems lost their titles).
 */
export const PILL_ANCHOR_SLACK = 140

/**
 * Zoom-aware slack (issue #3, item 3): the FIXED 140px slack undershoots at
 * k > 1 — zoomed in, a cropped totem can show much more than half its art
 * while its anchor sits far past the fold, and its pill would be silently
 * skipped. The correct reach is the totem's full on-screen height
 * (TOTEM_HEIGHT × u CSS px, u = measureCtm.a × k from the controller state —
 * never a DOM read), floored at the QA-passed k=1 baseline.
 */
export function pillAnchorSlack(u: number): number {
  return Math.max(PILL_ANCHOR_SLACK, TOTEM_HEIGHT * u)
}

/**
 * Pure viewport edge clamp (unit-tested, no DOM): a second pass over the
 * static-overlap pushes that keeps every box fully inside the viewport
 * (LABEL_EDGE_MARGIN). A totem may sit at the slice-crop edge, but its name
 * must stay legible — legibility wins over totem clearance, so a box may be
 * pushed up over its own totem rather than hang clipped below the fold.
 * Vertical only (the anchor translate pushes on y); degenerate vw/vh (0 in
 * non-window environments) passes the inputs through untouched. The clamp
 * reaches ±`slack` past the edges — asymmetrically: the BOTTOM reach is
 * zoom-aware (`pillAnchorSlack`; totem art extends UPWARD from the anchor,
 * so a below-the-fold anchor can still own visible art), while the TOP reach
 * stays at the QA'd baseline — an anchor above the top means the whole art
 * box is above it too, and a zoom-scaled top reach would pin orphan pills to
 * the top margin (opus r1 P1). Anchors beyond either reach are left alone —
 * a pill whose totem scrolled fully off-screen must not orphan at the edge
 * (v1.0.1 anchor-on-screen rule).
 */
export function resolveEdgeClamp(
  rects: LabelRect[],
  vw: number,
  vh: number,
  pushes: Map<string, number>,
  slack: number = PILL_ANCHOR_SLACK,
): Map<string, number> {
  const out = new Map(pushes)
  if (vw <= 0 || vh <= 0) return out
  for (const r of rects) {
    // Anchor-on-screen guard: a pill whose totem is off-screen (zoom/pan) is
    // left alone — dragging it to an edge would orphan it from its totem.
    // r.y - PILL_BASE_OFFSET is the anchor y; horizontal misses (x fully
    // outside vw) are skipped too since the pill would be invisible anyway.
    const anchorY = r.y - PILL_BASE_OFFSET
    if (r.x + r.w < 0 || r.x > vw) continue
    // Asymmetric reach (opus r1 P1): art extends only UPWARD from the anchor,
    // so the zoom-aware slack is valid below the fold only — an anchor above
    // the top means the whole totem is off-screen; keep the QA'd baseline.
    if (anchorY < -PILL_ANCHOR_SLACK || anchorY > vh + slack) continue
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
 * Hysteresis band around `labelK`, entirely BELOW 1 (zoom-out context map):
 * zooming below `labelK × 0.9` hides the pills, zooming back to `labelK × 1.0`
 * shows them; inside [0.9, 1.0)·labelK the previous state holds (no flicker
 * at the edge). The show edge sits AT labelK because K_MIN = 0.55 makes k < 1
 * a resting state — reset() lands at exactly k = 1 and pills must return (the
 * old >1.1 edge left them hidden after a zoom-out reset).
 */
export const LABEL_K = 1
export const PILL_FADE_LOW = 0.9
export const PILL_FADE_SHOW = 1.0

/** The hide decision at the band's lower edge (pure — unit-tested). */
export function pillsHiddenFor(k: number, labelK = LABEL_K): boolean {
  return k < labelK * PILL_FADE_LOW
}

/**
 * Apply the zoom gate to the labels layer — opacity/visibility ONLY (the
 * .pills-hidden rules in scene.css); hit targets, aria and focus are never
 * touched (hard constraint). True hysteresis below 1: the class itself is the
 * state bit, so k inside the band [0.9, 1.0)·labelK keeps whatever the last
 * decision was; k ≥ labelK always shows.
 */
export function updatePillFade(el: HTMLElement, k: number, labelK = LABEL_K): void {
  const hidden = el.classList.contains(PILLS_HIDDEN_CLASS)
  if (hidden) {
    if (k >= labelK * PILL_FADE_SHOW) el.classList.remove(PILLS_HIDDEN_CLASS)
  } else if (pillsHiddenFor(k, labelK)) {
    el.classList.add(PILLS_HIDDEN_CLASS)
  }
}

/* Issue #13: title-pill tap routing. Pointer-ONLY affordance — #labels stays
   aria-hidden (SPEC §3 / AGENTS invariant 12); the totem SVG button remains
   the single focusable control per org (SPEC §9). */

/** Actionable pill-tap plan: the org id to route through applyArtifactState,
 * plus `emitDirect` — true when the org is ALREADY selected. In that case
 * applyArtifactState pulses but never re-emits on an unchanged selection
 * (opus P2, mount.ts), so the caller must emit artifact-tap itself to
 * (re)open the modal. Pills never toggle: a totem re-tap deselects, a pill
 * tap always means "open this org's modal". */
export interface PillTapPlan {
  orgId: string
  emitDirect: boolean
}

/** Pure pill-tap decision (unit-tested, no DOM): null = do nothing (no pill
 * in the target chain, or a pill whose org has no mounted artifact — mirrors
 * onSceneClick's `artifactId in calibrated.artifacts` membership gate). */
export function pillTapPlan(
  tappedId: string | null,
  selectedId: string | null,
  hasArtifact: boolean,
): PillTapPlan | null {
  if (tappedId === null || !hasArtifact) return null
  return { orgId: tappedId, emitDirect: tappedId === selectedId }
}
