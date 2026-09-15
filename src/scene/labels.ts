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
 * CSS class owns the offset around the anchor point — two transform owners,
 * two nodes (SPEC §3).
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
  // The offset around the anchor is GSAP property (percent-based) — NOT CSS
  // `transform` on the same node. The intro tweens scale on these divs, and
  // GSAP bakes any pre-existing CSS transform to px on first touch (fractional
  // widths round wrong + font-swap reflows would de-center labels permanently —
  // opus P1). One owner: JS per-frame on the anchor, GSAP property on the div.
  if (kind === 'label-pill') {
    gsap.set(label, { xPercent: -50, yPercent: -100, y: -8 })
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
 */
export function updateLabels(el: HTMLElement, state: TransformState, measureCtm: DOMMatrix): void {
  for (const child of el.children) {
    if (!(child instanceof HTMLDivElement)) continue
    const x = Number(child.dataset.x)
    const y = Number(child.dataset.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const sx = state.k * x + state.x
    const sy = state.k * y + state.y
    const px = measureCtm.a * sx + measureCtm.c * sy + measureCtm.e
    const py = measureCtm.b * sx + measureCtm.d * sy + measureCtm.f
    child.style.transform = `translate(${px}px, ${py}px)`
  }
}
