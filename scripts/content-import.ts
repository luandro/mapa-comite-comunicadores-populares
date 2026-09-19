/**
 * `bun run content:import <fonte> [--write]` — spreadsheet → site content.
 *
 * `<fonte>`: a local CSV file (either tab — detected by HEADER SIGNATURE, not
 * filename) OR a Google Sheets URL (https://docs.google.com/spreadsheets/d/…).
 * With a URL the script fetches BOTH tabs via /export?format=csv&gid=… using
 * the gids in `content.config.json` (see content.config.example.json).
 *
 * Default is a DRY RUN: prints a cell-level diff and exits 1 on validation
 * errors, writes nothing. `--write` applies: rewrites data.json (pos/icon art
 * untouched — pos is carried over from the repo copy) and src/data/ui.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COLETIVOS_HEADERS,
  SECTION_HEADER_PT,
  TEXTOS_HEADERS,
  TEXTOS_KEYS,
  TEXTOS_ROWS,
  type UiModel,
  foldHeader,
  isFormulaError,
  parseCsv,
  splitItems,
} from './content-core'
import { validateComiteData } from '../src/data/schema'
import type { ComiteData, Project } from '../src/data/types'

const root = new URL('..', import.meta.url).pathname
const WRITE = process.argv.includes('--write')
const sourceArg = process.argv[2] ?? process.env.CONTENT_SOURCE ?? ''

interface Fail {
  cell: string
  message: string
}

const failures: Fail[] = []
const changes: string[] = []
function fail(cell: string, message: string): void {
  failures.push({ cell, message })
}
function change(message: string): void {
  changes.push(message)
}

// --- 1. Load the source (local file or Google Sheets URL) -----------------

async function fetchSheetCsv(url: string, gid: string): Promise<string> {
  const endpoint =
    `https://docs.google.com/spreadsheets/d/${url}/export?format=csv&gid=${encodeURIComponent(gid)}`
  const response = await fetch(endpoint, { redirect: 'follow' })
  const body = await response.text()
  const contentType = response.headers.get('content-type') ?? ''
  if (
    !response.ok ||
    (!contentType.includes('text/csv') && !foldHeader(body.split('\n')[0] ?? '').length)
  ) {
    fail(
      'planilha',
      `Não consegui baixar a aba (gid ${gid}). A planilha está compartilhada como ` +
        `"Qualquer pessoa com o link · Leitor"? (HTTP ${response.status}, ${contentType || 'sem content-type'})`,
    )
    return ''
  }
  return body
}

function looksLikeSpreadsheetId(source: string): boolean {
  return /docs\.google\.com\/spreadsheets/.test(source) || /^[\w-]{20,}$/.test(source)
}

function readLocalCsv(path: string): { name: string; raw: string } {
  const raw = readFileSync(path, 'utf8')
  return { name: path.split('/').pop() ?? path, raw }
}

// --- 2. Header-signature tab detection ------------------------------------

function rowSignature(row: string[]): string {
  return row.map(foldHeader).filter(Boolean).join('|')
}

const COLETIVOS_SIG = rowSignature([...COLETIVOS_HEADERS])
const TEXTOS_SIG = rowSignature([...TEXTOS_HEADERS])

function detectTab(rows: string[][]): 'coletivos' | 'textos' | null {
  for (const row of rows.slice(0, 3)) {
    const sig = rowSignature(row)
    if (sig === COLETIVOS_SIG) return 'coletivos'
    if (sig === TEXTOS_SIG) return 'textos'
  }
  return null
}

function headerMap(row: string[], expected: readonly string[], tab: string): Map<string, number> {
  const index = new Map<string, number>()
  row.forEach((cell, i) => {
    const folded = foldHeader(cell)
    if (folded) index.set(folded, i)
  })
  for (const expectedHeader of expected) {
    if (!index.has(foldHeader(expectedHeader))) {
      fail(
        `${tab}!linha1`,
        `Coluna "${expectedHeader}" não encontrada. Colunas esperadas: ${expected.join(', ')}`,
      )
    }
  }
  return index
}

// --- 3. Parse + validate the Coletivos tab --------------------------------

interface ColetivosRow {
  id: string
  mapa: string
  nome: string
  icone: string
  sections: Record<string, string[]>
}

function parseColetivos(raw: string): ColetivosRow[] {
  const rows = parseCsv(raw)
  const tab = detectTab(rows) === 'coletivos' ? 'Coletivos' : 'aba desconhecida'
  if (rows.length === 0) {
    fail(`${tab}!1`, 'Arquivo vazio')
    return []
  }
  const index = headerMap(rows[0], COLETIVOS_HEADERS, tab)
  const col = (row: string[], name: string): string => {
    const at = index.get(foldHeader(name))
    return at === undefined ? '' : (row[at] ?? '').trim()
  }
  const parsed: ColetivosRow[] = []
  rows.slice(1).forEach((row, rowAt) => {
    const cell = (name: string): string => col(row, name)
    const sheetCell = (name: string): string => `${tab}!${foldHeader(name)}${rowAt + 2}`
    const id = cell('id')
    if (!id) return // blank line
    const mapa = cell('mapa')
    const nome = cell('nome')
    const icone = cell('icone')
    if (icone && !/^icone-?[1-7]$/i.test(foldHeader(icone).replace(/[^a-z0-9-]/g, ''))) {
      const normalized = icone.toLowerCase().replace(/[\s-]+/g, '')
      if (!/^icone[1-7]$/.test(normalized)) {
        fail(
          `${tab}!icone${rowAt + 2}`,
          `"${id}": ícone "${icone}" não existe (válidos: icone-1 … icone-7)`,
        )
      }
    }
    if (!nome) fail(sheetCell('nome'), `"${id}": nome vazio`)
    if (isFormulaError(nome) || isFormulaError(icone)) {
      fail(sheetCell('nome'), `"${id}": célula com erro de fórmula (ex. #REF!, #VALUE!) — corrija na planilha`)
    }
    const sections: Record<string, string[]> = {}
    for (const key of Object.keys(SECTION_HEADER_PT)) {
      const raw = cell(key)
      if (isFormulaError(raw)) {
        fail(sheetCell(key), `"${id}": célula com erro de fórmula — corrija na planilha`)
      }
      sections[key] = splitItems(raw)
    }
    parsed.push({ id, mapa, nome, icone, sections })
  })
  const seen = new Set<string>()
  for (const row of parsed) {
    if (seen.has(row.id)) fail(`${tab}!id`, `id duplicado "${row.id}"`)
    seen.add(row.id)
  }
  return parsed
}

// --- 4. Parse + validate the Textos tab -----------------------------------

function parseTextos(raw: string): Map<string, string> {
  const rows = parseCsv(raw)
  const tab = detectTab(rows) === 'textos' ? 'Textos do site' : 'aba desconhecida'
  const values = new Map<string, string>()
  if (rows.length === 0) {
    fail(`${tab}!1`, 'Arquivo vazio')
    return values
  }
  const index = headerMap(rows[0], TEXTOS_HEADERS, tab)
  const keyAt = index.get('chave') ?? 0
  const valAt = index.get('valor') ?? 2
  rows.slice(1).forEach((row, rowAt) => {
    const key = (row[keyAt] ?? '').trim()
    if (!key) return
    const value = (row[valAt] ?? '').trim()
    if (!TEXTOS_KEYS.includes(key)) {
      fail(`${tab}!A${rowAt + 2}`, `chave desconhecida "${key}" (não edite a coluna chave)`)
      return
    }
    if (!value) {
      fail(`${tab}!C${rowAt + 2}`, `"${key}": valor vazio`)
      return
    }
    if (isFormulaError(value)) {
      fail(`${tab}!C${rowAt + 2}`, `"${key}": célula com erro de fórmula — corrija na planilha`)
      return
    }
    values.set(key, value)
  })
  for (const key of TEXTOS_KEYS) {
    if (!values.has(key)) fail(`${tab}`, `chave obrigatória ausente: "${key}"`)
  }
  return values
}

// --- 5. Merge + re-validate + write ----------------------------------------

function buildUi(base: UiModel, values: Map<string, string>): UiModel {
  const ui: UiModel = JSON.parse(JSON.stringify(base))
  for (const row of TEXTOS_ROWS) {
    const value = values.get(row.key)
    if (value === undefined) continue
    const before = JSON.stringify(row.get(base))
    if (before !== JSON.stringify(value)) {
      change(`texto "${row.key}" atualizado`)
    }
    if (row.set) row.set(ui, value)
  }
  return ui
}

function buildData(base: ComiteData, rows: ColetivosRow[]): ComiteData {
  const data: ComiteData = JSON.parse(JSON.stringify(base))
  // ids must match exactly — a missing row is an editor mistake, never a delete
  for (const map of Object.values(data.maps)) {
    for (const projectId of Object.keys(map.projects)) {
      if (!rows.some((row) => row.id === projectId)) {
        fail('Coletivos!id', `"${projectId}" sumiu da planilha — a coluna id foi editada? (renomear/remover coletivos não é permitido aqui)`)
      }
    }
  }
  for (const row of rows) {
    if (!Object.hasOwn(data.maps, row.mapa)) {
      fail('Coletivos!mapa', `"${row.id}": mapa desconhecido "${row.mapa}" (use: ${Object.keys(data.maps).join(', ')})`)
      continue
    }
    const map = data.maps[row.mapa]
    const existing = map.projects[row.id]
    if (!existing) {
      // new org: content-only addition (AGENTS honest-data promise) — pos/icon
      // calibration remain human steps; the schema fills the section contract
      const fresh: Project = {
        name: row.nome,
        icon: row.icone || undefined,
        conflitos: row.sections.conflitos ?? [],
        acao: row.sections.acao ?? [],
        identificacao_e_territorio: row.sections.identificacao_e_territorio ?? [],
        futuro: row.sections.futuro ?? [],
        memoria: row.sections.memoria ?? [],
        identidade: row.sections.identidade ?? [],
      }
      change(`+ coletivo novo "${row.id}" em ${row.mapa} (calibrar pos/ícone depois)`)
      map.projects[row.id] = fresh
      continue
    }
    if (existing.name !== row.nome) {
      change(`${row.id}: nome "${existing.name}" → "${row.nome}"`)
      existing.name = row.nome
    }
    for (const key of Object.keys(SECTION_HEADER_PT)) {
      const next = row.sections[key] ?? []
      const before = JSON.stringify((existing as unknown as Record<string, string[]>)[key])
      if (before !== JSON.stringify(next)) {
        change(`${row.id}.${key}: ${next.length} item(ns)`)
        ;(existing as unknown as Record<string, string[]>)[key] = next
      }
    }
  }
  return data
}

// --- main -------------------------------------------------------------------

async function main(): Promise<void> {
  if (!sourceArg) {
    console.error('Uso: bun run content:import <Coletivos.csv | URL da planilha> [--write]')
    process.exit(2)
  }

  let coletivosRaw = ''
  let textosRaw = ''
  if (looksLikeSpreadsheetId(sourceArg)) {
    const spreadsheetId = (sourceArg.match(/\/d\/([\w-]+)/) ?? [])[1] ?? sourceArg
    let config: { tabs?: { coletivos?: string; textos?: string } } = {}
    try {
      config = JSON.parse(readFileSync(resolve(root, 'content.config.json'), 'utf8'))
    } catch {
      fail(
        'content.config.json',
        'Para importar por URL, copie content.config.example.json para content.config.json ' +
          'e preencha os gids das abas (Arquivo → Compartilhar → Publicar não é preciso; ' +
          'basta "Qualquer pessoa com o link · Leitor").',
      )
    }
    const gids = config.tabs ?? {}
    if (!gids.coletivos || !gids.textos) {
      fail('content.config.json', 'Preencha tabs.coletivos e tabs.textos com os gids das abas.')
    }
    coletivosRaw = gids.coletivos ? await fetchSheetCsv(spreadsheetId, gids.coletivos) : ''
    textosRaw = gids.textos ? await fetchSheetCsv(spreadsheetId, gids.textos) : ''
  } else {
    const file = readLocalCsv(resolve(process.cwd(), sourceArg))
    const raw = file.raw
    // A file may hold ONE tab (Google per-tab download) or BOTH pasted
    // back-to-back — always scan tab blocks, don't trust the first line.
    for (const block of raw.split(/\n\s*\n/)) {
      const blockKind = detectTab(parseCsv(block))
      if (blockKind === 'coletivos' && !coletivosRaw) coletivosRaw = block
      else if (blockKind === 'textos' && !textosRaw) textosRaw = block
    }
    if (!coletivosRaw && !textosRaw) {
      fail(file.name, 'Não reconheci as colunas deste arquivo — é a aba Coletivos ou Textos do site?')
    }
  }

  if (!coletivosRaw) fail('Coletivos', 'aba Coletivos não fornecida (CSV ou URL com gids)')
  if (!textosRaw) fail('Textos do site', 'aba Textos do site não fornecida (CSV ou URL com gids)')
  if (failures.length > 0) reportAndExit()

  const baseData = JSON.parse(readFileSync(resolve(root, 'data.json'), 'utf8')) as ComiteData
  const baseUi = JSON.parse(readFileSync(resolve(root, 'src/data/ui.json'), 'utf8')) as UiModel

  const coletivos = parseColetivos(coletivosRaw)
  const textos = parseTextos(textosRaw)
  const nextData = buildData(baseData, coletivos)
  const nextUi = buildUi(baseUi, textos)

  // schema + icon validation over the merged result (pos carried over untouched)
  try {
    validateComiteData(nextData)
  } catch (error) {
    fail('validação', error instanceof Error ? error.message : String(error))
  }

  if (failures.length > 0) reportAndExit()

  if (changes.length === 0) {
    console.log('Nenhuma mudança — o site já está em sincronia com a planilha.')
    return
  }
  console.log(`\n${changes.length} mudança(s):`)
  for (const line of changes) console.log(`  • ${line}`)

  if (!WRITE) {
    console.log('\nDRY RUN — nada foi escrito. Rode de novo com --write para aplicar.')
    return
  }
  writeFileSync(resolve(root, 'data.json'), `${JSON.stringify(nextData, null, 2)}\n`, 'utf8')
  writeFileSync(
    resolve(root, 'src/data/ui.json'),
    `${JSON.stringify(nextUi, null, 2)}\n`,
    'utf8',
  )
  console.log('\nEscrito: data.json + src/data/ui.json. Rode bun run build && bun run test.')
}

function reportAndExit(): never {
  console.error(`\n${failures.length} problema(s) na planilha:`)
  for (const { cell, message } of failures) console.error(`  ✗ [${cell}] ${message}`)
  console.error('\nCorrija na planilha e rode de novo. NADA foi escrito.')
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
