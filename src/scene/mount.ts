/**
 * DOM: .scene-root > svg#scene > g#camera > 4 base layers + calibrated
 * composite (SPEC §4: waves, squiggles, cities, artifacts, arrows); plus
 * svg#measure and the #labels div as siblings of the scene SVG — outside any
 * camera transform.
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
import { mountCalibratedLayers, orgProjects } from './layers'
import { createLabelsLayer, IDENTITY_CTM, renderLabels, updateLabels } from './labels'
import { assertBaseCounts, partitionBase } from './partition'
import { initialFraming } from './placements'
import './scene.css'
import type { Box, Camera, FlyToOptions, ObstructionRect, TransformState } from './types'
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

export function mountScene(el: HTMLElement, data: ComiteData): SceneController {
  // DOM: .scene-root > svg#scene > g#camera > 4 base layers; plus svg#measure and
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
  // The group wrappers are the Phase 3 entrance targets (opacity/translateY).
  const layerGroups: {
    land: SVGGElement
    roads: SVGGElement
    waterDetail: SVGGElement
  } = { land: null!, roads: null!, waterDetail: null! }
  const layerStack: Array<[id: string, nodes: Element[]]> = [
    ['layer-water', layers.water],
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
  const positionLabels = (state: TransformState) => {
    // jsdom ships no getScreenCTM at all (and browsers return null pre-layout)
    // — IDENTITY_CTM keeps the math defined either way.
    updateLabels(labels.el, state, measureSvg.getScreenCTM?.() ?? IDENTITY_CTM)
  }
  const offLabels = transformHub.on(positionLabels)
  positionLabels(camera.getState()) // camera's initial frame predated this subscription

  // DEV-only calibration tool (Phase 1.5): the dynamic import keeps its bytes
  // out of production bundles entirely (AGENTS invariant 3).
  if (import.meta.env.DEV) {
    void import('./calibration').then((m) => m.attachCalibration(root, sceneSvg)).catch(() => {})
  }

  // City/artifact interaction groups carry [data-interactive] (layers.ts), so
  // taps on their content opt out of empty-tap via the closest() check below.
  // Phase 4: ignore `event.detail > 1` — the compat dblclick fired after a
  // double-tap zoom emits a spurious empty-tap that would fight the zoom.
  function onSceneClick(event: Event): void {
    const target = event.target
    if (target instanceof Element && target.closest('[data-interactive]')) return
    emptyTapHub.emit()
  }
  sceneSvg.addEventListener('click', onSceneClick)

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
    waves: Array.from(calibrated.waves.querySelectorAll<SVGGElement>(':scope > g[data-band]')),
    squiggles: calibrated.squiggles,
    land: layerGroups.land,
    roads: layerGroups.roads,
    waterDetail: layerGroups.waterDetail,
    cities: Object.values(calibrated.cities),
    cityLabels: Array.from(labels.el.querySelectorAll<HTMLElement>('.label-city')),
    arrows: {
      paths: Array.from(calibrated.arrows.querySelectorAll<SVGPathElement>(':scope > path')),
      dots: Array.from(calibrated.arrows.querySelectorAll<SVGCircleElement>(':scope > circle')),
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

  function isKnownArtifact(id: string): boolean {
    for (const city of Object.values(data.maps)) {
      if (id in city.projects) return true
    }
    return false
  }

  let destroyed = false

  return {
    destroy() {
      if (destroyed) return
      destroyed = true
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
      if (import.meta.env.DEV) {
        const known = id in data.maps ? '' : 'unknown city, '
        console.warn(`[scene] focusCity('${id}'): ${known}Phase 1 stub — lands in Phase 4`)
      }
    },
    focusArtifact(id) {
      if (import.meta.env.DEV) {
        const known = isKnownArtifact(id) ? '' : 'unknown artifact, '
        console.warn(`[scene] focusArtifact('${id}'): ${known}Phase 1 stub — lands in Phase 5`)
      }
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
