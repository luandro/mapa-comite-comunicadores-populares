// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import rawData from '../../data.json'
import { validateComiteData } from '../data/schema'
import type { ComiteData } from '../data/types'
import {
  pillTapPlan,
  renderLabels,
  resolveEdgeClamp,
  pillAnchorSlack,
  resolveLabelPush,
  updateLabels,
} from './labels'
import {
  arrowEndPoint,
  ARTIFACT_BOB_STEP,
  ARROWHEAD_SCENE,
  ARROW_TIP_CLEARANCE,
  mountCalibratedLayers,
  orgIdsForCity,
  orgProjects,
  PILL_BAND_SCENE,
  rSceneFor,
  TOTEM_HEIGHT,
  TOTEM_WIDTH,
} from './layers'
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
      'layer-squiggles',
      'layer-city-belem',
      'layer-city-ananindeua',
      'layer-city-moju',
      'layer-artifacts',
      'layer-arrows',
    ])
  })

  it('mounts no wave bands (v1.1 — the big water animation is removed)', () => {
    const { cameraNode } = mountLayers()
    expect(cameraNode.querySelector('#layer-waves')).toBeNull()
    expect(cameraNode.querySelector('[data-band]')).toBeNull()
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

  it('authors one Bézier per from point, stroke poster cream, tail dot on each hub', () => {
    const { cameraNode } = mountLayers()
    const layer = cameraNode.querySelector('#layer-arrows')!
    const paths = layer.querySelectorAll(':scope > path')
    const dots = layer.querySelectorAll(':scope > circle')
    expect(paths).toHaveLength(11) // one per org; each ships exactly one from point
    expect(dots).toHaveLength(11) // poster tail dot on each from point (user QA 2026-09-16)
    for (const path of paths) {
      expect(path.getAttribute('stroke')).toBe('#EDE5CE')
      expect(path.getAttribute('fill')).toBe('none')
      expect(path.getAttribute('stroke-width')).toBe('6')
      expect(path.getAttribute('marker-end')).toBe('url(#arrowhead)')
      expect(path.getAttribute('d')).toMatch(/^M-?[\d.]+,-?[\d.]+ Q-?[\d.]+,-?[\d.]+ /)
    }
    for (const dot of dots) {
      expect(dot.getAttribute('fill')).toBe('#EDE5CE')
      expect(Number(dot.getAttribute('r'))).toBeGreaterThan(0)
    }
    const marker = layer.querySelector('defs marker#arrowhead')!
    expect(marker.querySelector('path')!.getAttribute('fill')).toBe('#EDE5CE')
  })

  it('arrowhead tip stops outside the totem art box — head never touches the art', () => {
    const { cameraNode } = mountLayers()
    const layer = cameraNode.querySelector('#layer-arrows')!
    for (const [orgId, project] of orgProjects(realData)) {
      const pos = project.pos!
      for (const from of pos.from) {
        const end = arrowEndPoint(from, { x: pos.x, y: pos.y })
        // The TIP (end + one head length along the from→base direction) must
        // clear the art box (TOTEM_WIDTH × TOTEM_HEIGHT, bottom-center at pos)
        // by ARROW_TIP_CLEARANCE: shrink the box by that margin and assert the
        // tip is outside it. Direction-agnostic — side approaches included.
        const len = Math.hypot(pos.x - from.x, pos.y - from.y)
        const ux = (pos.x - from.x) / len
        const uy = (pos.y - from.y) / len
        const tip = { x: end.x + ux * ARROWHEAD_SCENE, y: end.y + uy * ARROWHEAD_SCENE }
        // Clear the ART box (shrunk by the clearance)…
        const inBoxX = Math.abs(tip.x - pos.x) < TOTEM_WIDTH / 2 - ARROW_TIP_CLEARANCE
        const inBoxY = tip.y > pos.y - TOTEM_HEIGHT + ARROW_TIP_CLEARANCE && tip.y < pos.y
        // …and the TITLE-PILL band hanging below the base (heads behind the
        // title are exactly the bug — user QA round 3).
        const halfBand = PILL_BAND_SCENE / 2
        const inBandX = Math.abs(tip.x - pos.x) < halfBand
        const inBandY = tip.y > pos.y && tip.y < pos.y + PILL_BAND_SCENE
        expect(`${orgId} art=${inBoxX && inBoxY} pill=${inBandX && inBandY}`).toBe(
          `${orgId} art=false pill=false`,
        )
      }
    }
    const layerPaths = layer.querySelectorAll(':scope > path')
    expect(layerPaths.length).toBeGreaterThan(0)
  })

  it('arrowEndPoint: axis-aligned rays stay finite and clear the rects', () => {
    // Exactly vertical approach from below: crosses the pill band's bottom
    // face (review round 1 — Infinity-on-zero-direction poisoning).
    const base = { x: 1500, y: 1000 }
    const end = arrowEndPoint({ x: 1500, y: 1700 }, base)
    const len = Math.hypot(base.x - 1500, base.y - 1700)
    const uy = (base.y - 1700) / len
    const tipY = end.y + uy * ARROWHEAD_SCENE
    // Ray from below: the band face sits at base.y + band depth; the tip stops
    // ARROW_TIP_CLEARANCE OUTSIDE it (below the face).
    expect(Number.isFinite(tipY)).toBe(true)
    expect(tipY).toBeGreaterThan(base.y)
    expect(tipY).toBeCloseTo(base.y + 260 + ARROW_TIP_CLEARANCE, 5)
  })

  it('draws one arrow + one tail dot per from point for multi-source orgs', () => {
    const data = structuredClone(realData)
    data.maps.belem.projects.fogo_no_rabo.pos!.from = [
      { x: 1200, y: 1600 },
      { x: 1400, y: 1700 },
    ]
    const { cameraNode } = mountLayers(data)
    const layer = cameraNode.querySelector('#layer-arrows')!
    expect(layer.querySelectorAll(':scope > path')).toHaveLength(12)
    expect(layer.querySelectorAll(':scope > circle')).toHaveLength(12)
  })
})

describe('orgIdsForCity (issue #12 city→org mapping)', () => {
  it('maps each city to exactly its own projects, in data order', () => {
    for (const [cityId, city] of Object.entries(realData.maps)) {
      expect(orgIdsForCity(realData, cityId)).toEqual(Object.keys(city.projects))
    }
    // spot-check the real data: belem's first org is the first data.json key
    expect(orgIdsForCity(realData, 'belem')[0]).toBe('museu_memorial_vila_da_barca')
    expect(orgIdsForCity(realData, 'ananindeua')).toEqual([
      'rede_casacura',
      'rede_afroamazonida',
      'centro_educacao_popular',
      'chibe',
    ])
  })

  it('keeps the mapping disjoint across cities (org ids are unique)', () => {
    const all = Object.keys(realData.maps).flatMap((cityId) => orgIdsForCity(realData, cityId))
    expect(new Set(all).size).toBe(all.length)
  })

  it('empty-projects city (moju) and unknown city both map to an empty list', () => {
    expect(realData.maps.moju.projects).toEqual({})
    expect(orgIdsForCity(realData, 'moju')).toEqual([])
    expect(orgIdsForCity(realData, 'cidade-que-nao-existe')).toEqual([])
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

  it('pills carry data-label-for for tap routing; city labels never do (issue #13)', () => {
    const el = document.createElement('div')
    const anchors: Record<string, { x: number; y: number }> = {}
    for (const [orgId, project] of orgProjects(realData)) {
      if (project.pos) anchors[orgId] = { x: project.pos.x, y: project.pos.y }
    }
    renderLabels(el, realData, anchors)
    const pills = Array.from(el.querySelectorAll<HTMLElement>('.label-pill'))
    expect(pills).toHaveLength(11)
    for (const pill of pills) {
      // every pill names a real org with a mounted artifact (mount.ts routes
      // [data-label-for] → applyArtifactState, gated on calibrated.artifacts)
      expect(pill.dataset.labelFor).toBeTruthy()
      expect(anchors[pill.dataset.labelFor!]).toBeDefined()
    }
    // the attribute lives on the INNER pill only — never the .label anchor
    // and never the city labels (both stay pointer-events:none)
    expect(el.querySelector('.label')!.hasAttribute('data-label-for')).toBe(false)
    expect(el.querySelector('.label-city')!.hasAttribute('data-label-for')).toBe(false)
  })

  it('pillTapPlan: pills never toggle — already-selected still opens the modal (issue #13)', () => {
    // no pill in the target chain, or a pill whose org has no mounted
    // artifact → no action (mirrors onSceneClick's membership gate)
    expect(pillTapPlan(null, 'na_cuia', false)).toBeNull()
    expect(pillTapPlan('ghost', null, false)).toBeNull()
    // fresh select (from none or from another org): applyArtifactState's
    // state CHANGE carries the artifact-tap emit — no direct emit needed
    expect(pillTapPlan('na_cuia', null, true)).toEqual({ orgId: 'na_cuia', emitDirect: false })
    expect(pillTapPlan('na_cuia', 'chibe', true)).toEqual({ orgId: 'na_cuia', emitDirect: false })
    // already selected: applyArtifactState would only pulse (no re-emit,
    // opus P2) — the direct emit is what (re)opens the modal
    expect(pillTapPlan('na_cuia', 'na_cuia', true)).toEqual({ orgId: 'na_cuia', emitDirect: true })
  })

  it('resolveLabelPush: passes non-overlapping boxes through untouched', () => {
    const pushes = resolveLabelPush([
      { id: 'a', x: 0, y: 0, w: 100, h: 30 },
      { id: 'b', x: 200, y: 5, w: 100, h: 30 },
      { id: 'c', x: 50, y: 100, w: 100, h: 30 },
    ])
    expect(pushes.size).toBe(0)
  })

  it('resolveLabelPush: pushes a colliding box straight down until clear', () => {
    // 'b' starts 10px lower but fully inside a's column → must clear a's
    // bottom + gap; 'c' (x 20..150) overlaps BOTH a (0..130) and b (10..140) —
    // its dy clears b's pushed position, which already sits below a.
    const pushes = resolveLabelPush([
      { id: 'a', x: 0, y: 0, w: 130, h: 80 },
      { id: 'b', x: 10, y: 10, w: 130, h: 20 },
      { id: 'c', x: 20, y: 20, w: 130, h: 20 },
    ])
    expect(pushes.get('b')).toBe(80 + 4 - 10)
    expect(pushes.get('c')).toBe(10 + (80 + 4 - 10) + 20 + 4 - 20)
    expect(pushes.get('a')).toBeUndefined()
  })

  it('resolveLabelPush: side-by-side boxes (no x overlap) never push', () => {
    const pushes = resolveLabelPush([
      { id: 'a', x: 0, y: 0, w: 130, h: 56 },
      { id: 'b', x: 131, y: 0, w: 130, h: 56 },
    ])
    expect(pushes.size).toBe(0)
  })

  it('resolveEdgeClamp: a rect hanging below vh is pushed up into view', () => {
    // QUILOMBO case: box top at 897 on a 900px viewport (h 30) — clamped so
    // its bottom sits at vh - 8, even though the push goes negative (over
    // its own totem): legibility wins.
    const pushes = resolveEdgeClamp(
      [{ id: 'quilombo', x: 700, y: 897, w: 130, h: 30 }],
      1600,
      900,
      new Map(),
    )
    expect(pushes.get('quilombo')).toBe(900 - 8 - 30 - 897)
  })

  it('resolveEdgeClamp: a rect already inside the viewport is untouched', () => {
    const prior = new Map([['a', 12]])
    const pushes = resolveEdgeClamp([{ id: 'a', x: 100, y: 300, w: 130, h: 30 }], 1600, 900, prior)
    expect(pushes).toEqual(prior)
    expect(pushes.get('a')).toBe(12)
  })

  it('resolveEdgeClamp: an anchor above the fold is pulled down to the margin', () => {
    // Anchor at y −28 (within the ±PILL_ANCHOR_SLACK reach): the box top
    // (−20) sits above the 8px margin → pulled down by 8 − (−20) = 28 so the
    // box is fully visible. A cropped top-row totem keeps its title on-screen.
    const pushes = resolveEdgeClamp(
      [{ id: 'top', x: 100, y: -20, w: 130, h: 30 }],
      1600,
      900,
      new Map(),
    )
    expect(pushes.get('top')).toBeCloseTo(28, 0)
  })

  it('resolveEdgeClamp: a pill whose anchor is far off-screen is never clamped', () => {
    // Zoomed into Belém: Moju labels land ~1000px below the fold — dragging
    // them up would orphan them from their totems along the bottom edge.
    // y 2000 - PILL_BASE_OFFSET 8 = anchor 1992, beyond vh 900 + slack 140
    // → untouched.
    const pushes = resolveEdgeClamp(
      [{ id: 'far-below', x: 700, y: 2000, w: 130, h: 30 }],
      1600,
      900,
      new Map(),
    )
    expect(pushes.size).toBe(0)
  })

  it('resolveEdgeClamp: a cropped bottom totem keeps its title in view', () => {
    // The slice crop leaves a totem's base below the fold while its upper art
    // is still visible (na_cuia/fogo/hip_hop/quilombo at 16:9 first paint):
    // anchor within vh + slack → the pill is pulled up to sit fully inside
    // the viewport instead of vanishing (user QA 2026-09-16).
    const pushes = resolveEdgeClamp(
      [{ id: 'edge', x: 700, y: 1080 + 120, w: 130, h: 30 }], // anchor 1192
      1920,
      1080,
      new Map(),
    )
    // pulled UP so top + h = vh − margin: push = −(1112 + 30 − 1072) = −158
    expect(pushes.get('edge')).toBeCloseTo(-158, 0)
  })

  it('resolveEdgeClamp: a pill fully past the left edge is never clamped', () => {
    const pushes = resolveEdgeClamp(
      [{ id: 'off-left', x: -204, y: 300, w: 130, h: 44 }],
      1600,
      900,
      new Map(),
    )
    expect(pushes.size).toBe(0)
  })

  it('pillAnchorSlack: floors at the k=1 baseline and grows with the camera', () => {
    // k=1 phone: u ≈ 0.17 CSS px/scene-unit → baseline 140 wins.
    expect(pillAnchorSlack(0.17)).toBe(140)
    // Zoomed to k=4: 190 scene units × u must exceed the baseline so a
    // mostly-visible cropped totem keeps its pill (issue #3 item 3).
    expect(pillAnchorSlack(4)).toBe(190 * 4)
  })

  it('resolveEdgeClamp: a zoom-aware slack reaches anchors the fixed one skips', () => {
    // k=4 on the same 900px viewport: anchor 700px below the fold — outside
    // the fixed 140 reach (skipped) but inside pillAnchorSlack(4) = 760.
    const rect = { id: 'zoomed', x: 700, y: 1608, w: 130, h: 30 }
    expect(resolveEdgeClamp([rect], 1600, 900, new Map()).size).toBe(0)
    const pushes = resolveEdgeClamp([rect], 1600, 900, new Map(), pillAnchorSlack(4))
    // pulled UP so top + h = vh − margin: push = −(1608 + 30 − 892)
    expect(pushes.get('zoomed')).toBeCloseTo(-746, 0)
  })

  it('resolveEdgeClamp: the TOP reach stays at the baseline under zoom slack', () => {
    // Opus r1 P1: art extends only UPWARD from the anchor, so an anchor above
    // the top means the whole totem is off-screen — the zoom slack must NOT
    // extend the top reach, or pills pin to the top margin with no art there.
    // Anchor at −400 (y = −392 box top) is beyond −140 even at pillAnchorSlack(4).
    const rect = { id: 'top-orphan', x: 700, y: -392, w: 130, h: 30 }
    expect(resolveEdgeClamp([rect], 1600, 900, new Map(), pillAnchorSlack(4)).size).toBe(0)
    // …while an anchor just past the baseline is still clamped down as before.
    const near = { id: 'top-near', x: 700, y: -120, w: 130, h: 30 }
    const pushes = resolveEdgeClamp([near], 1600, 900, new Map(), pillAnchorSlack(4))
    expect(pushes.get('top-near')).toBeCloseTo(128, 0) // 8 − (−120)
  })

  it('updateLabels applies the resolved push on the anchor, base offset kept', () => {
    const el = document.createElement('div')
    const anchors: Record<string, { x: number; y: number }> = {}
    for (const [orgId, project] of orgProjects(realData)) {
      anchors[orgId] = { x: project.pos!.x, y: project.pos!.y }
    }
    renderLabels(el, realData, anchors)
    // jsdom has no layout: offsetWidth is 0 → zero pushes; the anchor keeps
    // the bare base point (the +8px grow-below offset is GSAP-owned on the
    // inner div — labels.ts — not on the anchor).
    const ctm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix
    updateLabels(el, { x: 0, y: 0, k: 1 }, ctm)
    const pos = realData.maps.belem.projects.na_cuia.pos!
    const anchor = el.querySelector<HTMLDivElement>('[data-label-id="na_cuia"]')!
    expect(anchor.style.transform).toBe(`translate(${pos.x}px, ${pos.y}px)`)
  })

  it('updateLabels pushes the lower of two static colliders down (layout mocked)', () => {
    const el = document.createElement('div')
    // Two org anchors 12 px apart vertically at this fake camera → their
    // boxes (mocked 20px tall) genuinely overlap by 8px, same 130px column.
    const anchors: Record<string, { x: number; y: number }> = {}
    let i = 0
    for (const [orgId] of orgProjects(realData)) {
      anchors[orgId] = { x: 100 + (i % 2) * 40, y: 100 + i * 12 }
      i++
    }
    renderLabels(el, realData, anchors)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(130)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(20)
    const ctm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix
    updateLabels(el, { x: 0, y: 0, k: 1 }, ctm)
    const ids = Array.from(el.children, (c) => (c as HTMLElement).dataset.labelId!)
    const a = el.querySelector<HTMLDivElement>(`[data-label-id="${ids[0]}"]`)!
    const b = el.querySelector<HTMLDivElement>(`[data-label-id="${ids[1]}"]`)!
    const ya = Number(a.style.transform.match(/, (\d+(?:\.\d+)?)px\)/)![1])
    const yb = Number(b.style.transform.match(/, (\d+(?:\.\d+)?)px\)/)![1])
    // b's box (top = yb + 8) must clear a's box bottom (ya + 8 + 20) + gap 4.
    expect(yb - ya).toBeGreaterThanOrEqual(20 + 4)
    vi.restoreAllMocks()
  })
})

describe('scene.css layer rules', () => {
  it('decorative arrows never intercept pointer events (city taps pass through)', () => {
    // jsdom never applies the imported stylesheet (vitest stubs CSS imports),
    // so the contract is asserted on the CSS source itself: mountArrows draws
    // #layer-arrows above the city interaction groups, and without this rule
    // its <path> elements hijack taps on painted hub pixels (CodeRabbit P2 /
    // qodo Medium on PR #1).
    // Vite statically rewrites `new URL('./scene.css', import.meta.url)` into
    // an http asset URL, which fileURLToPath rejects — resolve from the repo
    // root instead (vitest always runs with the repo root as cwd).
    const css = readFileSync(resolve(process.cwd(), 'src/scene/scene.css'), 'utf8')
    expect(css).toMatch(/#layer-arrows\s*\{[^}]*pointer-events:\s*none/)
  })

  it('title pills are the only tappable label element (issue #13)', () => {
    // Same jsdom limitation as above — the pointer-events contract is pinned
    // on the CSS source. The pill re-enables hit testing + shows the
    // affordance…
    const css = readFileSync(resolve(process.cwd(), 'src/scene/scene.css'), 'utf8')
    expect(css).toMatch(/\.label-pill\s*\{[^}]*pointer-events:\s*auto/)
    expect(css).toMatch(/\.label-pill\s*\{[^}]*cursor:\s*pointer/)
    // …while the layer, the .label anchor and the city labels stay inert…
    expect(css).toMatch(/#labels\s*\{[^}]*pointer-events:\s*none/)
    expect(css).toMatch(/\.label\s*\{[^}]*pointer-events:\s*none/)
    // …and the fade gates re-disable the pill hit zone while hidden (a
    // hidden pill must never be tappable).
    expect(css).toMatch(
      /\.pills-hidden \.label-pill,\s*\.label-pill\.is-far\s*\{[^}]*pointer-events:\s*none/,
    )
  })

  it('desktop cursor affordance: grab canvas, pointer tap targets, grabbing drag (issue #25)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/scene/scene.css'), 'utf8')
    // The scene canvas is a drag surface…
    expect(css).toMatch(/#scene\s*\{[^}]*cursor:\s*grab/)
    // …every data-interactive target (cities, totems, hit circles) reads
    // pointer over it…
    expect(css).toMatch(/#scene \[data-interactive\]\s*\{[^}]*cursor:\s*pointer/)
    // …and a live drag wins over both, on ANY descendant (a drag can begin
    // on a totem — the cursor must still read grabbing).
    expect(css).toMatch(/#scene\.is-dragging,\s*#scene\.is-dragging \*\s*\{[^}]*cursor:\s*grabbing/)
  })
})
