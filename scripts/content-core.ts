/**
 * Content pipeline shared core (Phase 8): CSV parsing + the spreadsheet model
 * shared by `content:export` (data.json → seed CSVs) and `content:import`
 * (CSV → data.json + ui.json). No dependencies — a ~40-line RFC 4180 parser
 * (quoted embedded newlines are common in multi-item cells) instead of a new
 * runtime dep. Per the Opus design review: tabs are detected by HEADER
 * SIGNATURE, never filename; Google CSVs are UTF-8 without BOM but Excel adds
 * one — strip it; NFC-normalize; NBSP → space.
 */
import { SECTION_KEYS } from '../src/data/types'
import { UI_LABEL_KEYS } from '../src/data/ui'

/** Human column headers, in order, for the `Coletivos` tab. */
export const COLETIVOS_HEADERS = ['id', 'mapa', 'nome', 'icone', ...SECTION_KEYS] as const

/** Human column headers for the `Textos do site` tab. */
export const TEXTOS_HEADERS = ['chave', 'onde aparece', 'valor'] as const

/** Section key ↔ pt-BR column header (accent-stripped lowercase on import). */
export const SECTION_HEADER_ALIASES: Record<string, string> = {
  conflitos: 'conflitos',
  acao: 'acao',
  'identificacao e territorio': 'identificacao_e_territorio',
  futuro: 'futuro',
  memoria: 'memoria',
  identidade: 'identidade',
}

export const SECTION_HEADER_PT: Record<string, string> = {
  conflitos: 'Conflitos',
  acao: 'Ação',
  identificacao_e_territorio: 'Identificação e território',
  futuro: 'Futuro',
  memoria: 'Memória',
  identidade: 'Identidade',
}

/** The one display copy of each text key: sheet key → (human "where" note, pt-BR value path). */
export interface TextosRow {
  key: string
  onde: string
  /** Value getter from the parsed ui model. */
  get: (ui: UiModel) => string | string[]
  /** Value writer into the ui model (single-value keys only; array keys are rebuilt). */
  set?: (ui: UiModel, value: string) => void
}

/** Minimal structural shape of the ui model the scripts operate on. */
export interface UiModel {
  titleLines: string[]
  about: string
  mapNames: Record<string, string>
  sectionLabels: Record<string, string>
  docTitle: string
  metaDescription: string
  labels: Record<string, string>
}

export const TEXTOS_ROWS: TextosRow[] = [
  { key: 'titulo.linha.1', onde: 'Primeira linha do título grande do mapa', get: (u) => u.titleLines[0] ?? '', set: (u, v) => { u.titleLines[0] = v } },
  { key: 'titulo.linha.2', onde: 'Segunda linha do título grande do mapa', get: (u) => u.titleLines[1] ?? '', set: (u, v) => { u.titleLines[1] = v } },
  { key: 'sobre.texto', onde: 'Texto "Sobre o projeto" do menu', get: (u) => u.about, set: (u, v) => { u.about = v } },
  { key: 'titulo.pagina', onde: 'Título da aba do navegador', get: (u) => u.docTitle, set: (u, v) => { u.docTitle = v } },
  { key: 'descricao.pagina', onde: 'Descrição do site (Google/WhatsApp)', get: (u) => u.metaDescription, set: (u, v) => { u.metaDescription = v } },
  { key: 'mapa.belem.nome', onde: 'Nome exibido do mapa de Belém', get: (u) => u.mapNames.belem ?? '', set: (u, v) => { u.mapNames.belem = v } },
  { key: 'mapa.ananindeua.nome', onde: 'Nome exibido do mapa de Ananindeua', get: (u) => u.mapNames.ananindeua ?? '', set: (u, v) => { u.mapNames.ananindeua = v } },
  { key: 'mapa.moju.nome', onde: 'Nome exibido do mapa de Moju', get: (u) => u.mapNames.moju ?? '', set: (u, v) => { u.mapNames.moju = v } },
  ...Object.entries(SECTION_HEADER_PT).map(([section, label]): TextosRow => ({
    key: `secao.${section}.titulo`,
    onde: `Título da seção "${label}" no painel do coletivo`,
    get: (u) => u.sectionLabels[section] ?? '',
    set: (u, v) => { u.sectionLabels[section] = v },
  })),
  { key: 'rotulo.zoom.mais', onde: 'Acessibilidade: botão de aproximar', get: (u) => u.labels.zoomIn ?? '', set: (u, v) => { u.labels.zoomIn = v } },
  { key: 'rotulo.zoom.menos', onde: 'Acessibilidade: botão de afastar', get: (u) => u.labels.zoomOut ?? '', set: (u, v) => { u.labels.zoomOut = v } },
  { key: 'rotulo.redefinir', onde: 'Acessibilidade: botão de redefinir a vista', get: (u) => u.labels.reset ?? '', set: (u, v) => { u.labels.reset = v } },
  { key: 'rotulo.abrir.menu', onde: 'Acessibilidade: botão que abre o menu', get: (u) => u.labels.openMenu ?? '', set: (u, v) => { u.labels.openMenu = v } },
  { key: 'rotulo.sobre', onde: 'Acessibilidade: botão "Sobre o projeto"', get: (u) => u.labels.aboutProject ?? '', set: (u, v) => { u.labels.aboutProject = v } },
  { key: 'rotulo.fechar.menu', onde: 'Acessibilidade: botão de fechar o menu', get: (u) => u.labels.closeMenu ?? '', set: (u, v) => { u.labels.closeMenu = v } },
  { key: 'rotulo.fechar.painel', onde: 'Acessibilidade: botão de fechar o painel', get: (u) => u.labels.closePanel ?? '', set: (u, v) => { u.labels.closePanel = v } },
  { key: 'rotulo.controles', onde: 'Acessibilidade: grupo de botões do mapa', get: (u) => u.labels.controlsGroup ?? '', set: (u, v) => { u.labels.controlsGroup = v } },
  { key: 'rotulo.principal', onde: 'Acessibilidade: nome da região principal', get: (u) => u.labels.main ?? '', set: (u, v) => { u.labels.main = v } },
]

/** Every Textos key (contract — the sheet must carry exactly these). */
export const TEXTOS_KEYS = TEXTOS_ROWS.map((row) => row.key)

/** Strip BOM + NFC + NBSP normalization for one raw CSV cell. */
export function cleanCell(value: string): string {
  return value.replace(/^\uFEFF/, '').normalize('NFC').replace(/\u00A0/g, ' ')
}

/**
 * RFC 4180 CSV parser: quotes, escaped quotes, embedded newlines. `raw` may
 * contain CRLF. Returns rows of cleaned cells (no trailing empty line).
 */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const text = cleanCell(raw)
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cell += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i += 1
      continue
    }
    cell += ch
    i += 1
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // drop trailing fully-empty rows (Google ends files with a final newline)
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop()
  return rows
}

/** RFC 4180 writer: quote only when needed (comma, quote, newline). */
export function toCsv(headers: readonly string[], rows: string[][]): string {
  const escape = (cell: string): string =>
    /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) lines.push(row.map(escape).join(','))
  return `${lines.join('\r\n')}\r\n`
}

/** Lowercase + accent-strip + underscore→space, for header alias matching. */
export function foldHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_]+/g, ' ')
}

/** Assert no existing item contains a newline — it would split on round-trip. */
export function assertNoNewlineItems(items: Iterable<string>, origin: string): void {
  for (const item of items) {
    if (/[\n\r]/.test(item)) {
      throw new Error(
        `"${item.slice(0, 60)}" (${origin}) contém uma quebra de linha — ela seria ` +
          `dividida em dois itens na planilha. Remova a quebra antes de exportar.`,
      )
    }
  }
}

/** Reject Google/Excel formula-error tokens that leaked into a cell. */
export function isFormulaError(cell: string): boolean {
  return /^#(REF|NAME|ERROR|VALUE|DIV\/0|N\/A)/i.test(cell.trim())
}

/** Split one multi-item cell into trimmed, non-empty items. */
export function splitItems(cell: string): string[] {
  return cell
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export { SECTION_KEYS, UI_LABEL_KEYS }
