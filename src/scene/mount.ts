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
import { isMobile } from '../device'
import { createCamera } from './camera'
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
  /** Phase 1 no-op — intro choreography lands in Phase 3. */
  skipIntro(): void
  /** Phase 1: the scene starts in its final state, so every subscriber fires immediately. */
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
  const layerStack: Array<[id: string, nodes: Element[]]> = [
    ['layer-water', layers.water],
    ['layer-land', layers.land],
    ['layer-roads', layers.roads],
    ['layer-water-detail', layers.waterDetail],
  ]
  for (const [id, nodes] of layerStack) {
    const g = document.createElementNS(SVG_NS, 'g')
    g.id = id
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
  mountCalibratedLayers(cameraNode, data, camera)

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
    skipIntro() {
      // Phase 1 no-op: the intro choreography lands in Phase 3.
    },
    onIntroDone(cb) {
      // Phase 1: the scene starts in its final state — fire immediately.
      cb()
      return () => {}
    },
    on,
  }
}
