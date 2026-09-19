import rawData from '../../data.json'
import { validateComiteData } from './schema'
import type { ComiteData } from './types'
import { ui } from './ui'

/**
 * Module-level validation: an invalid `data.json` throws at import time, before
 * any scene or UI code runs (SPEC §7 — schema violations fail loudly).
 *
 * City display names come from `ui.json` (`mapNames`, content-spreadsheet
 * editable) — they override `data.json`'s static `name` so the sheet controls
 * every rendered string (scene labels, city aria-labels).
 */
export const comiteData: ComiteData = applyCityNames(
  validateComiteData(rawData),
  ui.mapNames,
)

function applyCityNames(data: ComiteData, mapNames: Record<string, string>): ComiteData {
  for (const [cityId, city] of Object.entries(data.maps)) {
    const name = mapNames[cityId]
    if (typeof name === 'string' && name.length > 0) city.name = name
  }
  return data
}
