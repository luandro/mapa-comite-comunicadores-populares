/**
 * Shared link validation for sheet-sourced URLs (`socialLinks`,
 * `lifeStories`). Used by BOTH the content importer and the schema validator
 * so a URL that imports can never fail validation later (and vice versa).
 * Rules (dual-review plan): absolute http(s) only, a real hostname, no
 * embedded credentials, no whitespace/control characters; paths, query
 * params and fragments are preserved verbatim.
 */
export function normalizeHttpUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  // Cheap pre-check keeps new URL() from accepting things like "http:foo".
  if (!/^https?:\/\//i.test(trimmed)) return null
  if (/\s/.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname.includes('.')) return null
  if (url.username || url.password) return null
  // v1.12 (Sol review P2): `|` is the sheet's multi-URL separator. A raw
  // pipe inside a URL would silently split on export→import, so canonicalize
  // it to its percent-encoding — round-trips are then lossless.
  return url.href.replace(/\|/g, '%7C')
}

/** Canonicalize a stored URL list for serialization. Throws on an invalid
 * entry — export must never write a cell the importer would reject. */
export function normalizeUrlList(urls: string[]): string[] {
  return urls.map((url) => {
    const normalized = normalizeHttpUrl(url)
    if (normalized === null) {
      throw new Error(`Invalid URL in content (expected absolute http(s)): "${url}"`)
    }
    return normalized
  })
}

/** Split a sheet cell holding one-or-more pipe/newline separated URLs.
 * Returns the normalized list plus the raw tokens that failed validation. */
export function parseUrlCell(raw: string): { urls: string[]; invalid: string[] } {
  const tokens = raw
    .split(/[|\n]/)
    .map((token) => token.trim())
    .filter(Boolean)
  const urls: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    const normalized = normalizeHttpUrl(token)
    if (normalized === null) {
      invalid.push(token)
    } else if (!seen.has(normalized)) {
      seen.add(normalized)
      urls.push(normalized)
    }
  }
  return { urls, invalid }
}
