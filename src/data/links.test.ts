import { describe, expect, it } from 'vitest'
import { normalizeHttpUrl, normalizeUrlList, parseUrlCell } from './links'

describe('normalizeHttpUrl', () => {
  it('accepts absolute http(s) URLs and preserves query/fragment', () => {
    expect(normalizeHttpUrl('https://www.instagram.com/p/DcO1n0SlNZX/?img_index=1')).toBe(
      'https://www.instagram.com/p/DcO1n0SlNZX/?img_index=1',
    )
    expect(normalizeHttpUrl('http://example.com/a?b=1#c')).toBe('http://example.com/a?b=1#c')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeHttpUrl('  https://nacuia.org/pt_br/x/  ')).toBe('https://nacuia.org/pt_br/x/')
  })

  it('percent-encodes a literal pipe so export/import round-trips losslessly', () => {
    expect(normalizeHttpUrl('https://example.com/a|b')).toBe('https://example.com/a%7Cb')
  })

  it('rejects non-http schemes, bare domains and credentials', () => {
    expect(normalizeHttpUrl('ftp://example.com/file')).toBeNull()
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeHttpUrl('instagram.com/redecasacura')).toBeNull()
    expect(normalizeHttpUrl('https://user:pass@example.com/')).toBeNull()
    expect(normalizeHttpUrl('https://exa mple.com/')).toBeNull()
    expect(normalizeHttpUrl('')).toBeNull()
  })
})

describe('normalizeUrlList (export boundary)', () => {
  it('canonicalizes stored links so export cells round-trip', () => {
    expect(normalizeUrlList(['https://example.com/a|b', 'https://nacuia.org/x/'])).toEqual([
      'https://example.com/a%7Cb',
      'https://nacuia.org/x/',
    ])
  })

  it('refuses to serialize an invalid stored URL', () => {
    expect(() => normalizeUrlList(['not-a-url'])).toThrow('Invalid URL')
  })
})

describe('parseUrlCell', () => {
  it('splits on pipes and newlines, trimming blanks', () => {
    const { urls, invalid } = parseUrlCell(
      'https://a.example/x | https://b.example/y\n\nhttps://c.example/z',
    )
    expect(urls).toEqual(['https://a.example/x', 'https://b.example/y', 'https://c.example/z'])
    expect(invalid).toEqual([])
  })

  it('dedupes normalized URLs preserving order', () => {
    const { urls } = parseUrlCell('https://a.example/x | https://a.example/x')
    expect(urls).toEqual(['https://a.example/x'])
  })

  it('reports invalid tokens without dropping the valid ones', () => {
    const { urls, invalid } = parseUrlCell('https://a.example/x | not-a-url')
    expect(urls).toEqual(['https://a.example/x'])
    expect(invalid).toEqual(['not-a-url'])
  })

  it('returns empty lists for a blank cell', () => {
    expect(parseUrlCell('   ')).toEqual({ urls: [], invalid: [] })
  })
})
