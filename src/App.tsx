/**
 * Phase 1 shell: React only provides the full-viewport host and mounts the
 * imperative scene island in exactly one useEffect (SPEC §3/§10). The animated
 * SVG is never rendered through JSX; StrictMode's mount → destroy → mount is
 * handled by SceneController.destroy().
 *
 * Phase 3: React owns the title overlay (SPEC §3) — live HTML (Fraunces) over
 * an authored blob path (drawn in code, not sourced from any asset). Its
 * reveal is keyed off the scene's `intro-done` class on <html>, so the scene
 * owns the timing while React owns the markup.
 */
import { useEffect, useRef } from 'react'
import { comiteData } from './data/load'
import { mountScene } from './scene/mount'

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

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = mountScene(hostRef.current!, comiteData)
    return () => controller.destroy()
  }, [])

  return (
    <main aria-label="Mapa Na Cuia">
      <div ref={hostRef} style={{ height: '100dvh' }} />
      <TitleOverlay />
    </main>
  )
}
