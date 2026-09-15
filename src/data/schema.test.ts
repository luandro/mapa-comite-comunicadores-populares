import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { POS_MARGIN, SCENE_HEIGHT, SCENE_WIDTH } from './constants'
import { DEFAULT_ICON, validateComiteData } from './schema'
import { SECTION_KEYS } from './types'

const SECTION_KEY_LIST = SECTION_KEYS as readonly string[]

function baseProject(): Record<string, unknown> {
  return {
    name: 'TEST ORG',
    conflitos: ['um conflito'],
    acao: [],
    identificacao_e_territorio: [],
    futuro: [],
    memoria: [],
    identidade: [],
  }
}

function dataWith(project: Record<string, unknown>): unknown {
  return { maps: { belem: { name: 'Mapa de Belém', projects: { test_org: project } } } }
}

describe('validateComiteData — real data.json', () => {
  it('validates the canonical file with belem and ananindeua present', () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL('../../data.json', import.meta.url), 'utf8'),
    )
    const data = validateComiteData(raw)
    expect(Object.keys(data.maps)).toContain('belem')
    expect(Object.keys(data.maps)).toContain('ananindeua')
    for (const [cityId, city] of Object.entries(data.maps)) {
      for (const [projectId, project] of Object.entries(city.projects)) {
        const sectionKeys = Object.keys(project).filter((key) => SECTION_KEY_LIST.includes(key))
        expect(sectionKeys, `${cityId}/${projectId} section order`).toEqual([...SECTION_KEYS])
      }
    }
  })
})

describe('validateComiteData — shape violations', () => {
  it('throws on an extra top-level key', () => {
    const raw = { ...(dataWith(baseProject()) as object), extra: true }
    expect(() => validateComiteData(raw)).toThrow('expected exactly one key "maps"')
  })

  it('throws on an extra city-level key', () => {
    const raw = {
      maps: { belem: { name: 'Mapa de Belém', projects: {}, extra: true } },
    }
    expect(() => validateComiteData(raw)).toThrow('maps.belem.extra')
  })

  it('throws on a missing section key', () => {
    const project = baseProject()
    delete project.futuro
    expect(() => validateComiteData(dataWith(project))).toThrow(/canonical keys in order/)
  })

  it('throws on sections in wrong order', () => {
    const project = {
      name: 'TEST ORG',
      acao: [],
      conflitos: [],
      identificacao_e_territorio: [],
      futuro: [],
      memoria: [],
      identidade: [],
    }
    expect(() => validateComiteData(dataWith(project))).toThrow(/canonical keys in order/)
  })

  it('throws when a section is not string[]', () => {
    const project = { ...baseProject(), conflitos: ['ok', 7] }
    expect(() => validateComiteData(dataWith(project))).toThrow('conflitos[1]')
  })

  it('throws on an empty project name', () => {
    const project = { ...baseProject(), name: '' }
    expect(() => validateComiteData(dataWith(project))).toThrow('maps.belem.projects.test_org.name')
  })

  it('throws on an unknown project key', () => {
    const project = { ...baseProject(), surpresa: true }
    expect(() => validateComiteData(dataWith(project))).toThrow(
      'maps.belem.projects.test_org.surpresa',
    )
  })
})

describe('validateComiteData — icon handling', () => {
  it('substitutes DEFAULT_ICON and warns on an unknown icon', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const data = validateComiteData(dataWith({ ...baseProject(), icon: 'totem-x' }))
      expect(data.maps.belem.projects.test_org?.icon).toBe(DEFAULT_ICON)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('totem-x'))
    } finally {
      warn.mockRestore()
    }
  })

  it('passes a known icon through unchanged', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const data = validateComiteData(dataWith({ ...baseProject(), icon: 'icone-3' }))
      expect(data.maps.belem.projects.test_org?.icon).toBe('icone-3')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('rewrites an accepted icon alias to its canonical id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const data = validateComiteData(dataWith({ ...baseProject(), icon: 'ICONE 3' }))
      expect(data.maps.belem.projects.test_org?.icon).toBe('icone-3')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('keeps a canonical icon id unchanged', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const data = validateComiteData(dataWith({ ...baseProject(), icon: 'icone-6' }))
      expect(data.maps.belem.projects.test_org?.icon).toBe('icone-6')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('rewrites a spaced icon alias to its canonical id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const data = validateComiteData(dataWith({ ...baseProject(), icon: 'icone 2' }))
      expect(data.maps.belem.projects.test_org?.icon).toBe('icone-2')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('validateComiteData — pos validation', () => {
  it('throws when pos.x is beyond the scene width', () => {
    const project = { ...baseProject(), pos: { x: SCENE_WIDTH + 1, y: 100 } }
    expect(() => validateComiteData(dataWith(project))).toThrow('pos.x')
  })

  it('throws when a from point sits below the scene', () => {
    const project = { ...baseProject(), pos: { x: 100, y: 100, from: [{ x: 500, y: -1 }] } }
    expect(() => validateComiteData(dataWith(project))).toThrow('pos.from[0].y')
  })

  it('accepts pos and from points exactly on the rect corners', () => {
    expect(POS_MARGIN).toBe(0)
    const data = validateComiteData(
      dataWith({
        ...baseProject(),
        pos: { x: SCENE_WIDTH, y: SCENE_HEIGHT, from: [{ x: 0, y: 0 }] },
      }),
    )
    expect(data.maps.belem.projects.test_org?.pos).toEqual({
      x: SCENE_WIDTH,
      y: SCENE_HEIGHT,
      from: [{ x: 0, y: 0 }],
    })
  })

  it('defaults from to [] when pos has no from', () => {
    const data = validateComiteData(dataWith({ ...baseProject(), pos: { x: 100, y: 100 } }))
    expect(data.maps.belem.projects.test_org?.pos?.from).toEqual([])
  })

  it('throws on an extra key on a pos point', () => {
    const project = { ...baseProject(), pos: { x: 100, y: 100, surpresa: true } }
    expect(() => validateComiteData(dataWith(project))).toThrow('pos.surpresa')
  })

  it('throws on an extra key on a from point', () => {
    const project = {
      ...baseProject(),
      pos: { x: 100, y: 100, from: [{ x: 500, y: 500, surpresa: true }] },
    }
    expect(() => validateComiteData(dataWith(project))).toThrow('pos.from[0].surpresa')
  })
})
