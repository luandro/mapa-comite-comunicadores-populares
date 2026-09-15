import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { processSvg } from './pipeline.build'

const readAsset = (name: string): string =>
  readFileSync(resolve(process.cwd(), `na cuia/icons/svg/${name}.svg`), 'utf8')

describe('processSvg', () => {
  it('strips the stylesheet and every class attribute from mapa cru', () => {
    const processed = processSvg(readAsset('mapa cru'), 'mc')
    expect(processed).not.toContain('<style')
    expect(processed).not.toContain('class=')
  })

  it('resolves every declared property, not just fill (onda band opacities)', () => {
    expect(processSvg(readAsset('onda 2'), 'onda2')).toContain('opacity="0.8"')
    expect(processSvg(readAsset('onda 4'), 'onda4')).toContain('opacity="0.2"')
  })

  it('resolves all class declarations onto the node and prefixes its id', () => {
    const synthetic =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:#123456;opacity:.5}</style>' +
      '<path id="p1" class="a"/></svg>'
    const processed = processSvg(synthetic, 't')
    expect(processed).toContain('fill="#123456"')
    expect(Number(/opacity="([^"]*)"/.exec(processed)?.[1])).toBe(0.5)
    expect(/id="([^"]*)"/.exec(processed)?.[1]?.startsWith('t')).toBe(true)
  })

  it('lets the stylesheet overwrite a conflicting presentation attribute', () => {
    const synthetic =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:#123456}</style>' +
      '<path class="a" fill="#000000"/></svg>'
    const processed = processSvg(synthetic, 't')
    expect(processed).toContain('fill="#123456"')
    expect(processed).not.toContain('#000000')
  })

  it('throws on a rule with declarations but no class selector (SPEC §2 fail-loud)', () => {
    const synthetic =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>#hero{fill:#123456}</style>' +
      '<path id="hero"/></svg>'
    expect(() => processSvg(synthetic, 't')).toThrow(/unsupported selector "#hero"/)
  })
})
