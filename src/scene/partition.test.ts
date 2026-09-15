// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { processSvg } from './pipeline.build'
import { assertBaseCounts, partitionBase, type BaseLayers } from './partition'

const readAsset = (name: string): string =>
  readFileSync(resolve(process.cwd(), `na cuia/icons/svg/${name}.svg`), 'utf8')

const processedMapaCru = (): string => processSvg(readAsset('mapa cru'), 'mc')

describe('partitionBase', () => {
  it('splits mapa cru into the SPEC §2 layers, preserving document order', () => {
    const layers = partitionBase(processedMapaCru())
    expect([
      layers.water.length,
      layers.land.length,
      layers.roads.length,
      layers.waterDetail.length,
    ]).toEqual([1, 42, 5, 20])
    // source paint order: land sits below the road marks painted after it
    expect(
      layers.land[0].compareDocumentPosition(layers.roads[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('throws on a <g> wrapper — reparenting would drop ancestor transforms', () => {
    const wrapped =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><path fill="#5da9a9" d="M0 0"/></g></svg>'
    expect(() => partitionBase(wrapped)).toThrow(/not flat: <g>/)
  })

  it('throws on a painted node carrying a transform attribute', () => {
    const shifted =
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#5da9a9" ' +
      'transform="translate(1 2)" d="M0 0"/></svg>'
    expect(() => partitionBase(shifted)).toThrow(/not flat: <path> carries a transform/)
  })
})

describe('assertBaseCounts', () => {
  it('passes on the real mapa cru partition', () => {
    expect(() => assertBaseCounts(partitionBase(processedMapaCru()))).not.toThrow()
  })

  it('throws on a shorted partition, listing actual vs expected counts', () => {
    const shorted: BaseLayers = partitionBase(processedMapaCru())
    shorted.land.pop()
    expect(() => assertBaseCounts(shorted)).toThrow(/42/)
  })
})
