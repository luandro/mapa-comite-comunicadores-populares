/**
 * Authored section glyphs (§1) — the REAL icon art from `na cuia/icons/svg/`
 * (same set the scene uses), one per whitelisted section, plus the pt-BR
 * label resolver. Shared by the desktop map legend (MapLegend) and the
 * content panel (Panel). Plain `?url` imports — assets only, never inlined
 * into the scene (AGENTS invariant 3).
 */
import { SECTION_KEYS } from '../data/types'
import { ui } from '../data/ui'
import icone1 from '/na cuia/icons/svg/icone 1.svg?url'
import icone2 from '/na cuia/icons/svg/icone 2.svg?url'
import icone3 from '/na cuia/icons/svg/icone 3.svg?url'
import icone4 from '/na cuia/icons/svg/icone 4.svg?url'
import icone5 from '/na cuia/icons/svg/icone 5.svg?url'
import icone7 from '/na cuia/icons/svg/icone 7.svg?url'

export const SECTION_ICONS: Record<(typeof SECTION_KEYS)[number], string> = {
  conflitos: icone2, // lightning — conflict/energy
  acao: icone5, // green leaves — action/growth
  identificacao_e_territorio: icone4, // carved territory marker — land
  futuro: icone7, // sprout — what is coming
  memoria: icone3, // totem — memory/ancestry
  identidade: icone1, // the cuia itself — identity
}

/** pt-BR headings live in `ui.json` (`sectionLabels`) — content-editable via
 * the spreadsheet pipeline; whitelisted section keys in contract order
 * (AGENTS §9). A missing label is a hard error, never a silent fallback. */
export function sectionLabel(key: (typeof SECTION_KEYS)[number]): string {
  const label = ui.sectionLabels[key]
  if (typeof label !== 'string' || label.length === 0) {
    throw new Error(`Panel: missing ui.sectionLabels.${key} (run content:import?)`)
  }
  return label
}
