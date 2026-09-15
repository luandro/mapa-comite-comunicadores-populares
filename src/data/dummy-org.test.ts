// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comiteData } from './load'
import { validateComiteData } from './schema'

/**
 * Phase 7 "honest data promise" (AGENTS invariant 10): adding a new org is a
 * CONTENT-ONLY edit — data.json + optional icon — with no TypeScript changes.
 * These tests simulate that by mutating the loaded data the way the
 * calibration tool would, then asserting the schema accepts (or loudly
 * rejects) it.
 */
describe('dummy-org content-only addition (AGENTS 10)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('a new org (no icon, no pos) validates — content-only edit needs no TS changes', () => {
    const data = structuredClone(comiteData) as typeof comiteData
    data.maps.belem.projects.dummy_org_test = {
      name: 'ORG FANTASMA (TESTE)',
      conflitos: [],
      acao: ['Teste'],
      identificacao_e_territorio: [],
      futuro: [],
      memoria: [],
      identidade: [],
    }
    expect(() => validateComiteData(data)).not.toThrow()
  })

  it('a new org with in-rect pos + from validates', () => {
    const data = structuredClone(comiteData) as typeof comiteData
    data.maps.belem.projects.dummy_org_test = {
      name: 'ORG FANTASMA (TESTE)',
      conflitos: [],
      acao: [],
      identificacao_e_territorio: [],
      futuro: [],
      memoria: [],
      identidade: [],
      pos: { x: 800, y: 900, from: [{ x: 850, y: 850 }] },
    }
    expect(() => validateComiteData(data)).not.toThrow()
  })

  it('an out-of-rect pos fails validation loudly (POS_MARGIN contract)', () => {
    const data = structuredClone(comiteData) as typeof comiteData
    data.maps.belem.projects.dummy_org_test = {
      name: 'ORG FORA DO MAPA',
      conflitos: [],
      acao: [],
      identificacao_e_territorio: [],
      futuro: [],
      memoria: [],
      identidade: [],
      pos: { x: 99999, y: 900, from: [] },
    }
    expect(() => validateComiteData(data)).toThrow()
  })
})
