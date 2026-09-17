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

/** Authored blob backing the poster title (SPEC §3). Hand-drawn cloud that
 * fully covers both title lines at every viewport (verified 1600×900: text
 * box ≈ x32..888, y21..104 in this 920×126 viewBox — the v1.0 path's
 * bottom-right boundary swept in to x≈650, leaving "Populares" off the
 * cloud; this revision keeps the wobble but holds ≥~900 on the right down
 * to y≈100 and ≥~110 on the bottom across the full text width). */
const TITLE_BLOB_PATH =
  'M10,20 C60,2 130,8 214,5 C310,1 385,10 474,3 C568,-4 655,9 742,4 C830,-1 900,7 914,27 C926,45 922,78 906,100 C890,116 812,113 732,116 C622,120 500,110 398,114 C300,118 200,111 122,113 C62,115 24,110 11,96 C-6,76 -4,38 10,20 Z'

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

  // Open/close side effects: obstruction + artifact focus.
  // v1.2: the panel is a CENTERED MODAL on every form factor — occlusion is
  // by design (same policy as mobile since the drawer became a modal), so
  // setObstruction stays null while open. focusArtifact still flies to the
  // tapped totem; the modal may cover it (user closes to return to context).
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    if (openId === null) {
      controller.setObstruction(null)
      return
    }
    controller.focusArtifact(openId)
  }, [openId])

  // The panel's outside-tap routes through the scene's deselect flow so the
  // SAME gesture closes the modal AND flies the camera back out (issue #11,
  // bot-review P1: onClose → setOpenId(null) alone skipped the fly-back).
  const closePanel = useCallback(() => {
    controllerRef.current?.deselectArtifact()
    setOpenId(null)
  }, [])

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
