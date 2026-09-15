import { useEffect, useRef } from 'react'
import { comiteData } from './data/load'
import { mountScene } from './scene/mount'

/**
 * Phase 1 shell: React only provides the full-viewport host and mounts the
 * imperative scene island in exactly one useEffect (SPEC §3/§10). The animated
 * SVG is never rendered through JSX; StrictMode's mount → destroy → mount is
 * handled by SceneController.destroy().
 */
export default function App() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = mountScene(hostRef.current!, comiteData)
    return () => controller.destroy()
  }, [])

  return (
    <main aria-label="Mapa Na Cuia">
      <div ref={hostRef} style={{ height: '100dvh' }} />
    </main>
  )
}
