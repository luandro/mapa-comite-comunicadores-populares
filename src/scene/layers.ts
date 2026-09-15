/**
 * Calibrated layers above the base map (SPEC §4 items 5–8): waves, squiggles,
 * city land masses, artifacts and arrows — the STATIC Phase 1.5 composite.
 *
 * Every placable group follows the SPEC §3 nested-wrapper mandate:
 * placement <g transform> → interaction <g> (GSAP target, Phase 4/5) →
 * ambient <g> (CSS target, Phase 2/5) → content. No node ever carries two
 * transform owners, and no animation is attached in this phase.
 */
import { SCENE_WIDTH } from '../data/constants'
import { DEFAULT_ICON } from '../data/schema'
import type { ComiteData, Point, Project } from '../data/types'
import { cityPlacements, squigglePlacement, wavePlacements } from './placements'
import type { Camera } from './types'
import cityAnanindeua from '/na cuia/icons/svg/mapa ananindeua.svg?scene'
import cityBelem from '/na cuia/icons/svg/mapa belém.svg?scene'
import cityMoju from '/na cuia/icons/svg/mapa moju.svg?scene'
import onda1 from '/na cuia/icons/svg/onda 1.svg?scene'
import onda2 from '/na cuia/icons/svg/onda 2.svg?scene'
import onda4 from '/na cuia/icons/svg/onda 4.svg?scene'
import ondinhas from '/na cuia/icons/svg/ondinhas mapa geral.svg?scene'

/** Icon artifacts resolve through the glob (AGENTS invariant 10 — data promise). */
const iconModules = import.meta.glob('/na cuia/icons/svg/icone *.svg', {
  query: '?scene',
  import: 'default',
  eager: true,
}) as Record<string, string>

export interface CalibratedLayers {
  waves: SVGGElement
  squiggles: SVGGElement
  cities: Record<string, SVGGElement>
  artifacts: Record<string, SVGGElement>
  arrows: SVGGElement
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** SPEC §1 ground truth: every band (and the squiggle texture) is 2160.32 wide. */
const BAND_WIDTH = 2160.32
/** SPEC §5 waveScale — uniform on both axes: scene width / band width ≈ 1.3994. */
const BAND_SCALE = SCENE_WIDTH / BAND_WIDTH
/** Source band opacities resolved by the pipeline onto the asset root (SPEC §1). */
const BAND_OPACITY = { onda1: null, onda2: 0.8, onda4: 0.2 } as const

/**
 * Phase 2 ambient motion (SPEC §5). The [A][A′][A] chain inside each ambient
 * g has period 2W, so the seamless drift distance is 2 × 2160.32 = 4320.64
 * band-local units (keyframes `wave-drift` in scene.css). Each band gets its
 * own duration and a negative phase delay so the bands never sync visually.
 */
export const WAVE_DRIFT_DISTANCE = 2 * BAND_WIDTH // 4320.64
export const WAVE_DRIFT_BY_BAND: Record<
  'onda1' | 'onda2' | 'onda4',
  { duration: number; delay: number }
> = {
  onda1: { duration: 8, delay: -2.7 },
  onda2: { duration: 11, delay: -5.3 },
  onda4: { duration: 14, delay: -9.1 },
}
/** Ondinhas drift ±40 band-local units + opacity pulse, both alternate. */
export const SQUIGGLE_MOTION = { duration: 12, pulseDuration: 6 } as const

/** Totem height in scene units — first-pass sizing, recalibrated in Phase 1.5. */
const TOTEM_HEIGHT = 110
/** Arrowhead stops this many scene units above the totem base point. */
const ARROW_END_LIFT = 40
/** Control-point perpendicular offset as a fraction of the from→end distance. */
const ARROW_BOW = 0.3
const ARROW_COLOR = '#F2DCB0'
const ARROW_STROKE = 6
const DOT_RADIUS = 8

const CITY_ASSETS = { belem: cityBelem, ananindeua: cityAnanindeua, moju: cityMoju }
const CITY_IDS = ['belem', 'ananindeua', 'moju'] as const

/** Icon ids normalize by stripping spaces/hyphens ("icone-6" ≙ "icone 6.svg"). */
function normalizeIconId(id: string): string {
  return id.toLowerCase().replace(/[\s-]+/g, '')
}

const iconByNormalId: Record<string, string> = {}
for (const [path, content] of Object.entries(iconModules)) {
  const stem =
    path
      .split('/')
      .pop()
      ?.replace(/\.svg$/, '') ?? ''
  iconByNormalId[normalizeIconId(stem)] = content
}

function resolveIcon(icon: string | undefined, orgId: string): string {
  const wanted = icon ?? DEFAULT_ICON
  const content = iconByNormalId[normalizeIconId(wanted)]
  if (content !== undefined) return content
  console.warn(
    `[scene] unknown icon "${wanted}" for org "${orgId}" — defaulting to "${DEFAULT_ICON}"`,
  )
  const fallback = iconByNormalId[normalizeIconId(DEFAULT_ICON)]
  if (fallback === undefined) {
    throw new Error(`[scene] default icon "${DEFAULT_ICON}" missing from the icon glob`)
  }
  return fallback
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag)
}

function parseViewBox(processed: string): { width: number; height: number } {
  const root = new DOMParser().parseFromString(processed, 'image/svg+xml').documentElement
  const parts = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const [width, height] = parts.slice(2)
  if (parts.length !== 4 || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(
      `[scene] asset viewBox missing or unparseable: "${root.getAttribute('viewBox')}"`,
    )
  }
  return { width, height }
}

/**
 * Move a processed asset's element children into `target`. Top-level `id`s are
 * stripped: the same processed asset inlines more than once (3-copy wave
 * chains, the default totem per org) and duplicate ids would poison url(#…)
 * lookups — none of these assets reference their own ids (empty `<defs/>`).
 */
function adoptChildren(target: SVGGElement, processed: string): void {
  const root = new DOMParser().parseFromString(processed, 'image/svg+xml').documentElement
  for (const child of Array.from(root.children)) {
    child.removeAttribute('id')
    target.appendChild(child) // DOM4 auto-adopt, document order preserved
  }
}

/** Every org across every city, in data order (SPEC §7 — data.json is canonical). */
export function* orgProjects(data: ComiteData): Generator<[id: string, project: Project]> {
  for (const city of Object.values(data.maps)) {
    for (const entry of Object.entries(city.projects)) {
      yield entry
    }
  }
}

/** Authored quadratic Bézier (SPEC §3 — arrows exist in no reusable asset). */
function arrowPath(from: Point, end: Point): string {
  const dx = end.x - from.x
  const dy = end.y - from.y
  const cx = (from.x + end.x) / 2 - dy * ARROW_BOW
  const cy = (from.y + end.y) / 2 + dx * ARROW_BOW
  return `M${from.x},${from.y} Q${cx},${cy} ${end.x},${end.y}`
}

function mountWaves(cameraNode: SVGGElement): SVGGElement {
  const layer = svg('g')
  layer.id = 'layer-waves'
  const bands = [
    { id: 'onda1', content: onda1 },
    { id: 'onda2', content: onda2 },
    { id: 'onda4', content: onda4 },
  ] as const
  for (const band of bands) {
    const row = wavePlacements[band.id]
    const placement = svg('g')
    placement.setAttribute('data-band', band.id)
    placement.setAttribute(
      'transform',
      `translate(${row.x},${row.y}) scale(${(row.scale ?? 1) * BAND_SCALE})`,
    )
    // Ambient g owns the Phase 2 CSS drift — placement keeps its transform,
    // never two owners on one node (AGENTS invariant 6). Class + inline
    // duration/delay come from WAVE_DRIFT_BY_BAND; keyframes are in scene.css.
    const ambient = svg('g')
    ambient.classList.add('wave-drift')
    const { duration, delay } = WAVE_DRIFT_BY_BAND[band.id]
    ambient.style.animationDuration = `${duration}s`
    ambient.style.animationDelay = `${delay}s`
    const opacity = BAND_OPACITY[band.id]
    if (opacity !== null) ambient.setAttribute('opacity', String(opacity))
    // Copy A — raw band content at band-local 0.
    adoptChildren(ambient, band.content)
    // Copy A′ — mirrored INTO the second slot: translate(2W)·scale(-1,1) maps
    // x → 2W − x, so the band (viewBox [0,W]) lands on [W,2W] — the chain is
    // truly [A][A′][A] (a 1W offset would stack A′ on top of A — opus P0).
    // Junctions are exact: A right edge (x=W) meets A′ mirrored right edge;
    // A′ mirrored left edge (x=2W) meets trailing A left edge; wrap exact.
    const mirrored = svg('g')
    mirrored.setAttribute('transform', `translate(${BAND_WIDTH * 2},0) scale(-1,1)`)
    adoptChildren(mirrored, band.content)
    // Copy A — third, two band widths right; at wrap it sits where A was.
    const trailing = svg('g')
    trailing.setAttribute('transform', `translate(${BAND_WIDTH * 2},0)`)
    adoptChildren(trailing, band.content)
    ambient.append(mirrored, trailing)
    placement.appendChild(ambient)
    layer.appendChild(placement)
  }
  cameraNode.appendChild(layer)
  return layer
}

function mountSquiggles(cameraNode: SVGGElement): SVGGElement {
  const layer = svg('g')
  layer.id = 'layer-squiggles'
  const placed = squigglePlacement
  const widthFit = SCENE_WIDTH / parseViewBox(ondinhas).width
  const placement = svg('g')
  placement.setAttribute(
    'transform',
    `translate(${placed.x},${placed.y}) scale(${(placed.scale ?? 1) * widthFit})`,
  )
  // Ambient g owns the Phase 2 CSS sway + pulse (class in scene.css; duration
  // split drift/pulse via the comma-list inline longhands).
  const ambient = svg('g')
  ambient.classList.add('squiggle-drift')
  ambient.style.animationDuration = `${SQUIGGLE_MOTION.duration}s, ${SQUIGGLE_MOTION.pulseDuration}s`
  adoptChildren(ambient, ondinhas)
  placement.appendChild(ambient)
  layer.appendChild(placement)
  cameraNode.appendChild(layer)
  return layer
}

function mountCities(cameraNode: SVGGElement, data: ComiteData): Record<string, SVGGElement> {
  const cities: Record<string, SVGGElement> = {}
  for (const id of CITY_IDS) {
    const layer = svg('g')
    layer.id = `layer-city-${id}`
    const placed = cityPlacements[id]
    const placement = svg('g')
    placement.setAttribute(
      'transform',
      `translate(${placed.x},${placed.y}) scale(${placed.scale ?? 1})`,
    )
    // Phase 4 (SPEC §9): the interaction g is the tap/keyboard target AND the
    // GSAP raise target (mount.ts); [data-interactive] also opts city taps out
    // of the empty-tap closest() check there. Real button semantics —
    // focusable, labeled from data.json (moju has no map entry yet: id
    // fallback), aria-pressed maintained by mount.ts on raise/reverse.
    const interaction = svg('g')
    interaction.setAttribute('data-interactive', 'city')
    interaction.setAttribute('data-city-id', id)
    interaction.setAttribute('tabindex', '0')
    interaction.setAttribute('role', 'button')
    interaction.setAttribute('aria-label', data.maps[id]?.name ?? id)
    interaction.setAttribute('aria-pressed', 'false')
    const ambient = svg('g') // CSS stays free — raise tweens own the interaction g
    adoptChildren(ambient, CITY_ASSETS[id])
    interaction.appendChild(ambient)
    placement.appendChild(interaction)
    layer.appendChild(placement)
    cameraNode.appendChild(layer)
    cities[id] = interaction
  }
  return cities
}

function mountArtifacts(cameraNode: SVGGElement, data: ComiteData): Record<string, SVGGElement> {
  const layer = svg('g')
  layer.id = 'layer-artifacts'
  const artifacts: Record<string, SVGGElement> = {}
  for (const [orgId, project] of orgProjects(data)) {
    const pos = project.pos
    if (!pos) continue // no calibrated position yet — renders nothing (Phase 5)
    const content = resolveIcon(project.icon, orgId)
    const { width, height } = parseViewBox(content)
    const scale = TOTEM_HEIGHT / height
    const placement = svg('g')
    // pos is the totem BASE point: bottom-center of the placed art box.
    placement.setAttribute(
      'transform',
      `translate(${pos.x - (width * scale) / 2},${pos.y - height * scale}) scale(${scale})`,
    )
    const interaction = svg('g')
    interaction.setAttribute('data-interactive', 'artifact')
    interaction.setAttribute('data-artifact-id', orgId)
    const ambient = svg('g') // Phase 5 bob target — no transform yet
    adoptChildren(ambient, content)
    interaction.appendChild(ambient)
    placement.appendChild(interaction)
    layer.appendChild(placement)
    artifacts[orgId] = interaction
  }
  cameraNode.appendChild(layer)
  return artifacts
}

function mountArrows(cameraNode: SVGGElement, data: ComiteData): SVGGElement {
  const layer = svg('g')
  layer.id = 'layer-arrows'
  const defs = svg('defs')
  const marker = svg('marker')
  marker.id = 'arrowhead'
  marker.setAttribute('viewBox', '0 0 10 10')
  marker.setAttribute('refX', '9')
  marker.setAttribute('refY', '5')
  marker.setAttribute('markerWidth', '5')
  marker.setAttribute('markerHeight', '5')
  marker.setAttribute('orient', 'auto')
  const head = svg('path')
  head.setAttribute('d', 'M0,0 L10,5 L0,10 Z')
  head.setAttribute('fill', ARROW_COLOR)
  marker.appendChild(head)
  defs.appendChild(marker)
  layer.appendChild(defs)
  for (const [, project] of orgProjects(data)) {
    const pos = project.pos
    if (!pos) continue
    for (const from of pos.from) {
      const path = svg('path')
      path.setAttribute('d', arrowPath(from, { x: pos.x, y: pos.y - ARROW_END_LIFT }))
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', ARROW_COLOR)
      path.setAttribute('stroke-width', String(ARROW_STROKE))
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('marker-end', `url(#${marker.id})`)
      layer.appendChild(path)
      // Decorative source dot (SPEC §9 — never focusable; no tabindex).
      const dot = svg('circle')
      dot.setAttribute('cx', String(from.x))
      dot.setAttribute('cy', String(from.y))
      dot.setAttribute('r', String(DOT_RADIUS))
      dot.setAttribute('fill', ARROW_COLOR)
      layer.appendChild(dot)
    }
  }
  cameraNode.appendChild(layer)
  return layer
}

/**
 * Mount every calibrated layer above `layer-water-detail`, in SPEC §4 order:
 * waves → squiggles → city-{belem,ananindeua,moju} → artifacts → arrows.
 * `cities`/`artifacts` map ids to their interaction groups (the Phase 4/5
 * GSAP targets); `waves`/`squiggles`/`arrows` are the layer groups.
 */
export function mountCalibratedLayers(
  cameraNode: SVGGElement,
  data: ComiteData,
  // Reserved for Phase 5 hit sizing (r_scene ≥ 12/u); intentionally unread.
  _camera: Camera,
): CalibratedLayers {
  const waves = mountWaves(cameraNode)
  const squiggles = mountSquiggles(cameraNode)
  const cities = mountCities(cameraNode, data)
  const artifacts = mountArtifacts(cameraNode, data)
  const arrows = mountArrows(cameraNode, data)
  return { waves, squiggles, cities, artifacts, arrows }
}
