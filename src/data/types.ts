export interface Point {
  x: number
  y: number
}

export interface ProjectPos {
  x: number
  y: number
  from: Point[]
}

export interface Project {
  name: string
  icon?: string
  pos?: ProjectPos
  conflitos: string[]
  acao: string[]
  identificacao_e_territorio: string[]
  futuro: string[]
  memoria: string[]
  identidade: string[]
}

export interface CityMap {
  name: string
  projects: Record<string, Project>
}

export interface ComiteData {
  maps: Record<string, CityMap>
}

export const SECTION_KEYS = [
  'conflitos',
  'acao',
  'identificacao_e_territorio',
  'futuro',
  'memoria',
  'identidade',
] as const

export type SectionKey = (typeof SECTION_KEYS)[number]
