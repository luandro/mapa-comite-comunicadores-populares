import { SCENE_WIDTH } from '../../data/constants'
import type { Point } from '../../data/types'
import { cityPlacements, squigglePlacement, underlayPlacement, type Placement } from '../placements'

/** Natural size of `na cuia/Mapa.jpeg` — the calibration underlay. */
export const UNDERLAY_WIDTH = 1599
export const UNDERLAY_HEIGHT = 899

/** Default width-fit: the mockup spans the full scene width (SPEC §12 risk 6). */
export const DEFAULT_UNDERLAY_SCALE = SCENE_WIDTH / UNDERLAY_WIDTH

/**
 * Uniform width-fit (SPEC §5 / AGENTS 5): the squiggle texture is a
 * 2160.32-wide asset (SPEC §1); its placement group mounts
 * `translate(x,y) scale((scale ?? 1) × FIT)`. The tool edits the ROW scale
 * (the placements.ts record) and rewrites the composed attribute.
 */
const BAND_WIDTH_FIT = SCENE_WIDTH / 2160.32

export type TargetKind = 'underlay' | 'city' | 'squiggle'

/** placements.ts entry copied for live editing — cities also carry `labelAnchor`. */
export type MutablePlacement = Placement & { labelAnchor?: Point }

/**
 * One calibratable placement record. `placement` is a MUTABLE copy of the
 * `placements.ts` entry — the tool never writes the module records; the human
 * pastes the copied snippet back into the file (honest-data loop, AGENTS 10).
 */
export interface CalibTarget {
  id: string
  kind: TargetKind
  /** pt-BR dropdown label */
  label: string
  /** owning `#layer-*` group; null for the tool-created underlay image */
  layerId: string | null
  /** fallback index among the layer's outermost placement groups */
  index: number
  placement: MutablePlacement
}

type CityId = 'belem' | 'ananindeua' | 'moju'

const CITY_LABELS: Record<CityId, string> = {
  belem: 'Belém',
  ananindeua: 'Ananindeua',
  moju: 'Moju',
}

const DEFAULT_PLACEMENT: MutablePlacement = { x: 0, y: 0, scale: 1 }

/** The dropdown model, in display order; uncalibrated records start at {0,0,1}. */
export function buildTargets(): CalibTarget[] {
  const cities = (Object.keys(CITY_LABELS) as CityId[]).map((id): CalibTarget => ({
    id,
    kind: 'city',
    label: CITY_LABELS[id],
    layerId: `layer-city-${id}`,
    index: 0,
    placement: cityPlacements[id] ? { ...cityPlacements[id] } : { ...DEFAULT_PLACEMENT },
  }))
  return [
    {
      id: 'underlay',
      kind: 'underlay',
      label: 'Underlay (Mapa.jpeg)',
      layerId: null,
      index: 0,
      placement: underlayPlacement
        ? { ...underlayPlacement }
        : { x: 0, y: 0, scale: DEFAULT_UNDERLAY_SCALE },
    },
    ...cities,
    {
      id: 'squiggle',
      kind: 'squiggle',
      label: 'Ondinhas (squiggle)',
      layerId: 'layer-squiggles',
      index: 0,
      placement: squigglePlacement ? { ...squigglePlacement } : { ...DEFAULT_PLACEMENT },
    },
  ]
}

/** Fixed-decimals number → shortest clean literal (`1.4000` → `1.4`). */
export function fmt(value: number, decimals: number): string {
  return String(+(Number.isFinite(value) ? value : 0).toFixed(decimals))
}

/**
 * Uniform-scale-only placement transform (SPEC §3 — never rotation, never
 * non-uniform). Band-width assets (waves, squiggle) compose the SPEC §5 fit
 * exactly as layers.ts mounts them, so the tool edits row scale only.
 */
export function placementTransform(target: CalibTarget): string {
  const { x, y, scale } = target.placement
  const composesFit = target.kind === 'squiggle'
  const composed = (scale ?? 1) * (composesFit ? BAND_WIDTH_FIT : 1)
  return `translate(${fmt(x, 2)},${fmt(y, 2)}) scale(${fmt(composed, 4)})`
}

/**
 * Paste-ready `placements.ts` snippet for the target's current placement.
 * `labelAnchor` (city records) passes through verbatim so a paste REPLACES the
 * entry without losing the anchor PhaseLayers chose.
 */
export function placementSnippet(target: CalibTarget): string {
  const { x, y, labelAnchor } = target.placement
  let body = `{ x: ${fmt(x, 2)}, y: ${fmt(y, 2)}, scale: ${fmt(target.placement.scale ?? 1, 4)}`
  if (labelAnchor) {
    body += `, labelAnchor: { x: ${fmt(labelAnchor.x, 2)}, y: ${fmt(labelAnchor.y, 2)} }`
  }
  body += ' }'
  // Record members paste straight into cityPlacements; the single-record
  // exports (squiggle/underlay) take the bare object literal.
  return target.kind === 'city' ? `'${target.id}': ${body},` : body
}

/** Paste-ready `initialFraming` candidate (scene coords, 2 decimals). */
export function framingSnippet(focus: Point): string {
  return `{ x: ${fmt(focus.x, 2)}, y: ${fmt(focus.y, 2)} }`
}

/**
 * The target's placement group: the outermost `<g>` child of its `#layer-*`
 * group (AGENTS invariant 6 — placement → interaction → ambient wrappers).
 */
export function findPlacementGroup(
  sceneSvg: SVGSVGElement,
  target: CalibTarget,
): SVGGElement | null {
  if (!target.layerId) return null
  const layer = sceneSvg.querySelector(`#${target.layerId}`)
  if (!(layer instanceof SVGGElement)) return null
  const outer = Array.from(layer.children).filter(
    (child): child is SVGGElement => child instanceof SVGGElement,
  )
  return outer[target.index] ?? null
}
