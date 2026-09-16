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
  /** Artifact hit circle per org id — r rewritten per camera frame (mount.ts). */
  hitCircles: Record<string, SVGCircleElement>
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

/* Phase 5 artifact interaction tuning (SPEC §5/§9 / TODO Phase 5). */

/**
 * Hit-circle sizing (AGENTS invariant 8): the rendered tap diameter must stay
 * ≥ 24 CSS px at every zoom. `u = measureCtm.a × k` maps scene units to CSS
 * px through the measurement owner's camera-free CTM, so the scene radius is
 * `max(base, 12/u)` clamped to a sane ceiling so circles never swallow
 * neighboring artifacts at k = 1. Pure math — mount.ts feeds it per frame.
 */
export const HIT_MIN_RADIUS_PX = 12
export const HIT_BASE_R = 12
export const HIT_MAX_R = 40

export function rSceneFor(k: number, measureA: number): number {
  const u = Math.max(measureA * k, Number.EPSILON) // never divide by zero
  return Math.min(HIT_MAX_R, Math.max(HIT_BASE_R, HIT_MIN_RADIUS_PX / u))
}

/**
 * Idle bob (SPEC §5): per-artifact negative animation-delay step in seconds
 * (inline style on the ambient g — keyframes + duration live in scene.css).
 */
export const ARTIFACT_BOB_STEP = 0.37

/**
 * Arrow stroke length for the Phase 5 dash-draw redraw. Measured, never
 * derived: `getTotalLength()` with the same authored-`d` quadratic fallback
 * intro.ts uses (jsdom ships no path math).
 */
const FALLBACK_ARROW_LENGTH = 200

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

export function arrowPathLength(path: SVGPathElement): number {
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

/** Totem height in scene units — poster-scale, anchored at each base point. */
export const TOTEM_HEIGHT = 190
/** Totem art box width in scene units (icons are near-square poles). */
export const TOTEM_WIDTH = 110
/**
 * Clearance (scene units) between the arrowhead TIP and the totem art box:
 * the head must never touch the art (2026-09-16 user QA, twice — the first
 * fix lifted vertically only, which still clipped tall poles approached
 * from the side).
 */
export const ARROW_TIP_CLEARANCE = 24
/** Extra stroke back-off so the head BODY (30 units) stays out of the box too. */
export const ARROWHEAD_SCENE = 30
/**
 * Title-pill exclusion zone under the totem base (scene units, width AND
 * depth). Real pill: 130px wide × ~53px tall (offset 8 + 2 lines). At the
 * k=1 slice scale 0.635 that is ~205×84 scene units; the tip additionally
 * sits ARROW_TIP_CLEARANCE (24) outside and the head body (30) behind it,
 * so the zone needs half-width 102 + 24 ≈ 126 → 260 covers width with
 * margin, and depth 260u ≈ 165px clears the 53px pill + 15px tip gap +
 * 19px head. Arrows approaching from below must stop short of this zone or
 * their heads hide behind the title (user QA rounds 3–4). Worst case at
 * k=1; at k>1 the zone shrinks in scene units, so k=1 sizing suffices.
 */
export const PILL_BAND_SCENE = 260
/** Control-point perpendicular offset as a fraction of the from→end distance. */
const ARROW_BOW = 0.3
const ARROW_COLOR = '#EDE5CE' // poster arrows: warm cream (sampled 236,233,214)
const ARROW_STROKE = 6
/** Poster-tail dot radius at the from[] end of every arrow (scene units). */
const ARROW_TAIL_R = 9
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

/**
 * Where an arrow from `from` must stop so its marker-end TIP clears the
 * totem art box (bottom-center anchored at `base`, TOTEM_WIDTH ×
 * TOTEM_HEIGHT): march along the straight from→base line to the box
 * boundary, then back off clearance + head length. Direction-agnostic —
 * the old vertical-only lift clipped every pole approached from the side
 * (user QA 2026-09-16, CHIBÉ case). Degenerate from==base falls back to a
 * plain vertical lift above the base.
 */
export function arrowEndPoint(from: Point, base: Point): Point {
  const halfW = TOTEM_WIDTH / 2
  const dx = base.x - from.x
  const dy = base.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return { x: base.x, y: base.y - TOTEM_HEIGHT - ARROW_TIP_CLEARANCE }
  const ux = dx / len
  const uy = dy / len
  /**
   * Ray/AABB entry param for one rect: the t where the from→base ray first
   * sits inside [x0,x1]×[y0,y1] — max of the per-axis entry params (a ray is
   * inside once past BOTH faces). Infinity on an axis it never crosses.
   */
  const rectEntry = (x0: number, x1: number, y0: number, y1: number): number => {
    const tx =
      ux > 0 ? (x0 - from.x) / ux : ux < 0 ? (x1 - from.x) / ux : Infinity
    const ty =
      uy > 0 ? (y0 - from.y) / uy : uy < 0 ? (y1 - from.y) / uy : Infinity
    return Math.max(tx, ty, 0)
  }
  // Two obstacles stacked on the base: the art box above it and the title
  // pill band below it (pills hang under the base — an arrowhead stopping
  // inside the band hides behind the title, user QA round 3). The FIRST face
  // the ray crosses wins (min of the two entries; both are ≥ 0).
  const tArt = rectEntry(base.x - halfW, base.x + halfW, base.y - TOTEM_HEIGHT, base.y)
  const tBand = rectEntry(
    base.x - PILL_BAND_SCENE / 2,
    base.x + PILL_BAND_SCENE / 2,
    base.y,
    base.y + PILL_BAND_SCENE,
  )
  const tEntry = Math.min(tArt, tBand)
  // The TIP sits ARROW_TIP_CLEARANCE before that face; the stroke ends one
  // head-length further back so the marker BODY never overlaps either rect.
  const tTip = Math.max(0, tEntry - ARROW_TIP_CLEARANCE)
  const tEnd = Math.max(0, tTip - ARROWHEAD_SCENE)
  return { x: from.x + ux * tEnd, y: from.y + uy * tEnd }
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

function mountArtifacts(
  cameraNode: SVGGElement,
  data: ComiteData,
): { artifacts: Record<string, SVGGElement>; hitCircles: Record<string, SVGCircleElement> } {
  const layer = svg('g')
  layer.id = 'layer-artifacts'
  const artifacts: Record<string, SVGGElement> = {}
  const hitCircles: Record<string, SVGCircleElement> = {}
  let index = 0
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
    // Phase 5 (SPEC §9): real button semantics like the cities — focusable,
    // labeled from data.json, aria-pressed is mount.ts's selection reflection.
    interaction.setAttribute('tabindex', '0')
    interaction.setAttribute('role', 'button')
    interaction.setAttribute('aria-label', project.name)
    interaction.setAttribute('aria-pressed', 'false')
    // Ambient g owns the Phase 5 idle bob — CSS ONLY, never GSAP (invariant 6:
    // the intro drop + tap pulse tween the INTERACTION g, exactly one
    // transform owner per node). Per-artifact negative delay desyncs the loop.
    const ambient = svg('g')
    ambient.classList.add('artifact-bob')
    ambient.style.animationDelay = `${-(index * ARTIFACT_BOB_STEP)}s`
    adoptChildren(ambient, content)
    interaction.appendChild(ambient)
    placement.appendChild(interaction)
    layer.appendChild(placement)
    // Invisible hit circle at pos (SPEC §9 / invariant 8): the actual tap
    // target, comfortably larger than the totem art at every zoom. It is a
    // SIBLING of the placement g in #layer-artifacts (scene coords, so the
    // pulse/raise scaling of the interaction g never resizes the tap area)
    // and carries the routing attributes so a click bubbles into mount.ts's
    // artifact branch; its r attribute is rewritten per camera frame by
    // mount.ts (never tweened).
    const hit = svg('circle')
    hit.setAttribute('cx', String(pos.x))
    hit.setAttribute('cy', String(pos.y))
    hit.setAttribute('r', String(HIT_BASE_R))
    hit.setAttribute('fill', 'transparent')
    hit.setAttribute('data-interactive', 'artifact')
    hit.setAttribute('data-artifact-id', orgId)
    layer.appendChild(hit)
    artifacts[orgId] = interaction
    hitCircles[orgId] = hit
    index++
  }
  cameraNode.appendChild(layer)
  return { artifacts, hitCircles }
}

function mountArrows(cameraNode: SVGGElement, data: ComiteData): SVGGElement {
  const layer = svg('g')
  layer.id = 'layer-arrows'
  const defs = svg('defs')
  const marker = svg('marker')
  marker.id = 'arrowhead'
  marker.setAttribute('viewBox', '0 0 10 10')
  // refX = 10 puts the head's TIP on the path end point — the stroke is
  // authored to stop one head-length outside the totem art box
  // (arrowEndPoint), so the tip sits ARROW_TIP_CLEARANCE short of the art and
  // the head never overlays it (2026-09-16 user QA).
  marker.setAttribute('refX', '10')
  marker.setAttribute('refY', '5')
  // markerUnits = strokeWidth (default): head scene size = 10/10 × 6 × 5 = 30
  // scene units long, ≈1/6 of the totem height — poster-proportioned.
  marker.setAttribute('markerWidth', '5')
  marker.setAttribute('markerHeight', '5')
  marker.setAttribute('orient', 'auto')
  const head = svg('path')
  head.setAttribute('d', 'M0,0 L10,5 L0,10 Z')
  head.setAttribute('fill', ARROW_COLOR)
  marker.appendChild(head)
  defs.appendChild(marker)
  layer.appendChild(defs)
  for (const [orgId, project] of orgProjects(data)) {
    const pos = project.pos
    if (!pos) continue
    for (const from of pos.from) {
      const path = svg('path')
      // Stroke stops one head-length outside the art box: the marker-end TIP
      // lands ARROW_TIP_CLEARANCE short of the box — head and art never touch
      // (user QA 2026-09-16, direction-agnostic arrowEndPoint).
      const end = arrowEndPoint(from, { x: pos.x, y: pos.y })
      path.setAttribute('d', arrowPath(from, end))
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', ARROW_COLOR)
      path.setAttribute('stroke-width', String(ARROW_STROKE))
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('marker-end', `url(#${marker.id})`)
      // Phase 5: org ownership lets mount.ts redraw one org's arrows on tap.
      path.setAttribute('data-arrow-org', orgId)
      layer.appendChild(path)
      // Poster tail dot: the little circle where the arrow leaves the hub
      // (user QA 2026-09-16). Own hit-transparent, decorative sibling.
      const tail = svg('circle')
      tail.setAttribute('cx', String(from.x))
      tail.setAttribute('cy', String(from.y))
      tail.setAttribute('r', String(ARROW_TAIL_R))
      tail.setAttribute('fill', ARROW_COLOR)
      tail.setAttribute('data-arrow-org', orgId)
      layer.appendChild(tail)
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
  const { artifacts, hitCircles } = mountArtifacts(cameraNode, data)
  const arrows = mountArrows(cameraNode, data)
  return { waves, squiggles, cities, artifacts, hitCircles, arrows }
}
