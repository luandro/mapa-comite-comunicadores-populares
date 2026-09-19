/**
 * `bun run content:export` — one-time seed: data.json + ui.json → two CSVs
 * (`Coletivos.csv`, `Textos do site.csv`) in `content/` for import into the
 * shared Google Spreadsheet. The CSVs are a handoff artifact, NOT canonical —
 * they are gitignored (edit the spreadsheet, then `content:import`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COLETIVOS_HEADERS,
  SECTION_HEADER_PT,
  TEXTOS_HEADERS,
  TEXTOS_ROWS,
  assertNoNewlineItems,
  type UiModel,
  toCsv,
} from './content-core'
import type { ComiteData } from '../src/data/types'

const root = new URL('..', import.meta.url).pathname
const outDir = resolve(root, 'content')

const data = JSON.parse(readFileSync(resolve(root, 'data.json'), 'utf8')) as ComiteData
const ui = JSON.parse(readFileSync(resolve(root, 'src/data/ui.json'), 'utf8')) as UiModel

const rows: string[][] = []
for (const [mapId, map] of Object.entries(data.maps)) {
  for (const [projectId, project] of Object.entries(map.projects)) {
    rows.push([
      projectId,
      mapId,
      project.name,
      project.icon ?? 'icone-6',
      ...Object.keys(SECTION_HEADER_PT).map((key) =>
        (project as unknown as Record<string, string[]>)[key].join('\n'),
      ),
    ])
  }
}

// Round-trip safety (Opus Q2): a newline inside an item would split into two.
for (const [loopMapId, map] of Object.entries(data.maps)) {
  for (const [projectId, project] of Object.entries(map.projects)) {
    for (const key of Object.keys(SECTION_HEADER_PT)) {
      assertNoNewlineItems(
        (project as unknown as Record<string, string[]>)[key],
        `${loopMapId}/${projectId}.${key}`,
      )
    }
  }
}

mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'Coletivos.csv'), toCsv(COLETIVOS_HEADERS, rows), 'utf8')

const textosRows = TEXTOS_ROWS.map((row) => {
  const value = row.get(ui)
  if (typeof value !== 'string') {
    throw new Error(`Textos key ${row.key} resolved to a non-string (core table bug)`)
  }
  return [row.key, row.onde, value]
})
writeFileSync(resolve(outDir, 'Textos do site.csv'), toCsv(TEXTOS_HEADERS, textosRows), 'utf8')

console.log(`content/: ${rows.length} coletivos, ${textosRows.length} textos`)
console.log('Importe os dois arquivos como abas da planilha compartilhada (Formato → Número → Texto simples ANTES de colar).')
