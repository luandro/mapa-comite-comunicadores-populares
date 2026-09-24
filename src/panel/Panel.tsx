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
import { ui } from '../data/ui'
import icone1 from '/na cuia/icons/svg/icone 1.svg?url'
import icone2 from '/na cuia/icons/svg/icone 2.svg?url'
import icone3 from '/na cuia/icons/svg/icone 3.svg?url'
import icone4 from '/na cuia/icons/svg/icone 4.svg?url'
import icone5 from '/na cuia/icons/svg/icone 5.svg?url'
import icone7 from '/na cuia/icons/svg/icone 7.svg?url'
import onda1 from '/na cuia/icons/svg/onda 1.svg?scene'
import onda2 from '/na cuia/icons/svg/onda 2.svg?scene'
import onda4 from '/na cuia/icons/svg/onda 4.svg?scene'

/** pt-BR headings live in `ui.json` (`sectionLabels`) — content-editable via
 * the spreadsheet pipeline; whitelisted section keys in contract order
 * (AGENTS §9). A missing label is a hard error, never a silent fallback. */
function sectionLabel(key: (typeof SECTION_KEYS)[number]): string {
  const label = ui.sectionLabels[key]
  if (typeof label !== 'string' || label.length === 0) {
    throw new Error(`Panel: missing ui.sectionLabels.${key} (run content:import?)`)
  }
  return label
}

/** The scene's deselect fly-back duration (mount.ts UNFOCUS_DURATION, s→ms).
 * Focus restoration waits this out so the restored focus (:focus-visible)
 * cannot re-trigger the artifact focus-flight mid-fly and cancel it. */
const UNFOCUS_SETTLE_MS = 650

/**
 * Authored section glyphs (§1) — the REAL icon art from `na cuia/icons/svg/`
 * (same set the scene uses), one per whitelisted section. v1.2 centered
 * layout: each icon sits above its centered text block. Plain `?url` imports
 * — assets only, never inlined into the scene (AGENTS invariant 3).
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
 * Wave footer (SPEC §8 art direction) — the REAL `onda` gradient bands from
 * `na cuia/icons/svg/` (the same art the mock layers: onda 4 @ 0.2 → onda 2
 * @ 0.8 → onda 1 solid, densifying downward, per the modal.jpeg scanlines).
 * Imported through the `?scene` pipeline so Illustrator classes are resolved
 * to attributes (AGENTS gotcha); decoration only, never mounted as scene
 * layers (v1.1 removed the scene band system — this is panel art, SPEC §8).
 */
function innerSvg(processed: string): string {
  const start = processed.indexOf('>') + 1
  const end = processed.lastIndexOf('</svg>')
  return processed.slice(start, end)
}

/**
 * Painted ink span of the onda paths (getBBox-measured): the inks run
 * x = 35.45…2117.97 inside the shared 2160.32 viewBox — the outer ~35/42
 * units are transparent margins. All wave geometry keys off the INK span,
 * not the viewBox width.
 */
const WAVE_INK_L = 35.45
const WAVE_INK_R = 2117.97
const WAVE_INK_W = WAVE_INK_R - WAVE_INK_L
/**
 * Overlay strip height (band units). The overlay straddles the card's bottom
 * edge (CSS `top: calc(100% - 60px)` inside .panel-frame): the first 60px of
 * bands paint over the cream, the remaining 80px flow over the live map and
 * dissolve via the fade mask.
 */
const WAVE_OVERLAY_H = 300
/**
 * Band cascade (design parity with modal.jpeg: ~12 stacked wave lines at ~9px
 * mock pitch ≈ 18 band-units at card scale). Three assets alternate — onda4
 * (faintest) near the card, onda2 mid, onda1 (solid) — repeated every 18
 * units down the strip; the fade mask dissolves the tail into the map.
 * 42 bands per tile × 3 tile copies = 126 single-path groups — three reused
 * assets under ONE animated parent (CSS transform), so cost stays trivial.
 */
const WAVE_BAND_PITCH = 18
const ONDA_STACK: Array<{ body: string; offset: number }> = []
for (let tier = 0; tier < 7; tier++) {
  const base = tier * (WAVE_BAND_PITCH * 2) // 36-unit tier (18 pitch + 18 gap)
  ONDA_STACK.push(
    { body: innerSvg(onda4), offset: base },
    { body: innerSvg(onda2), offset: base + WAVE_BAND_PITCH / 3 },
    { body: innerSvg(onda1), offset: base + (2 * WAVE_BAND_PITCH) / 3 },
    { body: innerSvg(onda4), offset: base + WAVE_BAND_PITCH },
    { body: innerSvg(onda2), offset: base + WAVE_BAND_PITCH + WAVE_BAND_PITCH / 3 },
    { body: innerSvg(onda1), offset: base + WAVE_BAND_PITCH + (2 * WAVE_BAND_PITCH) / 3 },
  )
}

/**
 * One periodic tile = the full band stack, laid out as the 3-copy
 * [A][A′][A] mirror chain (the proven seamless-tile pattern from the
 * retired scene bands), with every copy translated so its INK (not the
 * viewBox) starts at the chain position:
 *
 *   copy 0 (plain):   ink [0, W]     at x = −L
 *   copy 1 (mirror):  ink [W, 2W]    at x = 2R − L   (x' = b − x)
 *   copy 2 (plain):   ink [2W, 3W]   at x = 2W − L
 *
 * The chain paints [0, 3W] with NO gaps, and after the CSS drift of
 * −2W (panel.css `translateX(-200%)` against a W-wide viewBox) the
 * window holds copy 2 ≡ copy 0 — seamless wrap by construction.
 */
/*
 * Tile chain (ink-span math, solved numerically in the commit message):
 *   copy 0 plain  a = −L        → ink [0, W]
 *   copy 1 mirror b = 2R − L    → ink [W, 2W]   (x' = b − x maps [L,R]→[b−R,b−L])
 *   copy 2 plain  c = 2W − L    → ink [2W, 3W]
 */
const TILE_POSITIONS: Array<{ x: number; mirror: boolean }> = [
  { x: -WAVE_INK_L, mirror: false },
  { x: 2 * WAVE_INK_R - WAVE_INK_L, mirror: true },
  { x: 2 * WAVE_INK_W - WAVE_INK_L, mirror: false },
]
function waveTile(key: number): JSX.Element {
  const { x, mirror } = TILE_POSITIONS[key]
  return (
    <g key={key} transform={mirror ? `translate(${x},0) scale(-1,1)` : `translate(${x},0)`}>
      {ONDA_STACK.map(({ body, offset }, i) => (
        <g
          key={i}
          transform={`translate(0,${offset})`}
          dangerouslySetInnerHTML={{ __html: body }}
        />
      ))}
    </g>
  )
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
  const bodyRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const restoreTimer = useRef<number | null>(null)
  const open = project !== null

  // Dialog lifecycle (SPEC §8): runs per open/close transition.
  useEffect(() => {
    if (!open) return
    // A pending restoration from a previous close cycle is stale — cancel it
    // so it can never fire against the replaced restoreFocusRef.current.
    if (restoreTimer.current !== null) {
      window.clearTimeout(restoreTimer.current)
      restoreTimer.current = null
    }
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
      // Restore focus AFTER the scene finishes the deselect fly-back (issue
      // #11 / codex final-gate P1): focusing the triggering artifact while
      // the camera is still flying matches :focus-visible and re-triggers the
      // artifact focus-flight (mount.ts), cancelling the fly-back mid-air.
      // The flight is ~0.6s; restore once the camera has settled (or
      // immediately under reduced motion, where the flight is instant).
      // The timer is tracked and cancelled on the next open/close (codex
      // round-2 P1: a rapid close→reopen→close left two timers, and the
      // stale one read the REPLACED restoreFocusRef.current — focusing the
      // new opener mid-fly-back and re-triggering the zoom).
      const delay = Math.round(UNFOCUS_SETTLE_MS)
      restoreTimer.current = window.setTimeout(() => {
        restoreTimer.current = null
        restoreFocusRef.current?.focus?.()
      }, delay)
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

  /**
   * Legend jump (v1.6 desktop): scroll the body to the section block and move
   * focus to it (focus must follow the view — WCAG 2.4.3). `preventScroll`
   * keeps the programmatic focus from fighting the smooth scroll; the offset
   * is hand-tuned breathing room, not magic alignment.
   */
  const jumpToSection = useCallback((key: (typeof SECTION_KEYS)[number]) => {
    const body = bodyRef.current
    const target = body?.querySelector<HTMLElement>(`#panel-sec-${key}`)
    if (!body || !target) return
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // jsdom ships no Element.scrollTo — feature-check, never assume.
    if (typeof body.scrollTo === 'function') {
      body.scrollTo({
        top: target.offsetTop - body.offsetTop - 12,
        behavior: reduce ? 'auto' : 'smooth',
      })
    }
    target.focus({ preventScroll: true })
  }, [])

  if (project === null) return null

  const sections = SECTION_KEYS.map((key) => ({ key, items: project[key] })).filter(
    (section) => section.items.length > 0,
  )

  return (
    <>
      {/* Outside-click backdrop: NOT inert (the scene host is), so taps on the
          map still reach the app and close the panel (empty-tap path, SPEC §8). */}
      <div className="panel-backdrop" onClick={handleClose} aria-hidden="true" />
      {/* Frame owns the fixed/centered placement + entrance animation. The
          card and the wave overlay position INSIDE it, so the overlay tracks
          the card's bottom edge purely with CSS (top: calc(100% - 60px)) —
          no rect-sync JS, no entrance-animation race (review round 1). */}
      <div className={mobile ? 'panel-frame panel-mobile' : 'panel-frame'}>
        <div
          ref={panelRef}
          className="panel"
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
            aria-label={ui.labels.closePanel}
          >
            ×
          </button>
          <h2 id="panel-heading">{project.name}</h2>
          {/* v1.6 desktop legend: on desktop the columns wrapper holds the
              legend aside + the scrolling body side by side; on mobile it is
              a plain flex pass-through and the legend is NOT rendered at all
              (DOM parity with the v1.5 layout the user approved). */}
          <div className={mobile ? 'panel-columns' : 'panel-columns panel-columns-legend'}>
            {!mobile && (
              <aside className="panel-legend-col" aria-labelledby="panel-legend-title">
                <div className="panel-legend">
                  <h3 id="panel-legend-title" className="panel-legend-title">
                    {ui.labels.legendTitle}
                  </h3>
                  <ul className="panel-legend-list">
                    {sections.map(({ key }) => (
                      <li key={key}>
                        <button
                          type="button"
                          className="panel-legend-entry"
                          onClick={() => jumpToSection(key)}
                        >
                          <img src={SECTION_ICONS[key]} alt="" aria-hidden="true" />
                          <span>{sectionLabel(key)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            )}
            <div ref={bodyRef} className="panel-body" tabIndex={0}>
              {sections.map(({ key, items }) => (
                <section
                  key={key}
                  id={`panel-sec-${key}`}
                  tabIndex={-1}
                  className="panel-section"
                  aria-labelledby={`panel-h-${key}`}
                >
                  <img className="panel-icon" src={SECTION_ICONS[key]} alt="" aria-hidden="true" />
                  <div className="panel-section-content">
                    <h3
                      id={`panel-h-${key}`}
                      className={mobile ? 'panel-section-label' : 'panel-section-label sr-only'}
                    >
                      {sectionLabel(key)}
                    </h3>
                    <ul>
                      {items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
        {/* v1.2 user directive: the waves straddle the card's bottom edge —
            top 60px of bands over the cream (as in modal.jpeg), the rest
            dissolving via the overlay's own SVG fade mask. v1.4: the card
            under that zone is solid darker cream (no map shows through) —
            the waves dissolve INTO the card's color. */}
        <svg
          className="panel-waves-overlay"
          viewBox={`0 0 ${WAVE_INK_W} ${WAVE_OVERLAY_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="panel-wave-fade" x1="0" y1="0" x2="0" y2="1">
              {/* solid at the overlay top (on cream), ≈half opacity at the
                  card seam, transparent at the bottom: the bands melt into
                  the solid darker-cream fade zone (v1.4 — no map behind) */}
              <stop offset="0" stopColor="#fff" stopOpacity="1" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id="panel-wave-mask">
              <rect width={WAVE_INK_W} height={WAVE_OVERLAY_H} fill="url(#panel-wave-fade)" />
            </mask>
          </defs>
          <g mask="url(#panel-wave-mask)">
            {/* STATIC mask wrapper — the mask must NOT travel with the animated
                group (it would slide out of the viewport mid-loop). */}
            <g className="panel-waves">
              {waveTile(0)}
              {waveTile(1)}
              {waveTile(2)}
            </g>
          </g>
        </svg>
      </div>
    </>
  )
}
