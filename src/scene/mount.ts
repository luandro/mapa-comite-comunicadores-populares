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
  buildIntroTimeline,
  finalizeIntroTargets,
  INTRO_DONE_CLASS,
  prefersReducedMotion,
  primeIntroTargets,
} from './intro'
import type { IntroTargets } from './intro'
import { mountCalibratedLayers, orgProjects, rSceneFor, arrowPathLength } from './layers'
import {
  createLabelsLayer,
  IDENTITY_CTM,
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

/* Phase 4 city-raise tuning (SPEC §5 city tap, scoped by TODO Phase 4): the
   tapped city's interaction g lifts and the other two dim. The camera fly,
   growing shadow and outline draw in the same SPEC sentence are Phase 5 —
   raise + dim ONLY here. */
const CITY_RAISE_LIFT = -14 // scene units, GSAP `y` on the interaction g
// SPEC §5 value — the task contract's 0.45 was a downstream drift (opus round-2
// adjudication: SPEC stands unless SPEC itself changes in the same commit).
const CITY_DIM_OPACITY = 0.35
const CITY_RAISE_DURATION = 0.35

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

  // --- Phase 4: city tap = raise (SPEC §5) -----------------------------------
  // `raisedCityId` is the single raise-state owner; the city groups'
  // aria-pressed is its DOM reflection. Tweens live in their OWN gsap.context
  // scoped to the scene (never two owners per node): revert() in destroy()
  // undoes every raise/dim style — and killing one context never disturbs the
  // entrance context's tweens, or vice versa. The interaction g is the GSAP
  // target; the placement g's transform attribute is never touched
  // (invariant 6) and the ambient g stays CSS-free.
  let raisedCityId: string | null = null
  const cityCtx = gsap.context(() => {}, sceneSvg)
  const reduceMotion = prefersReducedMotion()

  function applyCityState(nextId: string | null): void {
    if (nextId === raisedCityId) return // no state change → no tween, no emit
    // A tap during the entrance would leave a stuck raise: the intro's city
    // tween (same nodes/properties) ends at y:0/opacity:1 and erases the lift
    // while aria-pressed stays true (opus P1). Settle the entrance first —
    // skipIntro() is idempotent and finalizes every intro target instantly.
    if (!introDone) skipIntro()
    raisedCityId = nextId
    for (const [id, interaction] of Object.entries(calibrated.cities)) {
      const raised = id === nextId
      interaction.setAttribute('aria-pressed', String(raised))
      const props = {
        y: raised ? CITY_RAISE_LIFT : 0,
        opacity: raised || nextId === null ? 1 : CITY_DIM_OPACITY,
      }
      cityCtx.add(() => {
        gsap.to(interaction, {
          ...props,
          duration: reduceMotion ? 0 : CITY_RAISE_DURATION,
          ease: 'power2.out',
          // A tap during the ~3 s entrance would otherwise lose the lift the
          // moment the intro tween (same properties, same nodes) ends at
          // y:0/opacity:1 — 'auto' kills those conflicting tweens at first
          // render, and every city gets a tween here so no sibling is left
          // stranded at the intro's primed opacity 0.
          overwrite: 'auto',
        })
      })
    }
    // city-tap fires on raise only (state CHANGE to a city), never on reverse.
    if (nextId !== null) cityTapHub.emit(nextId)
  }

  // --- Phase 5: artifact tap = select + pulse + arrow redraw (SPEC §5) -------
  // Same single-owner pattern as the city raise above: `selectedArtifactId`
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

  /** Re-run the Phase 3 dash-draw for ONE org's arrows (~0.6 s, SPEC §5). */
  function redrawOrgArrows(orgId: string): void {
    const paths = Array.from(
      calibrated.arrows.querySelectorAll<SVGPathElement>(`path[data-arrow-org="${orgId}"]`),
    )
    if (!paths.length) return
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
          duration: reduceMotion ? 0 : ARROW_REDRAW_DURATION,
          ease: 'power1.inOut',
          overwrite: 'auto',
          onComplete: () => {
            path.removeAttribute('stroke-dasharray')
            path.removeAttribute('stroke-dashoffset')
          },
        })
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
    if (opts.pulse && nextId !== null) redrawOrgArrows(nextId)
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
  // A city tap toggles: raise, or reverse when that city is already raised.
  // Phase 4: ignore `event.detail > 1` — the compat dblclick fired after a
  // double-tap zoom emits a spurious empty-tap that would fight the zoom.
  function onSceneClick(event: Event): void {
    // Compat click after a double-tap zoom (Chromium fires click per tap):
    // ignore detail > 1 — the raise-then-reverse flicker would fight the zoom
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
    // Empty water / background: reverse any raised city, deselect any
    // artifact (settle, no emit — mirrors the city reverse), then notify.
    applyCityState(null)
    applyArtifactState(null)
    emptyTapHub.emit()
  }
  sceneSvg.addEventListener('click', onSceneClick)

  // Keyboard activation (SPEC §9): Enter/Space act exactly like a tap; Space
  // is cancelled so the page never scrolls. Focus also flies the camera to
  // the city (SPEC §8 focus-fly — TODO Phase 4, opus round-2 adjudication).
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
    const id = target.getAttribute('data-city-id')
    // Keyboard-modality only (SPEC §9 focus-fly): mousedown also focuses a
    // tabindex=0 <g>, and d3-zoom's mousedown handler never preventDefaults —
    // an unguarded fly would fight every drag-pan from a city (opus round-2
    // P1; breaks AGENTS §8 "user gesture cancels fly-to").
    if (!target.matches(':focus-visible')) return
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
  for (const interaction of Object.values(calibrated.cities)) {
    interaction.addEventListener('keydown', onCityKeyDown)
    interaction.addEventListener('focusin', onCityFocusIn)
  }
  function onArtifactFocusIn(event: FocusEvent): void {
    const target = event.currentTarget as Element
    const id = target.getAttribute('data-artifact-id')
    // Same keyboard-modality guard as onCityFocusIn (opus P2, SPEC §9): focus
    // flies the camera to the artifact box — NO select, NO emit (a focus fly
    // must not open the Phase 6 panel).
    if (!target.matches(':focus-visible')) return
    if (!id || !(id in artifactAnchors)) return
    const anchor = artifactAnchors[id]
    camera.flyTo({
      x: anchor.x - ARTIFACT_FOCUS_BOX,
      y: anchor.y - ARTIFACT_FOCUS_BOX,
      width: ARTIFACT_FOCUS_BOX * 2,
      height: ARTIFACT_FOCUS_BOX * 2,
    })
  }
  for (const interaction of Object.values(calibrated.artifacts)) {
    interaction.addEventListener('keydown', onArtifactKeyDown)
    interaction.addEventListener('focusin', onArtifactFocusIn)
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
      // Revert the raise context BEFORE the entrance context: mid-raise
      // teardown undoes every lift/dim style first, then the intro revert
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
      // not data presence, decide raisability (Moju ships an empty projects
      // map and is still a mounted, raisable city; opus round-2 P2).
      if (!(id in cityPlacements)) {
        if (import.meta.env.DEV) console.warn(`[scene] focusCity('${id}'): unknown city`)
        return
      }
      // Phase 4 (opus round-2): focus flies the camera to the city box.
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
    skipIntro,
    onIntroDone(cb) {
      // Post-intro registrations fire immediately (SPEC §10 contract).
      if (introDone) cb()
      return introHub.on(cb)
    },
    on,
  }
}
