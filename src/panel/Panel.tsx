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

/** pt-BR headings, whitelisted section keys in contract order (AGENTS §9). */
const SECTION_LABELS: Record<(typeof SECTION_KEYS)[number], string> = {
  conflitos: 'Conflitos',
  acao: 'Ação',
  identificacao_e_territorio: 'Identificação e território',
  futuro: 'Futuro',
  memoria: 'Memória',
  identidade: 'Identidade',
}

/** Authored section glyphs (§1) — tiny inline strokes, cream/green palette. */
const SECTION_GLYPHS: Record<(typeof SECTION_KEYS)[number], string> = {
  conflitos: 'M3,12 L9,6 L15,12 L21,6', // lightning zig-zag
  acao: 'M12,3 L12,21 M3,12 L21,12', // crossing action strokes
  identificacao_e_territorio: 'M12,21 C7,15 5,11 5,8.5 A7,7 0 0 1 19,8.5 C19,11 17,15 12,21 Z', // territory pin
  futuro: 'M4,15 A8,8 0 1 1 12,20 M12,20 L8,17 M12,20 L9,15.5', // forward arrow arc
  memoria: 'M6,4 H18 V20 L15,17.5 L12,20 L9,17.5 L6,20 Z', // memory banner
  identidade:
    'M12,4 A4,4 0 1 1 12,12 A4,4 0 0 1 12,4 M5,20 C5,15.5 8,13.5 12,13.5 C16,13.5 19,15.5 19,20', // person
}

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
        {sections.map(({ key, items }) => (
          <section key={key} className="panel-section">
            <h3>
              <svg className="panel-glyph" viewBox="0 0 24 24" aria-hidden="true">
                <path d={SECTION_GLYPHS[key]} />
              </svg>
              {SECTION_LABELS[key]}
            </h3>
            <ul>
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <svg
          className="panel-footer"
          viewBox="0 0 2160.32 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0,30 Q90,10 180,30 T360,30 T540,30 T720,30 T900,30 T1080,30 T1260,30 T1440,30 T1620,30 T1800,30 T1980,30 T2160,30 V60 H0 Z" />
        </svg>
      </div>
    </>
  )
}
