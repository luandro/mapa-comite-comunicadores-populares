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

/** Hand-drawn burger strokes (issue #10): three wobbly ink lines, no generic
 * hamburger glyph. Drawn in code like TITLE_BLOB_PATH — no new asset.
 * MOBILE-ONLY since the desktop title-info rework: on non-coarse pointers the
 * title never retracts and an info button replaces the burger. */
const BURGER_STROKES = [
  'M6,9 C30,5 60,8 88,6 C98,5.4 104,7 103,9.5 C102,12 94,12.6 84,13 L14,14.5 C8,14.6 5,12.6 6,9 Z',
  'M10,24 C36,20.5 66,23 92,21.5 C101,21 106,23 105,25.5 C104,28 96,28.4 86,28.6 L16,29.8 C10,29.9 9,26.6 10,24 Z',
  'M14,39 C38,36 64,38 88,36.8 C97,36.3 103,38 102,40.4 C101,42.8 94,43.2 84,43.4 L20,44.6 C14,44.7 13,41.4 14,39 Z',
] as const

/** Hand-drawn info glyph for the desktop about button: an "i" as a wobbly dot
 * + stem (ink-stroke style matching BURGER_STROKES — no generic glyph, no new
 * asset; drawn in code like every other authored overlay path). */
const INFO_GLYPH = [
  // dot
  'M52,7 C58,6.2 63,9 63.4,13.6 C63.8,18.4 59.6,21.6 54.4,21.2 C49.4,20.8 46.2,17.6 46.8,13.4 C47.3,10 49.2,7.5 52,7 Z',
  // stem
  'M51,27 C58,25.4 64,27.4 63.6,31.6 C63.3,34.8 62,38 61.4,42 C60.8,46 61.4,49.4 58.6,50.4 C55.6,51.4 51.2,50.6 50.2,47.4 C49.4,44.8 50.8,41 51.6,37 C52.3,33.6 51.4,31.8 47.8,32.2 C44.6,32.5 43.4,29 45.6,27.6 C47.2,26.6 49,27.4 51,27 Z',
] as const

/** About-the-project copy (pt-BR, issue #10 — shown inside the burger menu). */
const PROJECT_ABOUT =
  'O Na Cuia mapeia 25 coletivos de comunicadores populares de Belém, Ananindeua e Moju (Pará), integrantes do Comitê de Comunicadores Populares. Cada totem no mapa representa um coletivo: toque nele para conhecer seus conflitos, ações, território, futuro, memória e identidade.'

/** Title overlay — above the scene, below future controls (SPEC §3 z-order).
 * Issue #10: the title appears with the intro, then retracts into a
 * hand-drawn burger button; tapping it opens a paper-style menu with the
 * full title + about text. React state only — never scene SVG via JSX. */
function useMenuDialog(
  menuOpen: boolean,
  close: () => void,
  burgerRef: React.RefObject<HTMLButtonElement | null>,
  menuRef: React.RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    if (!menuOpen) return
    // Inert the scene host while open (Panel.tsx §8 convention): a Tab that
    // escapes to <body> would otherwise walk into the scene's tabbable
    // cities/artifacts UNDER the backdrop and Enter could open the Panel
    // beneath the menu (opus 19 P2).
    const background = document.querySelector<HTMLElement>('[data-scene-host]')
    background?.setAttribute('inert', '')
    menuRef.current?.querySelector<HTMLElement>('.app-menu-close')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        return
      }
      if (event.key !== 'Tab' || !menuRef.current) return
      const focusables = menuRef.current.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    // Copy the ref to a local: the cleanup closure must focus the burger
    // button that existed when the menu OPENED, not whatever node the ref
    // holds by teardown time (react-hooks/exhaustive-deps).
    const burger = burgerRef.current
    return () => {
      document.removeEventListener('keydown', onKey)
      background?.removeAttribute('inert')
      // Restore focus AFTER the menu unmounts — the burger re-takes it.
      burger?.focus()
    }
  }, [menuOpen, close, burgerRef, menuRef])
}

/** Title overlay — above the scene, below future controls (SPEC §3 z-order).
 * Issue #10 (mobile): the title appears with the intro, then retracts into a
 * hand-drawn burger button; tapping it opens a paper-style menu with the full
 * title + about text. Desktop (user directive): the title STAYS on screen and
 * a hand-drawn info button in the top-right opens the same centered about
 * dialog — no retraction, no burger. React state only — never scene SVG
 * via JSX. */
export function TitleOverlay() {
  const [retracted, setRetracted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobile] = useState(isMobile)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useMenuDialog(menuOpen, closeMenu, burgerRef, menuRef)

  // Retract once the scene intro settles (natural end or skip) — MOBILE ONLY:
  // on desktop the title persists and the about entry point is the info
  // button, so the whole observer/timer machinery never arms (user directive).
  // The class gate keeps reduced-motion as an instant state jump (CSS
  // transition:none).
  useEffect(() => {
    if (!mobile) return
    let disposed = false
    // All teardown paths funnel through ONE cleanup (codex 19 P2): the
    // observer disconnect + retract timer are registered as they are created
    // so unmount at any point (before/after the import resolves, before or
    // after intro-done) never leaks the observer or fires a stale update.
    let cleanup: (() => void) | null = null
    const armRetract = () => {
      const t = window.setTimeout(() => {
        if (!disposed) setRetracted(true)
      }, 1200)
      cleanup = () => {
        window.clearTimeout(t)
        observer.disconnect()
      }
    }
    const observer = new MutationObserver(() => {
      if (document.documentElement.classList.contains('intro-done') && !cleanup) {
        armRetract()
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    void import('./scene/intro').then(({ prefersReducedMotion }) => {
      if (disposed) return
      // Reduced motion = no transition, not no title: keep the 1.2s read
      // delay; the retract itself is the CSS state jump (media query).
      if (
        !prefersReducedMotion() &&
        document.documentElement.classList.contains('intro-done') &&
        !cleanup
      ) {
        armRetract()
      }
    })
    return () => {
      disposed = true
      cleanup?.()
      observer.disconnect()
    }
  }, [mobile])

  const openMenu = useCallback(() => setMenuOpen(true), [])

  return (
    <>
      <div className={retracted ? 'app-title is-retracted' : 'app-title'}>
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
      {mobile ? (
        <button
          type="button"
          ref={burgerRef}
          className={retracted ? 'app-burger is-retracted' : 'app-burger'}
          aria-label="Abrir menu do projeto"
          aria-expanded={menuOpen}
          onClick={openMenu}
          // Invisible until retraction — keep it out of the tab order then too
          // (codex 19 P2): opacity:0 + pointer-events do not remove a button
          // from tab order. No aria-hidden: it is a focusable control whose
          // state simply hasn't arrived yet.
          tabIndex={retracted ? 0 : -1}
        >
          <svg viewBox="0 0 110 50" aria-hidden="true">
            {BURGER_STROKES.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        </button>
      ) : (
        <button
          type="button"
          ref={burgerRef}
          className="app-info"
          aria-label="Sobre o projeto"
          aria-expanded={menuOpen}
          onClick={openMenu}
        >
          <svg viewBox="0 0 110 58" aria-hidden="true">
            {INFO_GLYPH.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        </button>
      )}
      {menuOpen && (
        <>
          <div className="app-menu-backdrop" onClick={closeMenu} aria-hidden="true" />
          <div
            ref={menuRef}
            className="app-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-menu-title"
          >
            <button
              type="button"
              className="app-menu-close"
              onClick={closeMenu}
              aria-label="Fechar menu"
            >
              ×
            </button>
            <div className="app-menu-title" id="app-menu-title">
              <svg
                className="app-title-blob"
                viewBox="0 0 920 126"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d={TITLE_BLOB_PATH} />
              </svg>
              <h2>
                <span>Mapeamento de 25 Coletivos do</span>
                <span>Comitê de Comunicadores Populares</span>
              </h2>
            </div>
            <p>{PROJECT_ABOUT}</p>
          </div>
        </>
      )}
    </>
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
