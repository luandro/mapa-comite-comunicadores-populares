import uiJson from './ui.json'

/**
 * Typed view of `ui.json` — every user-facing pt-BR string on the site lives
 * in that file (zero hardcoded copy in TSX/HTML). `resolveJsonModule` makes a
 * renamed/removed key a compile error, and the content-import script validates
 * the exact key set before rewriting the file. Content editors edit the shared
 * spreadsheet; `content:import` regenerates this file — it is never edited by
 * hand on the site side.
 */
export interface UiText {
  /** Title-overlay lines, in render order (top line first). */
  titleLines: string[]
  /** About-the-project paragraph (about dialog). */
  about: string
  /** City display names by map id (sheet tab `Textos do site`). */
  mapNames: Record<string, string>
  /** pt-BR heading per whitelisted section key. */
  sectionLabels: Record<string, string>
  /** Browser tab title + meta description (injected at build into index.html). */
  docTitle: string
  metaDescription: string
  /** aria-labels / accessible names for the app chrome. */
  labels: Record<string, string>
}

export const ui = uiJson as UiText

/** Exact key contract the import script enforces (missing key = build break). */
export const UI_LABEL_KEYS = [
  'main',
  'controlsGroup',
  'zoomIn',
  'zoomOut',
  'reset',
  'openMenu',
  'aboutProject',
  'closeMenu',
  'closePanel',
  'legendTitle',
] as const
