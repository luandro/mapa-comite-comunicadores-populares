import { POS_MARGIN, SCENE_HEIGHT, SCENE_WIDTH } from './constants'
import {
  SECTION_KEYS,
  type CityMap,
  type ComiteData,
  type Point,
  type Project,
  type ProjectPos,
  type SectionKey,
} from './types'

export const DEFAULT_ICON = 'icone-6'

const PROJECT_KEY_LIST = ['name', 'icon', 'pos', ...SECTION_KEYS]
const SECTION_KEY_LIST = SECTION_KEYS as readonly string[]

function fail(path: string, message: string): never {
  throw new Error(`Invalid comite data at ${path}: ${message}`)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateStringArray(path: string, value: unknown): string[] {
  if (!Array.isArray(value)) fail(path, 'expected string[]')
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') fail(`${path}[${i}]`, 'expected string')
  }
  return value as string[]
}

function normalizeIconId(icon: string): string {
  return icon.toLowerCase().replace(/[\s-]+/g, '')
}

const ICON_ALIASES: Record<string, string> = {
  icone1: 'icone-1',
  icone2: 'icone-2',
  icone3: 'icone-3',
  icone4: 'icone-4',
  icone5: 'icone-5',
  icone6: 'icone-6',
  icone7: 'icone-7',
}

function validateSceneCoord(path: string, axis: string, value: number, max: number): void {
  if (value < POS_MARGIN || value > max - POS_MARGIN) {
    const bounds = `[${POS_MARGIN}, ${max - POS_MARGIN}]`
    fail(`${path}.${axis}`, `${axis} = ${value} outside scene rect ${bounds}`)
  }
}

function validatePoint(path: string, value: unknown): Point {
  if (!isPlainObject(value)) fail(path, 'expected an object with numeric x/y')
  for (const key of Object.keys(value)) {
    if (key !== 'x' && key !== 'y') fail(`${path}.${key}`, 'unknown key (allowed: x, y)')
  }
  const { x, y } = value
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(`${path}.x`, 'expected a finite number')
  if (typeof y !== 'number' || !Number.isFinite(y)) fail(`${path}.y`, 'expected a finite number')
  validateSceneCoord(path, 'x', x, SCENE_WIDTH)
  validateSceneCoord(path, 'y', y, SCENE_HEIGHT)
  return { x, y }
}

function validatePos(path: string, value: unknown): ProjectPos {
  if (!isPlainObject(value)) fail(path, 'expected an object { x, y, from? }')
  for (const key of Object.keys(value)) {
    if (key !== 'x' && key !== 'y' && key !== 'from') {
      fail(`${path}.${key}`, 'unknown key (allowed: x, y, from)')
    }
  }
  const { x, y } = validatePoint(path, { x: value.x, y: value.y })
  let from: Point[] = []
  if (value.from !== undefined) {
    if (!Array.isArray(value.from)) fail(`${path}.from`, 'expected Point[]')
    from = value.from.map((point, i) => validatePoint(`${path}.from[${i}]`, point))
  }
  return { x, y, from }
}

function validateIcon(path: string, value: unknown): string {
  if (typeof value !== 'string') fail(`${path}.icon`, 'expected a string')
  const normalized = normalizeIconId(value)
  if (!Object.hasOwn(ICON_ALIASES, normalized)) {
    console.warn(
      `[schema] unknown icon "${value}" at ${path}.icon — defaulting to "${DEFAULT_ICON}" ` +
        `(known: ${Object.values(ICON_ALIASES).join(', ')})`,
    )
    return DEFAULT_ICON
  }
  return ICON_ALIASES[normalized]
}

function validateProject(path: string, value: unknown): Project {
  if (!isPlainObject(value)) fail(path, 'expected an object')
  const keys = Object.keys(value)
  for (const key of keys) {
    if (!PROJECT_KEY_LIST.includes(key)) {
      fail(`${path}.${key}`, `unknown key (allowed: ${PROJECT_KEY_LIST.join(', ')})`)
    }
  }
  const name = value.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    fail(`${path}.name`, 'expected a non-empty string')
  }
  const presentSections = keys.filter((key) => SECTION_KEY_LIST.includes(key))
  const orderValid =
    presentSections.length === SECTION_KEYS.length &&
    presentSections.every((key, i) => key === SECTION_KEYS[i])
  if (!orderValid) {
    fail(
      path,
      `section keys must be exactly the six canonical keys in order ` +
        `(${SECTION_KEYS.join(', ')}); got (${presentSections.join(', ') || 'none'})`,
    )
  }
  const sections = {} as Record<SectionKey, string[]>
  for (const key of SECTION_KEYS) {
    sections[key] = validateStringArray(`${path}.${key}`, value[key])
  }
  const project: Project = { name, ...sections }
  if (value.icon !== undefined) project.icon = validateIcon(path, value.icon)
  if (value.pos !== undefined) project.pos = validatePos(`${path}.pos`, value.pos)
  return project
}

function validateCity(path: string, value: unknown): CityMap {
  if (!isPlainObject(value)) fail(path, 'expected an object with name and projects')
  for (const key of Object.keys(value)) {
    if (key !== 'name' && key !== 'projects') {
      fail(`${path}.${key}`, 'unknown key (allowed: name, projects)')
    }
  }
  if (typeof value.name !== 'string') fail(`${path}.name`, 'expected a string')
  if (!isPlainObject(value.projects)) fail(`${path}.projects`, 'expected an object of projects')
  const projects: Record<string, Project> = {}
  for (const projectId of Object.keys(value.projects)) {
    const projectPath = `${path}.projects.${projectId}`
    projects[projectId] = validateProject(projectPath, value.projects[projectId])
  }
  return { name: value.name, projects }
}

/**
 * Validate raw parsed `data.json` against the comite data contract.
 * Throws with a precise path (e.g. `maps.belem.projects.na_cuia.pos.from[0].x`)
 * on any shape violation; accepted icon aliases are rewritten to their canonical
 * `icone-<n>` form, unknown icons warn and fall back to DEFAULT_ICON.
 */
export function validateComiteData(raw: unknown): ComiteData {
  if (!isPlainObject(raw)) fail('root', 'expected an object')
  const rootKeys = Object.keys(raw)
  if (rootKeys.length !== 1 || rootKeys[0] !== 'maps') {
    fail('root', `expected exactly one key "maps"; got (${rootKeys.join(', ') || 'none'})`)
  }
  if (!isPlainObject(raw.maps)) fail('maps', 'expected an object of cities')
  const maps: Record<string, CityMap> = {}
  for (const cityId of Object.keys(raw.maps)) {
    maps[cityId] = validateCity(`maps.${cityId}`, raw.maps[cityId])
  }
  return { maps }
}
