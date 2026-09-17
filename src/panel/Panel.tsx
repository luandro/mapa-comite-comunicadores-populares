/**
 * Phase 6 content panel (SPEC §8 / TODO Phase 6): React-owned dialog surface —
 * the animated SVG is NEVER rendered through JSX (AGENTS invariant 9). Opens
 * on `artifact-tap`, closes on Esc/×/empty-tap; the scene side gets
 * `setObstruction` (desktop only) + `focusArtifact` so the tapped totem sits
 * beside the drawer instead of under it.
 *
 * Lifecycle per SPEC §8: role=dialog + aria-labelledby → org heading; initial
 * focus on the close button; Tab trapped inside; focus returns to the opener;
 * body scroll locked while open.
 */
import { useCallback, useEffect, useRef } from 'react'
import { SECTION_KEYS, type Project } from '../data/types'
import icone1 from '/na cuia/icons/svg/icone 1.svg?url'
import icone2 from '/na cuia/icons/svg/icone 2.svg?url'
import icone3 from '/na cuia/icons/svg/icone 3.svg?url'
import icone4 from '/na cuia/icons/svg/icone 4.svg?url'
import icone5 from '/na cuia/icons/svg/icone 5.svg?url'
import icone7 from '/na cuia/icons/svg/icone 7.svg?url'

/** pt-BR headings, whitelisted section keys in contract order (AGENTS §9). */
const SECTION_LABELS: Record<(typeof SECTION_KEYS)[number], string> = {
  conflitos: 'Conflitos',
  acao: 'Ação',
  identificacao_e_territorio: 'Identificação e território',
  futuro: 'Futuro',
  memoria: 'Memória',
  identidade: 'Identidade',
}

/**
 * Authored section glyphs (§1) — the REAL icon art from `na cuia/icons/svg/`
 * (same set the scene uses), one per whitelisted section. Layout mirrors
 * `na cuia/modal.jpeg`: icon column left, text right. Plain `?url` imports —
 * assets only, never inlined into the scene (AGENTS invariant 3).
 */
const SECTION_ICONS: Record<(typeof SECTION_KEYS)[number], string> = {
  conflitos: icone2, // lightning — conflict/energy
  acao: icone5, // green leaves — action/growth
  identificacao_e_territorio: icone4, // carved territory marker — land
  futuro: icone7, // sprout — what is coming
  memoria: icone3, // totem — memory/ancestry
  identidade: icone1, // the cuia itself — identity
}

/**
 * Wave footer (SPEC §8 art direction): four stroked sine lines echoing the
 * `modal.jpeg` wave detail. Stroked paths (fill:none) so the lines can slide
 * horizontally in a seamless loop — each period is exactly WAVE_W wide, so a
 * one-period translate repeats perfectly.
 */
const WAVE_W = 200
function wavePath(y: number, amp: number): string {
  const half = WAVE_W / 2
  let d = `M${-WAVE_W},${y}`
  for (let x = -WAVE_W; x < 2160.32 + WAVE_W; x += WAVE_W) {
    d += ` q${half / 2},${-amp} ${half},0 q${half / 2},${amp} ${half},0`
  }
  return d
}
const WAVE_PATHS = [wavePath(16, 11), wavePath(33, 10), wavePath(50, 9), wavePath(66, 8)]

export interface PanelProps {
  project: Project | null
  onClose: () => void
  /** True when the viewport is mobile — no obstruction, occlusion by design. */
  mobile: boolean
  /** CSS selector of the background element to make inert while open. */
  inertTarget?: string
}

export function Panel({
  project,
  onClose,
  mobile,
  inertTarget = 'main > div:not([class])',
}: PanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const open = project !== null

  // Dialog lifecycle (SPEC §8): runs per open/close transition.
  useEffect(() => {
    if (!open) return
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement.isConnected
        ? document.activeElement
        : null
    closeRef.current?.focus()
    // Scroll lock (SPEC §8): position:fixed technique — overflow-only leaks
    // background scrolls on mobile Safari. Preserve scroll position with a
    // negative top; restored on EVERY cleanup path.
    const { scrollX, scrollY } = window
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      width: document.body.style.width,
    }
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `${-scrollY}px`
    document.body.style.left = `${-scrollX}px`
    document.body.style.width = '100%'
    const restoreScroll = () => window.scrollTo(scrollX, scrollY)
    // Background (scene + labels + title) inert — covers #labels per TODO.
    const background = document.querySelector<HTMLElement>(inertTarget)
    background?.setAttribute('inert', '')
    return () => {
      document.body.style.overflow = prev.overflow
      document.body.style.position = prev.position
      document.body.style.top = prev.top
      document.body.style.left = prev.left
      document.body.style.width = prev.width
      restoreScroll()
      background?.removeAttribute('inert')
      restoreFocusRef.current?.focus?.()
    }
  }, [open, inertTarget])

  // Focus trap: Tab cycles inside the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
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
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleClose = useCallback(() => onClose(), [onClose])

  if (project === null) return null

  const sections = SECTION_KEYS.map((key) => ({ key, items: project[key] })).filter(
    (section) => section.items.length > 0,
  )

  return (
    <>
      {/* Outside-click backdrop: NOT inert (the scene host is), so taps on the
          map still reach the app and close the panel (empty-tap path, SPEC §8). */}
      <div className="panel-backdrop" onClick={handleClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={mobile ? 'panel panel-mobile' : 'panel'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-heading"
        data-testid="content-panel"
      >
        <button
          ref={closeRef}
          className="panel-close"
          type="button"
          onClick={handleClose}
          aria-label="Fechar painel"
        >
          ×
        </button>
        <h2 id="panel-heading">{project.name}</h2>
        <div className="panel-body" tabIndex={0}>
          {sections.map(({ key, items }) => (
            <section key={key} className="panel-section">
              <img className="panel-icon" src={SECTION_ICONS[key]} alt="" aria-hidden="true" />
              <div className="panel-section-content">
                <h3 className="panel-section-label">{SECTION_LABELS[key]}</h3>
                <ul>
                  {items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
        <svg
          className="panel-footer"
          viewBox="0 0 2160.32 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g className="panel-waves">
            <path className="wave wave-4" d={WAVE_PATHS[3]} />
            <path className="wave wave-3" d={WAVE_PATHS[2]} />
            <path className="wave wave-2" d={WAVE_PATHS[1]} />
            <path className="wave wave-1" d={WAVE_PATHS[0]} />
          </g>
        </svg>
      </div>
    </>
  )
}
