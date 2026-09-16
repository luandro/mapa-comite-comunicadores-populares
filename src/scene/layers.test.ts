// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import rawData from '../../data.json'
import { validateComiteData } from '../data/schema'
import type { ComiteData } from '../data/types'
import { renderLabels, updateLabels } from './labels'
import { ARTIFACT_BOB_STEP, mountCalibratedLayers, orgProjects, rSceneFor } from './layers'
import type { Camera } from './types'

const realData: ComiteData = validateComiteData(rawData)

const SVG_NS = 'http://www.w3.org/2000/svg'
const cameraStub = {} as Camera

let host: SVGSVGElement

beforeEach(() => {
  host = document.createElementNS(SVG_NS, 'svg')
  document.body.appendChild(host)
})

afterEach(() => {
  host.remove()
  vi.restoreAllMocks()
})

function mountLayers(data: ComiteData = realData) {
  const cameraNode = document.createElementNS(SVG_NS, 'g')
  const waterDetail = document.createElementNS(SVG_NS, 'g')
  waterDetail.id = 'layer-water-detail'
  cameraNode.appendChild(waterDetail)
  host.appendChild(cameraNode)
  const layers = mountCalibratedLayers(cameraNode, data, cameraStub)
  return { cameraNode, layers }
}

describe('mountCalibratedLayers', () => {
  it('builds every layer group in SPEC §4 order above layer-water-detail', () => {
    const { cameraNode } = mountLayers()
    expect(Array.from(cameraNode.children).map((child) => child.id)).toEqual([
      'layer-water-detail',
      'layer-waves',
      'layer-squiggles',
      'layer-city-belem',
      'layer-city-ananindeua',
      'layer-city-moju',
      'layer-artifacts',
      'layer-arrows',
    ])
  })

  it('mounts three [A][A′][A] copies per band with the mirror-chain transforms', () => {
    const { layers } = mountLayers()
    const bands = layers.waves.querySelectorAll(':scope > g[data-band]')
    expect(bands).toHaveLength(3)
    for (const band of bands) {
      const placement = band as SVGGElement
      // translate + composed scale (row scale × 1.3994); exact rows are
      // calibration data and deliberately not pinned here
      expect(placement.getAttribute('transform')).toMatch(
        /^translate\(-?[\d.]+,-?[\d.]+\) scale\([\d.]+\)$/,
      )
      const ambient = placement.firstElementChild as SVGGElement
      expect(ambient.tagName).toBe('g')
      expect(ambient.getAttribute('transform')).toBeNull() // Phase 2 owns it
      const children = Array.from(ambient.children)
      const mirrored = children[children.length - 2]
      const trailing = children[children.length - 1]
      expect(mirrored.getAttribute('transform')).toBe('translate(4320.64,0) scale(-1,1)')
      expect(trailing.getAttribute('transform')).toBe('translate(4320.64,0)')
      const copyA = children.slice(0, -2)
      expect(copyA.length).toBeGreaterThan(0)
      expect(mirrored.children.length).toBe(copyA.length)
      expect(trailing.children.length).toBe(copyA.length)
    }
  })

  it('preserves the source band opacities as attributes (onda2 .8, onda4 .2)', () => {
    const { layers } = mountLayers()
    const opacityOf = (band: string) =>
      layers.waves.querySelector(`g[data-band="${band}"] > g`)!.getAttribute('opacity')
    expect(opacityOf('onda1')).toBeNull()
    expect(opacityOf('onda2')).toBe('0.8')
    expect(opacityOf('onda4')).toBe('0.2')
  })

  it('nests every city as placement → interaction → ambient (one transform owner)', () => {
    const { layers } = mountLayers()
    for (const id of ['belem', 'ananindeua', 'moju']) {
      const interaction = layers.cities[id]
      const layer = interaction.closest(`#layer-city-${id}`)
      expect(layer).not.toBeNull()
      const placement = layer!.firstElementChild as SVGGElement
      expect(placement.getAttribute('transform')).toMatch(/^translate\(/)
      expect(placement.children).toHaveLength(1)
      expect(interaction.getAttribute('transform')).toBeNull()
      expect(interaction.getAttribute('data-interactive')).toBe('city')
      expect(interaction.getAttribute('data-city-id')).toBe(id)
      // Phase 4 (SPEC §9): real button semantics — focusable, labeled from
      // data.json, starts at rest.
      const labels: Record<string, string> = {
        belem: 'Belém',
        ananindeua: 'Ananindeua',
        moju: 'Moju',
      }
      expect(interaction.getAttribute('tabindex')).toBe('0')
      expect(interaction.getAttribute('role')).toBe('button')
      expect(interaction.getAttribute('aria-label')).toBe(labels[id])
      expect(interaction.getAttribute('aria-pressed')).toBe('false')
      expect(interaction.children).toHaveLength(1)
      const ambient = interaction.firstElementChild as SVGGElement
      expect(ambient.getAttribute('transform')).toBeNull()
      expect(ambient.children.length).toBeGreaterThan(0)
    }
  })

  it('mounts one artifact per org with pos, nested placement → interaction → ambient', () => {
    const { cameraNode, layers } = mountLayers()
    expect(Object.keys(layers.artifacts)).toHaveLength(11)
    expect(cameraNode.querySelectorAll('#layer-artifacts > g')).toHaveLength(11)
    for (const [orgId, interaction] of Object.entries(layers.artifacts)) {
      const placement = interaction.parentElement!
      expect(placement.getAttribute('transform')).toMatch(
        /^translate\(-?[\d.]+,-?[\d.]+\) scale\([\d.]+\)$/,
      )
      expect(interaction.getAttribute('transform')).toBeNull()
      expect(interaction.getAttribute('data-interactive')).toBe('artifact')
      expect(interaction.getAttribute('data-artifact-id')).toBe(orgId)
      const ambient = interaction.firstElementChild as SVGGElement
      expect(ambient.getAttribute('transform')).toBeNull()
      expect(ambient.children.length).toBeGreaterThan(0)
    }
  })

  it('mounts one invisible hit circle per artifact with data-interactive routing', () => {
    const { cameraNode, layers } = mountLayers()
    expect(Object.keys(layers.hitCircles)).toHaveLength(11)
    for (const [orgId, circle] of Object.entries(layers.hitCircles)) {
      expect(circle.getAttribute('data-interactive')).toBe('artifact')
      expect(circle.getAttribute('data-artifact-id')).toBe(orgId)
      expect(circle.getAttribute('fill')).toBe('transparent') // invisible tap target
      expect(Number(circle.getAttribute('r'))).toBeGreaterThan(0)
    }
    // circles live in the artifacts layer, one per artifact group
    expect(cameraNode.querySelectorAll('#layer-artifacts circle[data-artifact-id]')).toHaveLength(
      11,
    )
  })

  it('rSceneFor: 12 CSS px floor, 40 ceiling, grows as zoom-out shrinks u', () => {
    // u = measureA × k ≥ 1 → raw 12/u ≤ 12 → floor 12 dominates
    expect(rSceneFor(1, 1)).toBe(12)
    expect(rSceneFor(4, 1)).toBe(12)
    expect(rSceneFor(1, 2)).toBe(12)
    // zoomed out (u < 1): raw exceeds the floor, still under the ceiling
    expect(rSceneFor(0.5, 1)).toBe(24)
    // extreme zoom-out: ceiling clamp keeps neighbors tappable
    expect(rSceneFor(1, 0.2)).toBe(40)
  })

  it('bob: ambient g gets .artifact-bob with stepped negative animation-delay', () => {
    const { layers } = mountLayers()
    const ids = Object.keys(layers.artifacts)
    ids.forEach((orgId, i) => {
      const ambient = layers.artifacts[orgId].firstElementChild as SVGGElement
      expect(ambient.classList.contains('artifact-bob')).toBe(true)
      expect(ambient.getAttribute('transform')).toBeNull() // no second transform owner
      const expected = -i * ARTIFACT_BOB_STEP
      expect(ambient.style.animationDelay).toBe(
        `${expected === 0 ? '' : '-'}${Math.abs(expected)}s`,
      )
    })
  })

  it('places each totem with pos as its BASE point at ≈190 scene units tall', () => {
    const { layers } = mountLayers()
    // icone-6 viewBox ground truth: 337.23 × 618.08 (SPEC §1)
    const scale = 190 / 618.08
    const placement = layers.artifacts.na_cuia.parentElement! // pos from data.json
    const pos = realData.maps.belem.projects.na_cuia.pos!
    const match = placement
      .getAttribute('transform')!
      .match(/^translate\((-?[\d.]+),(-?[\d.]+)\) scale\([\d.]+\)$/)!
    expect(Number(match[1])).toBeCloseTo(pos.x - (337.23 * scale) / 2, 2)
    expect(Number(match[2])).toBeCloseTo(pos.y - 190, 1)
  })

  it('defaults an unknown icon to icone-6 with a console warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const data = structuredClone(realData)
    // Set directly: the schema canonicalizes unknown ids at load, this exercises
    // the layer-level defense (data assembled by any other path).
    data.maps.belem.projects.na_cuia.icon = 'icone-99'
    const { layers } = mountLayers(data)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('icone-99'))
    const defaultContent = layers.artifacts.chibe.firstElementChild!.innerHTML
    expect(layers.artifacts.na_cuia.firstElementChild!.innerHTML).toBe(defaultContent)
  })

  it('renders no artifact and no arrows for orgs without pos', () => {
    const data = structuredClone(realData)
    delete data.maps.belem.projects.na_cuia.pos
    const { cameraNode, layers } = mountLayers(data)
    expect(layers.artifacts.na_cuia).toBeUndefined()
    expect(cameraNode.querySelectorAll('#layer-artifacts > g')).toHaveLength(10)
    expect(cameraNode.querySelector('[data-artifact-id="na_cuia"]')).toBeNull()
    expect(cameraNode.querySelectorAll('#layer-arrows > path')).toHaveLength(10)
  })

  it('authors one Bézier per from point, stroke poster cream, no source dots', () => {
    const { cameraNode } = mountLayers()
    const layer = cameraNode.querySelector('#layer-arrows')!
    const paths = layer.querySelectorAll(':scope > path')
    const dots = layer.querySelectorAll(':scope > circle')
    expect(paths).toHaveLength(11) // one per org; each ships exactly one from point
    expect(dots).toHaveLength(0) // mock has no source dots (SPEC §3, v1.0.1)
    for (const path of paths) {
      expect(path.getAttribute('stroke')).toBe('#EDE5CE')
      expect(path.getAttribute('fill')).toBe('none')
      expect(path.getAttribute('stroke-width')).toBe('6')
      expect(path.getAttribute('marker-end')).toBe('url(#arrowhead)')
      expect(path.getAttribute('d')).toMatch(/^M-?[\d.]+,-?[\d.]+ Q-?[\d.]+,-?[\d.]+ /)
    }
    const marker = layer.querySelector('defs marker#arrowhead')!
    expect(marker.querySelector('path')!.getAttribute('fill')).toBe('#EDE5CE')
  })

  it('draws one arrow per from point for multi-source orgs', () => {
    const data = structuredClone(realData)
    data.maps.belem.projects.fogo_no_rabo.pos!.from = [
      { x: 1200, y: 1600 },
      { x: 1400, y: 1700 },
    ]
    const { cameraNode } = mountLayers(data)
    const layer = cameraNode.querySelector('#layer-arrows')!
    expect(layer.querySelectorAll(':scope > path')).toHaveLength(12)
    expect(layer.querySelectorAll(':scope > circle')).toHaveLength(0)
  })
})

describe('labels', () => {
  it('renders poster org labels below totems + city labels through the full transform', () => {
    const el = document.createElement('div')
    const anchors: Record<string, { x: number; y: number }> = {}
    for (const [orgId, project] of orgProjects(realData)) {
      if (project.pos) anchors[orgId] = { x: project.pos.x, y: project.pos.y }
    }
    renderLabels(el, realData, anchors)
    expect(el.querySelectorAll('.label-pill')).toHaveLength(11)
    expect(el.querySelectorAll('.label-city')).toHaveLength(3)
    const firstLabel = el.querySelector<HTMLElement>('.label-pill')!
    expect(firstLabel.textContent).toBe('REDE CASACURA (Comunidade do Açaizal / Jaderlândia)')
    expect(firstLabel.style.transform).toContain('translate(-50%, 0%)')
    expect(firstLabel.style.transform).toContain('8px')
    expect(
      Array.from(el.querySelectorAll<HTMLElement>('.label-city'), (label) => label.textContent),
    ).toEqual(['Ananindeua', 'Belém', 'Moju'])

    // sx = 1.5·pos.x + 100; sy = 1.5·pos.y + 50 (pos from data.json)
    const pos = realData.maps.belem.projects.na_cuia.pos!
    const ctm = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 } as DOMMatrix
    updateLabels(el, { x: 100, y: 50, k: 1.5 }, ctm)
    const anchor = el.querySelector<HTMLDivElement>('[data-label-id="na_cuia"]')!
    const sx = 1.5 * pos.x + 100
    const sy = 1.5 * pos.y + 50
    // px = 2·sx + 10;  py = 2·sy + 20
    expect(anchor.style.transform).toBe(`translate(${2 * sx + 10}px, ${2 * sy + 20}px)`)
  })
})
