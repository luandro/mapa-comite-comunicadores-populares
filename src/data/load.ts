import rawData from '../../data.json'
import { validateComiteData } from './schema'
import type { ComiteData } from './types'

/**
 * Module-level validation: an invalid `data.json` throws at import time, before
 * any scene or UI code runs (SPEC §7 — schema violations fail loudly).
 */
export const comiteData: ComiteData = validateComiteData(rawData)
