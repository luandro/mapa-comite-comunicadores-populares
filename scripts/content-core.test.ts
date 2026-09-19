import { describe, expect, it } from 'vitest'
import {
  COLETIVOS_HEADERS,
  SECTION_HEADER_PT,
  TEXTOS_HEADERS,
  TEXTOS_KEYS,
  assertNoNewlineItems,
  cleanCell,
  foldHeader,
  isFormulaError,
  parseCsv,
  splitItems,
  toCsv,
} from './content-core'

describe('parseCsv (RFC 4180)', () => {
  it('parses quoted cells with embedded newlines and commas', () => {
    const rows = parseCsv('a,b\n"line1\nline2","has, comma",plain')
    expect(rows).toEqual([['a', 'b'], ['line1\nline2', 'has, comma', 'plain']])
  })

  it('parses escaped quotes and strips BOM', () => {
    const rows = parseCsv('\uFEFF"say ""hi""",x')
    expect(rows).toEqual([['say "hi"', 'x']])
  })

  it('normalizes NBSP and drops trailing empty rows (Google final newline)', () => {
    const rows = parseCsv('a\u00A0b\n1,2\n')
    expect(rows[0][0]).toBe('a b')
    expect(rows).toHaveLength(2)
  })
})

describe('toCsv ↔ parseCsv round-trip', () => {
  it('survives every nasty cell', () => {
    const csv = toCsv(['h1', 'h2'], [
      ['plain', 'with, comma'],
      ['with "quotes"', 'multi\nline'],
      ['acentos çãé', ''],
    ])
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual(['h1', 'h2'])
    expect(rows[1]).toEqual(['plain', 'with, comma'])
    expect(rows[2]).toEqual(['with "quotes"', 'multi\nline'])
    expect(rows[3]).toEqual(['acentos çãé', ''])
  })

  it('produces the canonical header signatures', () => {
    expect(toCsv(COLETIVOS_HEADERS, []).split('\r\n')[0]).toBe(
      'id,mapa,nome,icone,conflitos,acao,identificacao_e_territorio,futuro,memoria,identidade',
    )
    expect(toCsv(TEXTOS_HEADERS, []).split('\r\n')[0]).toBe('chave,onde aparece,valor')
  })
})

describe('header folding', () => {
  it('matches accented pt-BR headers', () => {
    expect(foldHeader('Identificação e território')).toBe('identificacao e territorio')
    expect(foldHeader('Ação')).toBe('acao')
    expect(SECTION_HEADER_PT.identificacao_e_territorio).toBe('Identificação e território')
  })
})

describe('cell hygiene', () => {
  it('flags formula errors', () => {
    expect(isFormulaError('#REF!')).toBe(true)
    expect(isFormulaError('#value!')).toBe(true)
    expect(isFormulaError('#hashtag não é erro')).toBe(false)
  })

  it('splits multi-item cells trimming blanks', () => {
    expect(splitItems('um\n\ndois\n  três  \n')).toEqual(['um', 'dois', 'três'])
  })

  it('assertNoNewlineItems blocks round-trip breakers', () => {
    expect(() => assertNoNewlineItems(['ok', 'quebra\nlinha'], 'x')).toThrow(/quebra de linha/)
    expect(() => assertNoNewlineItems(['ok'], 'x')).not.toThrow()
  })
})

describe('textos contract', () => {
  it('has a unique, non-empty key set', () => {
    expect(new Set(TEXTOS_KEYS).size).toBe(TEXTOS_KEYS.length)
    for (const key of TEXTOS_KEYS) expect(key.length).toBeGreaterThan(0)
  })
})

describe('cleanCell', () => {
  it('strips BOM and NFC-normalizes', () => {
    const decomposed = 'e\u0301' // é as e + combining acute
    expect(cleanCell(decomposed)).toBe('é')
  })

  it('normalizes CRLF inside quoted cells (Opus post-merge P2)', () => {
    const rows = parseCsv('"para1\r\npara2",x')
    expect(rows[0][0]).toBe('para1\npara2')
  })
})

describe('blank line inside a quoted cell (Opus gate blocker)', () => {
  it('survives a raw-text blank-line split — the regression that wiped sections', () => {
    // An editor pressing Alt+Enter twice inside a cell produces \n\n INSIDE
    // the quoted cell. Parsing must keep it as one cell (partitioning happens
    // on the row array, never on raw text).
    const csv = 'id,mapa,nome,icone,conflitos\r\norg_x,belem,ORG X,icone-1,"a\n\nb"\r\n'
    const rows = parseCsv(csv)
    expect(rows[1][4]).toBe('a\n\nb')
    expect(splitItems(rows[1][4])).toEqual(['a', 'b'])
  })
})
