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
  /** Sheet column MiniBio — short free-text presentation (v1.12). */
  miniBio?: string
  /** Sheet column Redes Sociais — http(s) profile URLs. */
  socialLinks?: string[]
  /** Sheet column Histórias de vida — http(s) article/post URLs. */
  lifeStories?: string[]
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
