/**
 * DOM: .scene-root > svg#scene > g#camera > 3 base layers + calibrated
 * composite (SPEC §4: squiggles, cities, artifacts, arrows; the sea rect is
 * unmounted — the .scene-root CSS background is the ocean); plus svg#measure
 * and the #labels div as siblings of the scene SVG — outside any camera
 * transform.
 * Scene island (SPEC §3/§10): the animated map lives entirely outside the
 * React tree. `mountScene` builds the composed SVG imperatively inside `el`,
 * wires the camera, and returns the single controller React talks to.
 */
import { SCENE_HEIGHT, SCENE_WIDTH } from '../data/constants'
import type { ComiteData } from '../data/types'
import { gsap } from 'gsap'
import { isMobile } from '../device'
import { createCamera } from './camera'
import {
  ARTIFACT_DROP_FROM,
  buildIntroTimeline,
  clearArrowDash,
  finalizeIntroTargets,
  INTRO_DONE_CLASS,
  prefersReducedMotion,
  primeIntroTargets,
} from './intro'
import type { IntroTargets } from './intro'
import {
  arrowPathLength,
  mountCalibratedLayers,
  orgIdsForCity,
  orgProjects,
  rSceneFor,
} from './layers'
import {
  createLabelsLayer,
  IDENTITY_CTM,
  pillTapPlan,
  renderLabels,
  updateLabels,
  updatePillFade,
} from './labels'
import { cityPlacements } from './placements'
import { assertBaseCounts, partitionBase } from './partition'
import { initialFraming } from './placements'
import './scene.css'
import type { Box, Camera, FlyToOptions, ObstructionRect, TransformState } from './types'
import { unfocusFlight } from './unfocus'
import processedBase from '/na cuia/icons/svg/mapa cru.svg?scene'

export interface SceneController {
  /** Idempotent: tears down camera, listeners and injected DOM — StrictMode/HMR safe. */
  destroy(): void
  onTransform(cb: (t: TransformState) => void): () => void
  /** Viewport-space rect (CSS px). Desktop-only policy: mobile coerces to null. */
  setObstruction(rect: ObstructionRect | null): void
  flyTo(target: Box, opts?: FlyToOptions): void
  zoomBy(factor: number): void
  reset(): void
  focusCity(id: string): void
  focusArtifact(id: string): void
  /** Clear the artifact selection (settle, no emit) and fly the camera back
   * out (issue #11) — the panel-close path shares the exact deselect flow of
   * an empty-tap so the primary outside-tap gesture zooms back out too. */
  deselectArtifact(): void
  /** Kill the entrance timeline and jump to the final state. Idempotent. */
  skipIntro(): void
  /** Fires once the entrance resolves (timeline end, skip, or reduced-motion);
   * registering after that fires the callback immediately. */
  onIntroDone(cb: () => void): () => void
  on(event: 'artifact-tap' | 'city-tap', cb: (id: string) => void): () => void
  on(event: 'empty-tap', cb: () => void): () => void
}

/** Minimal typed pub/sub — `on` returns its own unsubscriber (idempotent). */
function createHub<Args extends unknown[]>() {
  const subscribers = new Set<(...args: Args) => void>()
  return {
    on(cb: (...args: Args) => void): () => void {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
    emit(...args: Args): void {
      for (const cb of subscribers) cb(...args)
    },
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/* Issue #12 city-tap replay tuning: a tap NO LONGER raises/dims city groups —
   it re-runs the entrance choreography for ONLY the organizations connected
   to the tapped city (totem drop + arrow dash-draw + tail-dot fade), as if
   the app freshly rendered for that city. One org at a time (its full
   tween family retires before the next org starts — SPEC §11 budget). */
const CITY_REPLAY_DROP_DURATION = 0.5
const CITY_REPLAY_ARROW_DURATION = 0.45

/* User directive 2026-09-18: a city tap RE-INTRODUCES the dim (issue #12 had
   removed it) AND filters the scene to the selected city's connected orgs —
   other cities' totems, arrows, hit circles and title pills fade out and
   stop hit-testing, so only the selected city's network stays legible. The
   dim applies to the OTHER city groups; the filter applies per ORG (data
   maps orgs to cities, cities to nothing). */
const CITY_DIM_OPACITY = 0.35
const CITY_FILTER_DURATION = 0.5

/**
 * Keyboard-modality focus affordance (issue #12): the old `:focus-visible`
 * outline painted a black-bordered RECTANGLE around the group bbox on an SVG
 * `<g>` — and mobile focus heuristics can surface it after pointer taps. The
 * focusin/focusout handlers below (which already gate on `:focus-visible`)
 * toggle this class; scene.css draws a drop-shadow halo for it and kills the
 * outline. Pointer input never paints anything.
 */
const KBD_FOCUS_CLASS = 'is-kbd-focus'

/**
 * Issue #12 replay-state decision (pure, unit-tested): for a city-selection
 * transition, what must happen to the replayed org set?
 * - `'replay'` — a NEW city was selected: replay its orgs' entrance
 * - `'settle'` — a selection reversed (empty-tap / toggle-off): re-finalize
 *   the replayed orgs to their rest state so nothing lingers
 * - `'none'`   — no change (applyCityState early-returns before this; kept
 *   total so the decision table is testable on its own)
 */
export function cityReplayAction(
  prev: string | null,
  next: string | null,
): 'replay' | 'settle' | 'none' {
  if (prev === next) return 'none'
  if (next !== null) return 'replay'
  return prev !== null ? 'settle' : 'none'
}

/**
 * Native viewBox sizes of the city assets (handoff context) — with the
 * placements these give each city's scene-coordinate box for focus-fly.
 */
const CITY_VIEWBOX: Record<'belem' | 'ananindeua' | 'moju', [number, number]> = {
  belem: [1157.53, 1026.18],
  ananindeua: [625.23, 618.08],
  moju: [741.7, 1131.89],
}

/* Phase 5 artifact interaction tuning (SPEC §5 / TODO Phase 5). */
const ARTIFACT_PULSE_SCALE = 1.15 // tap pulse peak (1 → 1.15 → rest, 0.4 s)
const ARTIFACT_PULSE_DURATION = 0.4
const ARTIFACT_SELECTED_SCALE = 1.08 // persistent scale while selected
const ARTIFACT_SETTLE_DURATION = 0.35
const ARROW_REDRAW_DURATION = 0.6 // per-org dash-draw re-run on tap
/** focusArtifact flies to a box this many scene units around the org pos. */
const ARTIFACT_FOCUS_BOX = 120
/** Deselect fly-back duration (issue #11) — the same beat as the camera reset. */
const UNFOCUS_DURATION = 0.6

export function mountScene(el: HTMLElement, data: ComiteData): SceneController {
  // DOM: .scene-root > svg#scene > g#camera > 3 base layers; plus svg#measure and
  // the #labels div as siblings of the scene SVG — outside any camera transform.
  const root = document.createElement('div')
  root.className = 'scene-root'

  const sceneSvg = document.createElementNS(SVG_NS, 'svg')
  sceneSvg.id = 'scene'
  sceneSvg.setAttribute('viewBox', `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`)
  sceneSvg.setAttribute('preserveAspectRatio', 'xMidYMid slice')

  const cameraNode = document.createElementNS(SVG_NS, 'g')
  cameraNode.id = 'camera'
  sceneSvg.appendChild(cameraNode)

  const measureSvg = document.createElementNS(SVG_NS, 'svg')
  measureSvg.id = 'measure'
  measureSvg.setAttribute('viewBox', `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`)
  measureSvg.setAttribute('preserveAspectRatio', 'xMidYMid slice')

  // Base-map partition (chunk A pipeline); counts asserted before anything mounts.
  const layers = partitionBase(processedBase)
  assertBaseCounts(layers)

  // SPEC §4 order — water-detail sits ABOVE roads (source paint order, §2).
  // The sea rect is not mounted (v1.1): the .scene-root CSS background is the
  // ocean. The group wrappers are the Phase 3 entrance targets.
  const layerGroups: {
    land: SVGGElement
    roads: SVGGElement
    waterDetail: SVGGElement
  } = { land: null!, roads: null!, waterDetail: null! }
  const layerStack: Array<[id: string, nodes: Element[]]> = [
    ['layer-land', layers.land],
    ['layer-roads', layers.roads],
    ['layer-water-detail', layers.waterDetail],
  ]
  for (const [id, nodes] of layerStack) {
    const g = document.createElementNS(SVG_NS, 'g')
    g.id = id
    if (id === 'layer-land') layerGroups.land = g
    else if (id === 'layer-roads') layerGroups.roads = g
    else if (id === 'layer-water-detail') layerGroups.waterDetail = g
    for (const node of nodes) g.appendChild(node) // DOM4 auto-adopt, order preserved
    cameraNode.appendChild(g)
  }

  root.appendChild(sceneSvg)
  root.appendChild(measureSvg)
  el.appendChild(root)

  const labels = createLabelsLayer(root)

  const transformHub = createHub<[TransformState]>()
  const artifactTapHub = createHub<[string]>()
  const cityTapHub = createHub<[string]>()
  const emptyTapHub = createHub<[]>()

  const camera: Camera = createCamera({
    container: root,
    sceneSvg,
    cameraNode,
    measureSvg,
    initialCenter: initialFraming,
    onFrame: (state) => transformHub.emit(state),
  })

  // Calibrated composite (SPEC §4 items 5–8) appends above layer-water-detail.
  // The camera handle is a seam for Phase 5 hit sizing (r_scene ≥ 12/u).
  const calibrated = mountCalibratedLayers(cameraNode, data, camera)

  // Org pills at artifact pos + city name labels, repositioned every frame
  // through the measurement owner's camera-free CTM (AGENTS invariant 12).
  const artifactAnchors: Record<string, { x: number; y: number }> = {}
  for (const [orgId, project] of orgProjects(data)) {
    if (project.pos) artifactAnchors[orgId] = { x: project.pos.x, y: project.pos.y }
  }
  renderLabels(labels.el, data, artifactAnchors)
  const mobile = isMobile()
  const positionLabels = (state: TransformState) => {
    // jsdom ships no getScreenCTM at all (and browsers return null pre-layout)
    // — IDENTITY_CTM keeps the math defined either way.
    const measureCtm = measureSvg.getScreenCTM?.() ?? IDENTITY_CTM
    // Distance gate OFF (user QA round 4): top/bottom totems lost their titles
    // on mobile — every org title must stay visible; the zoom gate below still
    // hides pills zoomed out.
    updateLabels(labels.el, state, measureCtm, false)
    // Phase 5 (SPEC §5, mobile only): zoom-gated pill fade with ±10%
    // hysteresis inside updatePillFade — opacity/visibility only.
    if (mobile) updatePillFade(labels.el, state.k)
    // Phase 5 (AGENTS invariant 8): keep every artifact hit circle ≥ 24 CSS px
    // in diameter at every zoom. u = measureCtm.a × k with k from the
    // CONTROLLER state carried in this callback (never a DOM camera read);
    // measureCtm is the measurement owner's camera-free CTM — the same source
    // updateLabels projects through, by construction.
    const r = rSceneFor(state.k, measureCtm.a)
    for (const circle of Object.values(calibrated.hitCircles)) {
      circle.setAttribute('r', String(r))
    }
  }
  const offLabels = transformHub.on(positionLabels)
  positionLabels(camera.getState()) // camera's initial frame predated this subscription
  // Font swap (display=swap) changes pill metrics after first paint; pushes
  // are layout-derived, so recompute once webfonts settle (opus r2 P1).
  if (typeof document !== 'undefined' && 'fonts' in document) {
    void document.fonts.ready.then(() => positionLabels(camera.getState()))
  }

  // DEV-only calibration tool (Phase 1.5): the dynamic import keeps its bytes
  // out of production bundles entirely (AGENTS invariant 3).
  if (import.meta.env.DEV) {
    void import('./calibration').then((m) => m.attachCalibration(root, sceneSvg)).catch(() => {})
  }

  // --- Issue #12: city tap = replay the connected orgs' entrance -------------
  // `raisedCityId` stays the single selection-state owner; each city group's
  // aria-pressed is its DOM reflection. The raise/dim tweens are GONE — a tap
  // now replays the entrance for ONLY that city's orgs. The replay's totem
  // tweens live in cityCtx (reverted in destroy()); arrow redraws stay in
  // artifactCtx via redrawOrgArrows — never two owners per node (invariant 6:
  // GSAP touches only the interaction g; the placement g's transform
  // attribute is never touched, the ambient g stays CSS-free).
  let raisedCityId: string | null = null
  /** Orgs touched by the current/last city replay — the settle scope below. */
  let replayedOrgIds: string[] = []
  const cityCtx = gsap.context(() => {}, sceneSvg)
  const reduceMotion = prefersReducedMotion()

  function applyCityState(nextId: string | null): void {
    if (nextId === raisedCityId) return // no state change → no replay, no emit
    // A tap during the entrance would fight the intro's own artifact tweens
    // (same nodes/properties: the intro ends them at y:0/opacity:1 and would
    // erase a mid-flight replay). Settle the entrance first — skipIntro() is
    // idempotent and finalizes every intro target instantly.
    if (!introDone) skipIntro()
    const action = cityReplayAction(raisedCityId, nextId)
    raisedCityId = nextId
    for (const [id, interaction] of Object.entries(calibrated.cities)) {
      interaction.setAttribute('aria-pressed', String(id === nextId))
    }
    if (action === 'settle') settleCityReplay()
    if (nextId !== null) {
      replayCityIntro(nextId) // also settles any previous city's replay first
      // city-tap fires on selection CHANGE only (never on reverse) — the
      // camera fly is the caller's business (focusCity / App subscribers).
      cityTapHub.emit(nextId)
    }
    // Filter LAST: the replay's settle pass force-restores its org set to
    // opacity 1 — running the filter before it would let that settle clobber
    // the just-hidden orgs. Filter-after-replay makes the filter the final
    // word on visibility (and its fade-in overlaps the replay's own tweens
    // benignly — both end at opacity 1).
    applyCityFilter(nextId)
  }

  /** One org's attributed arrow elements in #layer-arrows (paths + tail dots).
   * Indexed ONCE by exact org id (codex r1 P2): ids come from data.json keys
   * and are interpolated into attribute selectors here — a content-only org
   * id containing selector syntax (quotes, brackets) would make
   * querySelectorAll throw mid-replay and strand the city's orgs hidden. An
   * exact-string index needs no escaping and cannot throw. */
  function orgArrows(orgId: string): { paths: SVGPathElement[]; tails: SVGCircleElement[] } {
    const paths: SVGPathElement[] = []
    const tails: SVGCircleElement[] = []
    // jsdom ships no SVGPathElement/SVGCircleElement constructors — use
    // getAttribute + localName instead of instanceof (the old selector-based
    // code never needed the constructors; keep it that way).
    for (const el of Array.from(calibrated.arrows.children)) {
      const node = el as Element
      if (node.getAttribute('data-arrow-org') !== orgId) continue
      if (node.localName === 'path') paths.push(node as unknown as SVGPathElement)
      else if (node.localName === 'circle') tails.push(node as unknown as SVGCircleElement)
    }
    return { paths, tails }
  }

  /**
   * Issue #12 reset: kill any in-flight replay tweens on one org set and
   * rest-state it — the same rest semantics finalizeIntroTargets applies to
   * the whole scene (intro.ts), scoped to a city's orgs: totems at opacity 1 /
   * y 0, arrows dash-free at opacity 1 (tails included). Nothing of a replay
   * may linger after a reset. Kills are property-scoped on the interaction g
   * so the artifact context's scale tweens (selection/pulse) are never
   * disturbed; arrow paths/tails have exactly one tween owner (redraws), so
   * their kills are whole-element.
   */
  function settleReplayedOrgs(orgIds: string[]): void {
    cityCtx.add(() => {
      const groups: SVGGElement[] = []
      const paths: SVGPathElement[] = []
      const tails: SVGCircleElement[] = []
      for (const orgId of orgIds) {
        const g = calibrated.artifacts[orgId]
        if (g) {
          gsap.killTweensOf(g, 'opacity,y')
          groups.push(g)
        }
        const arrows = orgArrows(orgId)
        paths.push(...arrows.paths)
        tails.push(...arrows.tails)
      }
      for (const path of paths) gsap.killTweensOf(path)
      for (const tail of tails) gsap.killTweensOf(tail)
      if (groups.length) gsap.set(groups, { opacity: 1, y: 0 })
      if (paths.length) {
        clearArrowDash(paths)
        gsap.set([...paths, ...tails], { opacity: 1 })
      }
    })
  }

  /** Re-finalize the current replay set to rest, then forget it (idempotent). */
  function settleCityReplay(): void {
    if (!replayedOrgIds.length) return
    const orgIds = replayedOrgIds
    replayedOrgIds = []
    settleReplayedOrgs(orgIds)
  }

  // --- City filter + dim (user directive 2026-09-18) -------------------------
  // `filteredCityId` is the single filter-state owner. Filtering is per ORG:
  // every org NOT in the selected city fades out (totem interaction g, its
  // arrows + tail dots, hit circle, title pill) and stops hit-testing; the
  // other city GROUPS dim (the pre-#12 dim restored). The selected city's
  // group and orgs stay at full opacity. Revert lives in cityCtx — destroy()
  // returns the scene to rest (StrictMode-safe).
  let filteredCityId: string | null = null
  /** Org ids currently hidden by the filter (the revert set). */
  let hiddenOrgIds: string[] = []
  /** Exact-string index: org id → its .label-pill element. Built once at
   * mount — org ids are interpolated into NO selector (schema permits
   * arbitrary project keys; a quote/bracket id would make querySelector
   * throw mid-filter, codex 18 P2 — same reasoning as orgArrows' index). */
  const pillByOrgId: Record<string, HTMLElement> = {}
  for (const anchor of Array.from(labels.el.children)) {
    const anchorEl = anchor as HTMLElement
    const pill = anchorEl.querySelector<HTMLElement>('.label-pill')
    const orgId = pill?.dataset.labelFor
    if (pill && orgId) pillByOrgId[orgId] = pill
  }

  function applyCityFilter(nextCityId: string | null): void {
    if (nextCityId === filteredCityId) return
    filteredCityId = nextCityId
    cityCtx.add(() => {
      const dur = reduceMotion ? 0 : CITY_FILTER_DURATION
      // 1) City-group dim: others to CITY_DIM_OPACITY, selected (or all, on
      //    reverse) back to 1.
      for (const [id, interaction] of Object.entries(calibrated.cities)) {
        const target = nextCityId !== null && id !== nextCityId ? CITY_DIM_OPACITY : 1
        gsap.to(interaction, {
          opacity: target,
          duration: dur,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      }
      // 2) Org-level filter. Next hidden set = every mounted org NOT in the
      //    selected city (empty on reverse). Diff against hiddenOrgIds so
      //    only orgs whose state actually changes tween.
      const allMounted = Object.keys(calibrated.artifacts)
      const nextHidden =
        nextCityId !== null
          ? allMounted.filter((orgId) => !orgIdsForCity(data, nextCityId).includes(orgId))
          : []
      const nextHiddenSet = new Set(nextHidden)
      const prevHiddenSet = new Set(hiddenOrgIds)
      const toShow = hiddenOrgIds.filter((orgId) => !nextHiddenSet.has(orgId))
      const toHide = nextHidden.filter((orgId) => !prevHiddenSet.has(orgId))
      hiddenOrgIds = nextHidden
      // Orgs being REPLAYED by this same selection keep their visibility
      // owned by the replay: killing its arrow tweens would strand the dash
      // scaffold (draw never runs, onComplete never fires) and a parallel
      // opacity tween would lift staggered totems to full while still at the
      // drop offset (opus 18 P1). Restore only their hit targets; the replay
      // ends opacity/transform at rest itself. Reduced motion skips the
      // replay entirely — the instant path below is correct there.
      for (const orgId of toShow) {
        if (!reduceMotion && replayedOrgIds.includes(orgId)) {
          cityCtx.add(() => {
            const hit = calibrated.hitCircles[orgId]
            if (hit) {
              gsap.set(hit, { opacity: 1 })
              hit.style.pointerEvents = 'auto'
            }
            const label = pillByOrgId[orgId]
            if (label) {
              gsap.set(label, { opacity: 1 })
              label.style.pointerEvents = 'auto'
            }
          })
        } else {
          setOrgFiltered(orgId, true, dur)
        }
      }
      for (const orgId of toHide) setOrgFiltered(orgId, false, dur)
    })
  }

  /** Fade one org in (visible=false → opacity 1) or out. Org-scoped: the
   * totem interaction g, its arrows/tails, its hit circle and its title
   * pill. Hidden orgs also drop pointer events (hit circle + pill) so a
   * filtered map only ever taps what it shows. aria stays intact — the
   * org's button remains focusable (screen readers keep the full scene). */
  function setOrgFiltered(orgId: string, visible: boolean, duration: number): void {
    const g = calibrated.artifacts[orgId]
    const hit = calibrated.hitCircles[orgId]
    const arrows = orgArrows(orgId)
    const opacity = visible ? 1 : 0
    const pointer = visible ? 'auto' : 'none'
    cityCtx.add(() => {
      if (g) {
        // Property-scoped: never disturb the replay's opacity/y tweens on the
        // same node when both run (filter+replay of the SAME city overlap).
        gsap.to(g, { opacity, duration, ease: 'power2.out', overwrite: 'auto' })
        // The interaction g's PAINTED paths stay hit-testable at opacity 0 —
        // pointer-events must go on the group itself, not only its siblings
        // (codex 18 P1: elementFromPoint reached a hidden totem through them).
        g.style.pointerEvents = pointer
      }
      if (hit) {
        gsap.to(hit, { opacity, duration, ease: 'power2.out', overwrite: 'auto' })
        hit.style.pointerEvents = pointer
      }
      // Arrows have exactly one tween owner (redraws) — whole-element ops safe.
      for (const node of [...arrows.paths, ...arrows.tails]) {
        gsap.killTweensOf(node)
        gsap.to(node, { opacity, duration, ease: 'power2.out', overwrite: 'auto' })
      }
      const label = pillByOrgId[orgId]
      if (label) {
        gsap.to(label, { opacity, duration, ease: 'power2.out', overwrite: 'auto' })
        label.style.pointerEvents = pointer
      }
    })
  }

  /**
   * Issue #12 replay: re-run the entrance for ONLY the tapped city's orgs —
   * each totem drops in (opacity 0 → 1 with the intro's ARTIFACT_DROP_FROM
   * offset) while its arrows dash-draw with the tail-dot fade, staggered per
   * org, like the app freshly rendered for that city. Org set from
   * orgIdsForCity (data.json mapping), intersected with the mounted
   * artifacts; the dash priming lives inside redrawOrgArrows (artifactCtx —
   * its gsap.set calls run synchronously, so ALL of the city's arrows hide
   * before the first draw starts). Reduced motion: no priming, no tweens —
   * the replay is a state jump to the identical rest state (the intro's
   * no-priming static fallback).
   */
  function replayCityIntro(cityId: string): void {
    settleCityReplay() // a still-running replay from another city must not linger
    const orgIds = orgIdsForCity(data, cityId).filter((id) => id in calibrated.artifacts)
    replayedOrgIds = orgIds
    if (!orgIds.length) return
    cityCtx.add(() => {
      if (reduceMotion) return
      // Prime every org of the city at once — the stagger lives in the
      // tweens' delays, not in the priming (intro.ts prime/tween pattern).
      for (const orgId of orgIds) {
        gsap.set(calibrated.artifacts[orgId]!, { opacity: 0, y: ARTIFACT_DROP_FROM })
      }
      orgIds.forEach((orgId, i) => {
        // Perf budget (SPEC §11, ≤4 concurrent tweens) — counted GLOBALLY
        // (codex final-gate): one org's replay = 3 concurrent tweens (drop +
        // path-draw + tail-fade), so at most ONE org may be animating at a
        // time: the effective stagger ≥ max(DROP, ARROW) retires org i's
        // whole family before org i+1 starts. Belém (7 orgs) replays in
        // ~6×0.5 + 0.5 = 3.5s — comparable to the first-load intro beat.
        const at = i * Math.max(CITY_REPLAY_DROP_DURATION, CITY_REPLAY_ARROW_DURATION)
        gsap.to(calibrated.artifacts[orgId]!, {
          opacity: 1,
          y: 0,
          duration: CITY_REPLAY_DROP_DURATION,
          ease: 'power1.out',
          delay: at,
          // 'auto' only kills conflicting opacity/y tweens — a selected
          // artifact's scale tween (artifact context) owns a different
          // property and is never touched.
          overwrite: 'auto',
        })
        redrawOrgArrows(orgId, { duration: CITY_REPLAY_ARROW_DURATION, delay: at })
      })
    })
  }

  // --- Phase 5: artifact tap = select + pulse + arrow redraw (SPEC §5) -------
  // Same single-owner pattern as the city replay above: `selectedArtifactId`
  // is the only selection-state owner; each interaction g's aria-pressed is
  // its DOM reflection. Every tween lives in the artifact context (reverted
  // in destroy()); GSAP touches ONLY the interaction g — the ambient g keeps
  // its CSS bob and the placement g keeps its transform attribute (invariant 6).
  // The pulse scales about the totem's BASE point ('50% 100%') so pos never
  // slides while the artifact breathes.
  let selectedArtifactId: string | null = null
  const artifactCtx = gsap.context(() => {}, sceneSvg)
  // Issue #11: the framing snapshot taken right before focusArtifact's fly.
  // Null once the deselect fly-back consumes it (and before any first focus) —
  // the deselect then falls back to initialFraming. Closure state only: camera
  // truth stays in d3-zoom's transform; this is a scene Box, never a DOM read.
  let preFocusFraming: Box | null = null

  /**
   * Re-run the Phase 3 dash-draw for ONE org's arrows (SPEC §5). The gsap.set
   * priming runs synchronously, so a caller staggering several orgs (the
   * issue-#12 city replay) hides every arrow up front while `delay` staggers
   * the draws. Issue #12: tail dots now fade pairwise with their paths, like
   * the intro draw (intro.ts) — artifact taps get the same enriched redraw.
   */
  function redrawOrgArrows(orgId: string, opts: { duration?: number; delay?: number } = {}): void {
    const { paths, tails } = orgArrows(orgId)
    if (!paths.length) return
    const duration = reduceMotion ? 0 : (opts.duration ?? ARROW_REDRAW_DURATION)
    const delay = opts.delay ?? 0
    artifactCtx.add(() => {
      for (const path of paths) {
        // Same scaffolding + settle pattern as the intro draw (intro.ts):
        // dash to full length, ramp opacity across the draw so the marker-end
        // arrowhead only appears as the stroke reaches it, then clear the dash
        // attributes so no hairline dashes linger at rest.
        const length = arrowPathLength(path)
        path.setAttribute('stroke-dasharray', String(length))
        path.setAttribute('stroke-dashoffset', String(length))
        gsap.set(path, { opacity: 0 })
        gsap.to(path, {
          opacity: 1,
          attr: { 'stroke-dashoffset': 0 },
          duration,
          delay,
          ease: 'power1.inOut',
          overwrite: 'auto',
          onComplete: () => {
            path.removeAttribute('stroke-dasharray')
            path.removeAttribute('stroke-dashoffset')
          },
        })
      }
      if (tails.length) {
        gsap.set(tails, { opacity: 0 })
        gsap.to(tails, { opacity: 1, duration, delay, ease: 'power1.inOut', overwrite: 'auto' })
      }
    })
  }

  function applyArtifactState(nextId: string | null, opts: { pulse?: boolean } = {}): void {
    // Opus P2 (phase-5): the emit fires on a state CHANGE only — an already
    // selected id must never re-emit (a Phase 6 panel opening on artifact-tap
    // calls focusArtifact; a re-emit would loop the drawer open). A pulse on
    // an unchanged selection still plays (feedback) but emits nothing.
    const changed = nextId !== selectedArtifactId
    if (!changed && !opts.pulse) return
    // Settle the entrance first (same reasoning as applyCityState): the intro's
    // artifact tween ends at y:0/opacity:1 and would erase the selected scale.
    if (!introDone) skipIntro()
    selectedArtifactId = nextId
    for (const [id, interaction] of Object.entries(calibrated.artifacts)) {
      const selected = id === nextId
      interaction.setAttribute('aria-pressed', String(selected))
      const scale = selected ? ARTIFACT_SELECTED_SCALE : 1
      artifactCtx.add(() => {
        if (opts.pulse && selected && !reduceMotion) {
          // Tap pulse: 1 → 1.15 → settled scale over 0.4 s total (SPEC §5).
          // The second tween settles at the persistent selected scale.
          gsap
            .timeline()
            .to(interaction, {
              scale: ARTIFACT_PULSE_SCALE,
              transformOrigin: '50% 100%',
              duration: ARTIFACT_PULSE_DURATION / 2,
              ease: 'power2.out',
              overwrite: 'auto', // opus P3: keyboard + focusArtifact can stack
            })
            .to(interaction, {
              scale,
              transformOrigin: '50% 100%',
              duration: ARTIFACT_PULSE_DURATION / 2,
              ease: 'power2.in',
            })
        } else {
          // Reduced-motion: no pulse animation — jump straight to the state.
          gsap.to(interaction, {
            scale,
            transformOrigin: '50% 100%',
            duration: reduceMotion ? 0 : ARTIFACT_SETTLE_DURATION,
            ease: 'power2.out',
            overwrite: 'auto',
          })
        }
      })
    }
    // Filter is the final word on visibility (opus 18): a keyboard
    // activation of a hidden org must not paint its arrows back at full
    // opacity while totem/pill/hit stay at 0 — skip the redraw entirely.
    if (opts.pulse && nextId !== null && !hiddenOrgIds.includes(nextId)) {
      redrawOrgArrows(nextId)
    }
    // Issue #11: a real deselect (state CHANGE to null — empty-tap, toggling
    // the selected totem, or its keyboard toggle) also flies the camera back
    // to the pre-focus framing (initialFraming fallback). This is the single
    // deselect choke point; a no-op deselect returned above, so an empty tap
    // with nothing selected never moves the camera. The capture is spent here
    // rather than on tween completion — nothing else reads it, and the next
    // focusArtifact captures fresh regardless.
    if (changed && nextId === null) {
      const flight = unfocusFlight(preFocusFraming, initialFraming)
      preFocusFraming = null
      camera.flyTo(flight.box, {
        ...flight.opts,
        duration: reduceMotion ? 0 : UNFOCUS_DURATION,
      })
    }
    // artifact-tap fires on a state CHANGE to an artifact only (opus P2);
    // the deselect is a settle, not a change.
    if (changed && nextId !== null) artifactTapHub.emit(nextId)
  }

  // City/artifact interaction groups carry [data-interactive] (layers.ts), so
  // taps on their content opt out of empty-tap via the closest() check below.
  // A city tap toggles: select + replay its orgs, or reverse when that city is
  // already selected. Ignore `event.detail > 1` — the compat dblclick fired
  // after a double-tap zoom emits a spurious empty-tap that would fight the
  // zoom.
  function onSceneClick(event: Event): void {
    // Compat click after a double-tap zoom (Chromium fires click per tap):
    // ignore detail > 1 — the select-then-reverse flicker would fight the zoom
    // and emit spurious taps (opus P2).
    if ('detail' in event && (event as MouseEvent).detail > 1) return
    const target = event.target
    if (target instanceof Element && target.closest('[data-interactive]')) {
      const cityId = target.closest('[data-city-id]')?.getAttribute('data-city-id')
      if (cityId) {
        applyCityState(cityId === raisedCityId ? null : cityId)
        return
      }
      // Phase 5: hit circles + totems carry [data-artifact-id] — a tap routes
      // through [data-interactive] into select/pulse/redraw.
      const artifactId = target.closest('[data-artifact-id]')?.getAttribute('data-artifact-id')
      if (artifactId && artifactId in calibrated.artifacts) {
        applyArtifactState(artifactId === selectedArtifactId ? null : artifactId, { pulse: true })
        return
      }
      return
    }
    // Empty water / background (issue #12 reset): reverse the city selection —
    // which re-finalizes its replayed orgs to the pristine rest state —
    // deselect any artifact (settle, no emit), then notify.
    applyCityState(null)
    applyArtifactState(null)
    emptyTapHub.emit()
  }
  sceneSvg.addEventListener('click', onSceneClick)

  // --- Issue #13: title-pill tap opens the org modal ---------------------------
  // The pill box re-enables pointer hit testing (scene.css `.label-pill`);
  // everything else in #labels stays pointer-events:none and the layer stays
  // aria-hidden (AGENTS invariant 12) — a pointer-ONLY affordance, so the
  // totem SVG button remains the single focusable control per org (SPEC §9).
  // ONE delegated listener on the labels root. Double-fire guard: #labels and
  // the scene SVG are SIBLINGS, so a click's single target can reach at most
  // one of the two handlers — a tap near the totem base that lands on the pill
  // can no longer fall through to the hit circle underneath (one gesture, one
  // action, by construction); stopPropagation additionally keeps the click out
  // of any future ancestor-level handler.
  function onLabelsClick(event: Event): void {
    // Same double-tap guard as onSceneClick (opus P2): the compat click after
    // a double-tap zoom must not fight the zoom by opening the modal.
    if ('detail' in event && (event as MouseEvent).detail > 1) return
    const target = event.target
    if (!(target instanceof Element)) return
    const orgId = target.closest<HTMLElement>('[data-label-for]')?.dataset.labelFor ?? null
    const plan = pillTapPlan(
      orgId,
      selectedArtifactId,
      orgId !== null && orgId in calibrated.artifacts,
    )
    if (!plan) return
    event.stopPropagation()
    // Pills NEVER toggle (issue #13): a pill tap always means "open this org's
    // modal", unlike a totem re-tap which deselects. applyArtifactState does
    // everything a totem tap does (selection, aria-pressed, pulse, arrow
    // redraw) and emits artifact-tap on the state CHANGE — App opens the modal
    // and focus-flies from there; for an already-selected org it never
    // re-emits (opus P2 — a re-emit would loop the panel), so the direct emit
    // re-opens instead.
    // Focus the totem SVG button first (codex r1 P2): the pill is not
    // focusable, so Panel's restore-focus capture would otherwise record
    // <body>/an unrelated control and SPEC §8's return-focus contract would
    // break on modal close. The interaction g already carries tabindex="0"
    // (layers.ts); focus({preventScroll}) never scrolls the camera.
    calibrated.artifacts[plan.orgId]?.focus({ preventScroll: true })
    applyArtifactState(plan.orgId, { pulse: true })
    if (plan.emitDirect) artifactTapHub.emit(plan.orgId)
  }

  /** Org whose pill hosts the live forwarded touch gesture (null = none). */
  let forwardedOrgId: string | null = null

  /**
   * Clone a native pill-anchored touch event onto the org's interaction g.
   * The ORIGINAL Touch objects are reused — identifiers stay in the
   * browser's native space, so d3's tracker sees exactly the contacts it
   * would have seen had the pill not intercepted the event: a second
   * finger on the SVG becomes a real touch1 and pinch works natively
   * (opus gate r2 P2). targetTouches is not meaningful from the new target
   * and d3 does not read it on the SVG — touches and changedTouches carry
   * everything it uses.
   */
  function cloneTouchEvent(
    target: Element,
    type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
    event: TouchEvent,
  ): void {
    if (typeof TouchEvent !== 'function') return
    target.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: Array.from(event.touches),
        targetTouches: [],
        changedTouches: Array.from(event.changedTouches),
      }),
    )
  }

  /** Native contact ids already seen reaching the SVG (dedup for clones). */
  const nativeSeen = new Set<number>()
  // Capture-phase: record which contact ids the SVG already received
  // natively — the browser delivers a pill contact's touchstart to the SVG
  // on any subsequent touch event (touches list), and d3 then tracks it
  // there; cloning ours too would re-start d3's gesture and kill pinch.
  const onSvgNativeTouch = (event: Event): void => {
    const te = event as TouchEvent
    for (const t of Array.from(te.changedTouches)) nativeSeen.add(t.identifier)
  }
  // Capture phase: d3's SVG handler stops immediate propagation, which
  // silences same-node listeners registered after it — capture is the only
  // reliable position. Cleanup pairs with native touchend/touchcancel so
  // browser-reused identifiers never linger in the set.
  const onSvgNativeTouchEnd = (event: Event): void => {
    const te = event as TouchEvent
    for (const t of Array.from(te.changedTouches)) nativeSeen.delete(t.identifier)
  }
  sceneSvg.addEventListener('touchstart', onSvgNativeTouch, true)
  sceneSvg.addEventListener('touchend', onSvgNativeTouchEnd, true)
  sceneSvg.addEventListener('touchcancel', onSvgNativeTouchEnd, true)

  /** Forward native touch events for the live pill gesture. */
  function onLabelsTouchForward(event: TouchEvent): void {
    if (!forwardedOrgId) return
    const g = calibrated.artifacts[forwardedOrgId]
    if (!g) {
      forwardedOrgId = null
      return
    }
    const type = event.type as 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel'
    const unseen = Array.from(event.changedTouches).filter((t) => !nativeSeen.has(t.identifier))
    if (type === 'touchstart' && unseen.length === 0) return // d3 already tracks these
    if (unseen.length > 0) {
      for (const t of unseen) nativeSeen.add(t.identifier)
    }
    cloneTouchEvent(g, type, event)
    if (type === 'touchend' || type === 'touchcancel') {
      for (const t of Array.from(event.changedTouches)) nativeSeen.delete(t.identifier)
      forwardedOrgId = null
    }
  }

  // Bot-review P2 (issue #13): the pill's pointer-events:auto box must not
  // steal CAMERA GESTURES — d3-zoom listens on svg#scene, a sibling of
  // #labels, so a drag/pinch/double-tap STARTED on a pill would fall into
  // the label subtree and neither pan/zoom nor cancel an active fly (wheel
  // on the pill box stays a known, accepted gap — the box is small).
  // Pointerdown on a pill therefore retargets the gesture onto the totem's
  // interaction g (same org, same scene position — the pill is anchored to
  // it): d3-zoom sees a native pointerdown on the SVG and pans normally; a
  // clean tap produces no drag and the click handler above still opens the
  // modal.
  function onLabelsPointerDown(event: PointerEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    const orgId = target.closest<HTMLElement>('[data-label-for]')?.dataset.labelFor
    if (!orgId || !(orgId in calibrated.artifacts)) return
    event.stopPropagation()
    // Touch: capture the pill finger's NATIVE touch events and forward them
    // (cloned, original Touch objects) onto the org's interaction g — d3's
    // touch path binds on svg#scene, a SIBLING of #labels, so without this
    // a pill-started pan never reaches it. Native identifiers keep d3's
    // view of event.touches coherent. KNOWN GAP (issue #17): a pinch with
    // one finger ON a pill does not zoom — the gesture degrades to the
    // second finger's single-contact pan; native two-finger pinch anywhere
    // else is untouched.
    if (event.pointerType === 'touch') {
      forwardedOrgId = orgId
      return
    }
    // Retarget as a REAL mousedown on the totem's interaction g: d3-zoom
    // binds "mousedown.zoom" (not pointer events), so the retargeted event
    // must be a MouseEvent('mousedown') to start a pan; the interaction g
    // lives inside svg#scene, so d3's gesture continues on real mousemove/up.
    // (A synthetic PointerEvent was tried first — it bubbles but d3 ignores
    // it.) clientX/Y are preserved so the pan anchors at the pill point.
    // jsdom ships no mousedown-capable MouseEvent init in d3's path, but the
    // tests dispatch click separately — the retarget is probe-verified.
    calibrated.artifacts[orgId].dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
      }),
    )
  }
  labels.el.addEventListener('click', onLabelsClick)
  labels.el.addEventListener('pointerdown', onLabelsPointerDown)
  labels.el.addEventListener('touchstart', onLabelsTouchForward)
  labels.el.addEventListener('touchmove', onLabelsTouchForward)
  labels.el.addEventListener('touchend', onLabelsTouchForward)
  labels.el.addEventListener('touchcancel', onLabelsTouchForward)

  // The scene root's touch-action:none doesn't cross into the #labels
  // subtree — without it Chromium fires pointercancel (scroll takeover) on
  // the first pill-started touchmove and the forwarded pan dies (probe:
  // 8 touchmoves → 1 forwarded move + a cancel). pills keep pointer-events:
  // auto, so this is scoped to the labels layer, not the SVG.
  labels.el.style.touchAction = 'none'

  // Keyboard activation (SPEC §9): Enter/Space act exactly like a tap; Space
  // is cancelled so the page never scrolls. Focus also flies the camera to
  // the city (SPEC §8 focus-fly) and paints the issue-#12 keyboard halo.
  function onCityKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    const id = (event.currentTarget as Element).getAttribute('data-city-id')
    if (id) applyCityState(id === raisedCityId ? null : id)
  }
  function onArtifactKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    const id = (event.currentTarget as Element).getAttribute('data-artifact-id')
    if (id && id in calibrated.artifacts) {
      applyArtifactState(id === selectedArtifactId ? null : id, { pulse: true })
    }
  }
  function onCityFocusIn(event: FocusEvent): void {
    const target = event.currentTarget as Element
    // Keyboard-modality only (SPEC §9 focus-fly + the issue-#12 halo):
    // mousedown also focuses a tabindex=0 <g>, and d3-zoom's mousedown
    // handler never preventDefaults — an unguarded fly would fight every
    // drag-pan from a city (opus round-2 P1; breaks AGENTS §8 "user gesture
    // cancels fly-to"); the same guard keeps pointer taps halo-free.
    if (!target.matches(':focus-visible')) return
    target.classList.add(KBD_FOCUS_CLASS)
    const id = target.getAttribute('data-city-id')
    if (!id || !(id in cityPlacements)) return
    // The placement transform (translate/scale) maps the city's native
    // viewBox onto scene coords; camera.flyTo clamps + fits.
    const cityId = id as 'belem' | 'ananindeua' | 'moju'
    const placement = cityPlacements[cityId]
    const [w, h] = CITY_VIEWBOX[cityId]
    const scale = placement.scale ?? 1
    camera.flyTo({
      x: placement.x,
      y: placement.y,
      width: w * scale,
      height: h * scale,
    })
  }
  function onCityFocusOut(event: FocusEvent): void {
    // Unconditional: whatever modality brought focus here, it is leaving —
    // drop the halo (a stuck halo would outlive the keyboard tour).
    const target = event.currentTarget as Element
    target.classList.remove(KBD_FOCUS_CLASS)
  }
  for (const interaction of Object.values(calibrated.cities)) {
    interaction.addEventListener('keydown', onCityKeyDown)
    interaction.addEventListener('focusin', onCityFocusIn)
    interaction.addEventListener('focusout', onCityFocusOut)
  }
  function onArtifactFocusIn(event: FocusEvent): void {
    const target = event.currentTarget as Element
    // Same keyboard-modality guard as onCityFocusIn (opus P2, SPEC §9): focus
    // flies the camera to the artifact box — NO select, NO emit (a focus fly
    // must not open the Phase 6 panel).
    if (!target.matches(':focus-visible')) return
    target.classList.add(KBD_FOCUS_CLASS)
    const id = target.getAttribute('data-artifact-id')
    if (!id || !(id in artifactAnchors)) return
    const anchor = artifactAnchors[id]
    camera.flyTo({
      x: anchor.x - ARTIFACT_FOCUS_BOX,
      y: anchor.y - ARTIFACT_FOCUS_BOX,
      width: ARTIFACT_FOCUS_BOX * 2,
      height: ARTIFACT_FOCUS_BOX * 2,
    })
  }
  function onArtifactFocusOut(event: FocusEvent): void {
    const target = event.currentTarget as Element
    target.classList.remove(KBD_FOCUS_CLASS)
  }
  for (const interaction of Object.values(calibrated.artifacts)) {
    interaction.addEventListener('keydown', onArtifactKeyDown)
    interaction.addEventListener('focusin', onArtifactFocusIn)
    interaction.addEventListener('focusout', onArtifactFocusOut)
  }

  // --- Phase 3 entrance choreography (SPEC §5) --------------------------------
  // ONE gsap.context around the entrance timeline — the camera owns its own
  // context for fly tweens (each context reverts on destroy, so killing one
  // never disturbs the other's tweens).

  const introHub = createHub<[]>()
  let introDone = false
  let introTimeline: gsap.core.Timeline | null = null

  function markIntroDone(): void {
    if (introDone) return
    introDone = true
    document.documentElement.classList.add(INTRO_DONE_CLASS)
    introHub.emit()
  }

  // GSAP touches only nodes with no transform attribute and no CSS animation
  // (invariant 6): base layer groups, calibrated interaction <g>s, and label
  // INNER divs — the outer .label anchors are rewritten per frame by
  // updateLabels, never two transform owners on one node.
  const introTargets: IntroTargets = {
    squiggles: calibrated.squiggles,
    land: layerGroups.land,
    roads: layerGroups.roads,
    waterDetail: layerGroups.waterDetail,
    cities: Object.values(calibrated.cities),
    cityLabels: Array.from(labels.el.querySelectorAll<HTMLElement>('.label-city')),
    arrows: {
      paths: Array.from(calibrated.arrows.querySelectorAll<SVGPathElement>(':scope > path')),
      tails: Array.from(calibrated.arrows.querySelectorAll<SVGCircleElement>(':scope > circle')),
    },
    artifacts: Object.values(calibrated.artifacts),
    pills: Array.from(labels.el.querySelectorAll<HTMLElement>('.label-pill')),
  }

  const introCtx = gsap.context(() => {
    if (prefersReducedMotion()) {
      // SPEC §5 static fallback: no entrance, no priming — final state and
      // INTRO_DONE_CLASS from the first frame. The ambient CSS loops are
      // already disabled by the scene.css reduced-motion media query.
      markIntroDone()
      return
    }
    // Arrow lengths are measured synchronously inside primeIntroTargets —
    // one build-time pass, never a mid-timeline read.
    primeIntroTargets(introTargets)
    introTimeline = buildIntroTimeline(introTargets, markIntroDone)
  }, sceneSvg)

  function skipIntro(): void {
    if (introDone) return
    introTimeline?.kill()
    introTimeline = null
    finalizeIntroTargets(introTargets)
    markIntroDone()
  }

  // Phase 2 ambient motion: document.hidden pauses every loop via .scene-hidden
  // (scene.css sets animation-play-state: paused on .wave-drift/.squiggle-drift).
  // The listener is reverted in destroy().
  function onVisibilityChange(): void {
    root.classList.toggle('scene-hidden', document.hidden)
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  onVisibilityChange() // mount may happen in an already-hidden tab (opus P2)

  function on(event: 'artifact-tap' | 'city-tap', cb: (id: string) => void): () => void
  function on(event: 'empty-tap', cb: () => void): () => void
  function on(event: string, cb: (id: never) => void): () => void {
    switch (event) {
      case 'artifact-tap':
        return artifactTapHub.on(cb as (id: string) => void)
      case 'city-tap':
        return cityTapHub.on(cb as (id: string) => void)
      case 'empty-tap':
        return emptyTapHub.on(cb as () => void)
      default:
        throw new Error(`[scene] unknown event: ${event}`)
    }
  }

  let destroyed = false

  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      // Filter pointer-events are style.pointerEvents (not gsap) — clear them
      // explicitly so a remount starts hit-testable (StrictMode-safe). After
      // the guard: repeat destroys are no-ops (opus 18 P3).
      for (const orgId of hiddenOrgIds) {
        calibrated.artifacts[orgId]?.style.removeProperty('pointer-events')
        calibrated.hitCircles[orgId]?.style.removeProperty('pointer-events')
        pillByOrgId[orgId]?.style.removeProperty('pointer-events')
      }
      // Revert the city context BEFORE the entrance context: mid-replay
      // teardown undoes every city-tap style first, then the intro revert
      // restores entrance-start styling — a StrictMode remount replays both
      // from a clean slate.
      cityCtx.revert()
      // Artifact context reverts with the same ordering rationale (pulse/
      // selection/arrow-redraw styles undone before the intro revert).
      artifactCtx.revert()
      // Revert the entrance context BEFORE the rest: mid-intro teardown undoes
      // every gsap.set/tween style, and the <html> class goes with it — a
      // StrictMode remount then replays the intro from a clean slate.
      introCtx.revert()
      document.documentElement.classList.remove(INTRO_DONE_CLASS)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      camera.destroy()
      offLabels()
      labels.el.removeEventListener('click', onLabelsClick)
      labels.el.removeEventListener('pointerdown', onLabelsPointerDown)
      sceneSvg.removeEventListener('touchstart', onSvgNativeTouch, true)
      sceneSvg.removeEventListener('touchend', onSvgNativeTouchEnd, true)
      sceneSvg.removeEventListener('touchcancel', onSvgNativeTouchEnd, true)
      labels.el.removeEventListener('touchstart', onLabelsTouchForward)
      labels.el.removeEventListener('touchmove', onLabelsTouchForward)
      labels.el.removeEventListener('touchend', onLabelsTouchForward)
      labels.el.removeEventListener('touchcancel', onLabelsTouchForward)
      labels.destroy()
      root.remove()
    },
    onTransform(cb) {
      return transformHub.on(cb)
    },
    setObstruction(rect) {
      // Desktop-only policy (SPEC §8): mobile occlusion is intentional — always null.
      camera.setObstruction(isMobile() ? null : rect)
    },
    flyTo(target, opts) {
      camera.flyTo(target, opts)
    },
    zoomBy(factor) {
      camera.zoomBy(factor)
    },
    reset() {
      camera.reset()
    },
    focusCity(id) {
      // Gate on the MOUNTED set (cityPlacements), not data.maps — placements,
      // not data presence, decide tappability (Moju ships an empty projects
      // map and is still a mounted, tappable city; opus round-2 P2).
      if (!(id in cityPlacements)) {
        if (import.meta.env.DEV) console.warn(`[scene] focusCity('${id}'): unknown city`)
        return
      }
      // Select + replay the city's orgs (issue #12), then fly the camera to
      // the city box.
      applyCityState(id)
      const cityId = id as 'belem' | 'ananindeua' | 'moju'
      const placement = cityPlacements[cityId]
      const [w, h] = CITY_VIEWBOX[cityId]
      const scale = placement.scale ?? 1
      camera.flyTo({
        x: placement.x,
        y: placement.y,
        width: w * scale,
        height: h * scale,
      })
    },
    focusArtifact(id) {
      // Gate on the MOUNTED set (an org with no calibrated pos renders no
      // artifact — same pattern as focusCity vs. data.maps).
      if (!(id in calibrated.artifacts)) {
        if (import.meta.env.DEV) console.warn(`[scene] focusArtifact('${id}'): unknown artifact`)
        return
      }
      const anchor = artifactAnchors[id] // pos from data.json (org → anchor map above)
      // Select (+ pulse + arrow redraw), then fly to a box around the pos
      // (SPEC §5 focus mirrors focusCity: clamped + fitted by the camera).
      applyArtifactState(id, { pulse: true })
      // Issue #11: snapshot the framing BEFORE the fly — the eventual deselect
      // flies back to this box. The assignment supersedes any prior capture
      // (the captured state resets when a new focusArtifact begins).
      preFocusFraming = camera.framing()
      camera.flyTo({
        x: anchor.x - ARTIFACT_FOCUS_BOX,
        y: anchor.y - ARTIFACT_FOCUS_BOX,
        width: ARTIFACT_FOCUS_BOX * 2,
        height: ARTIFACT_FOCUS_BOX * 2,
      })
    },
    deselectArtifact() {
      // Same flow as the empty-tap deselect (applyArtifactState(null)): settle
      // + fly-back. The panel's outside-tap closes through here so the user's
      // first tap outside the modal both closes it AND restores the framing.
      applyArtifactState(null)
    },
    skipIntro,
    onIntroDone(cb) {
      // Post-intro registrations fire immediately (SPEC §10 contract).
      if (introDone) cb()
      return introHub.on(cb)
    },
    on,
  }
}
