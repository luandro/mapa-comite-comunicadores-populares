/**
 * Phase 1 shell: React only provides the full-viewport host and mounts the
 * imperative scene island in exactly one useEffect (SPEC §3/§10). The animated
 * SVG is never rendered through JSX; StrictMode's mount → destroy → mount is
 * handled by SceneController.destroy().
 *
 * Phase 3: React owns the title overlay (SPEC §3) — live HTML (Fraunces) over
 * an authored blob path (drawn in code, not sourced from any asset).
 *
 * Phase 6: artifact taps open the content panel; the controller gets
 * setObstruction (desktop only) + focusArtifact on open, setObstruction(null)
 * on close. Empty-tap closes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { comiteData } from './data/load'
import type { Project } from './data/types'
import { Controls } from './panel/Controls'
import { Panel } from './panel/Panel'
import { isMobile } from './device'
import { mountScene, type SceneController } from './scene/mount'
import './panel/panel.css'

/** Authored blob backing the poster title (SPEC §3). */
const TITLE_BLOB_PATH =
  'M8,18 C56,1 132,8 214,5 C310,1 385,11 474,3 C568,-5 653,10 740,5 C828,0 898,8 914,28 C929,48 901,63 855,68 C786,76 720,70 650,88 C555,112 481,102 398,111 C307,121 237,103 163,108 C92,113 35,123 11,98 C-8,77 -5,40 8,18 Z'

/** Title overlay — above the scene, below future controls (SPEC §3 z-order). */
function TitleOverlay() {
  return (
    <div className="app-title">
      <svg
        className="app-title-blob"
        viewBox="0 0 920 126"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={TITLE_BLOB_PATH} />
      </svg>
      <h1>
        <span>Mapeamento de 25 Coletivos do</span>
        <span>Comitê de Comunicadores Populares</span>
      </h1>
    </div>
  )
}

/** Resolve an org id to its project across all maps (ids are unique). */
function findProject(id: string): Project | null {
  for (const map of Object.values(comiteData.maps)) {
    const project = map.projects[id]
    if (project) return project
  }
  return null
}

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<SceneController | null>(null)
  const panelHostRef = useRef<HTMLDivElement>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [mobile] = useState(isMobile)

  useEffect(() => {
    const controller = mountScene(hostRef.current!, comiteData)
    controllerRef.current = controller
    const offTap = controller.on('artifact-tap', (id) => setOpenId(id))
    const offEmpty = controller.on('empty-tap', () => setOpenId(null))
    return () => {
      offTap()
      offEmpty()
      controllerRef.current = null
      controller.destroy()
    }
  }, [])

  // Open/close side effects: obstruction (desktop only) + artifact focus.
  // ORDER (review P1): obstruction FIRST — focusArtifact's fly target is
  // computed against the effective window; installing it after would leave
  // the artifact under the drawer on narrow desktops.
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    if (openId === null) {
      controller.setObstruction(null)
      return
    }
    if (!mobile) {
      const rect = panelHostRef.current?.querySelector('.panel')?.getBoundingClientRect()
      if (rect) controller.setObstruction({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
    }
    controller.focusArtifact(openId)
  }, [openId, mobile])

  const closePanel = useCallback(() => setOpenId(null), [])

  return (
    <main aria-label="Mapa Na Cuia">
      <div ref={hostRef} style={{ height: '100dvh' }} data-scene-host="" />
      <div ref={panelHostRef}>
        <Panel
          project={openId === null ? null : findProject(openId)}
          onClose={closePanel}
          mobile={mobile}
          inertTarget="[data-scene-host]"
        />
      </div>
      <Controls
        onZoomIn={() => controllerRef.current?.zoomBy(1.4)}
        onZoomOut={() => controllerRef.current?.zoomBy(1 / 1.4)}
        onReset={() => controllerRef.current?.reset()}
      />
      <TitleOverlay />
    </main>
  )
}
