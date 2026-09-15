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
import { Panel } from './panel/Panel'
import { isMobile } from './device'
import { mountScene, type SceneController } from './scene/mount'
import './panel/panel.css'

/** Authored blob backing the title (SPEC §3) — a soft hand-drawn ellipse. */
const TITLE_BLOB_PATH =
  'M12,34 C10,18 34,8 78,6 C132,4 178,10 182,26 C186,42 158,52 104,54 C48,56 14,50 12,34 Z'

/** Title overlay — above the scene, below future controls (SPEC §3 z-order). */
function TitleOverlay() {
  return (
    <div className="app-title">
      <svg className="app-title-blob" viewBox="0 0 194 60" aria-hidden="true">
        <path d={TITLE_BLOB_PATH} />
      </svg>
      <h1>Na Cuia</h1>
      <p>Comitê de Comunicadores Populares</p>
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
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    if (openId === null) {
      controller.setObstruction(null)
      return
    }
    controller.focusArtifact(openId)
    if (mobile) return // occlusion by design — no obstruction, no fly math
    const rect = panelHostRef.current?.querySelector('.panel')?.getBoundingClientRect()
    if (rect) {
      controller.setObstruction({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
    }
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
      <TitleOverlay />
    </main>
  )
}
