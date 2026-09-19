// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComiteData } from '../data/types'
import type { TransformState } from './types'
import { updateLabels, updatePillFade } from './labels'
import { cityReplayAction, mountScene } from './mount'

// jsdom ships no ResizeObserver; the camera owns one on the scene container.
// Structure-only stub so the real camera module can bind during tests.
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub
}
// NOTE: jsdom's getScreenCTM() returns null — the camera contract (chunk C)
// tolerates that by design. Deliberately NOT mocked here. If a null-CTM crash
// ever escapes the camera contract, mock SVGSVGElement.prototype.getScreenCTM
// to return an identity-shaped matrix ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }).

const data: ComiteData = {
  maps: {
    belem: {
      name: 'Belém',
      projects: {
        na_cuia: {
          name: 'NA CUIA (BELÉM)',
          pos: { x: 1500, y: 1500, from: [{ x: 1590, y: 1430 }] },
          conflitos: [],
          acao: [],
          identificacao_e_territorio: [],
          futuro: [],
          memoria: [],
          identidade: [],
        },
        chibe: {
          name: 'CHIBÉ',
          pos: { x: 1200, y: 1200, from: [{ x: 1290, y: 1130 }] },
          conflitos: [],
          acao: [],
          identificacao_e_territorio: [],
          futuro: [],
          memoria: [],
          identidade: [],
        },
      },
    },
  },
}

let host: HTMLElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  host.remove()
})

describe('mountScene', () => {
  it('builds svg#scene with the exact scene viewBox and slice cover', () => {
    const c = mountScene(host, data)
    const scene = host.querySelector('svg#scene')
    expect(scene).not.toBeNull()
    expect(scene!.getAttribute('viewBox')).toBe('0 0 3023.11 2021.19')
    expect(scene!.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice')
    c.destroy()
  })

  it('builds #camera with layer-context first, then the 3 base layers, then the calibrated composite', () => {
    const c = mountScene(host, data)
    const camera = host.querySelector('svg#scene #camera')
    expect(camera).not.toBeNull()
    const ids = Array.from(camera!.children, (g) => g.id)
    // §4 stack order is pinned HERE (layers.test.ts has no layer-context
    // case); here the zoom-out
    // context underlayer must be the FIRST child and the base partition the
    // next three, untouched by the composite. v1.1: no layer-water — the
    // .scene-root CSS background is the ocean.
    expect(ids.slice(0, 4)).toEqual([
      'layer-context',
      'layer-land',
      'layer-roads',
      'layer-water-detail',
    ])
    expect(ids.slice(4)).toEqual([
      'layer-squiggles',
      'layer-city-belem',
      'layer-city-ananindeua',
      'layer-city-moju',
      'layer-artifacts',
      'layer-arrows',
    ])
    c.destroy()
  })

  it("mounts the zoom-out context map as #camera's first child (identity transform, content-only)", () => {
    const c = mountScene(host, data)
    const camera = host.querySelector('svg#scene #camera')!
    const context = camera.firstElementChild as SVGGElement
    expect(context.id).toBe('layer-context')
    // Decorative underlayer (mapa contexto.svg): scene coords are baked into
    // the asset — identity transform (no attribute), separate ?scene import,
    // NOT part of the 42/5/20 base partition counts.
    expect(context.getAttribute('transform')).toBeNull()
    expect(context.querySelectorAll('path')).toHaveLength(38) // 31 land + 5 water + 2 road
    expect(host.querySelector('svg#scene #layer-land')!.childElementCount).toBe(42)
    // Home framing (k = 1): the reveal band attribute is ABSENT — the shipped
    // flat-ocean look is untouched until the camera zooms out (opus r1 P2).
    expect(context.hasAttribute('data-zoom-out')).toBe(false)
    c.destroy()
  })

  it('mounts the partitioned base map with asserted node counts (42/5/20, no sea rect)', () => {
    const c = mountScene(host, data)
    const count = (id: string) => host.querySelector(`svg#scene #${id}`)!.childElementCount
    // Real `?scene` import — chunk A's vite pipeline serves the processed string.
    expect(host.querySelector('svg#scene #layer-water')).toBeNull() // ocean is CSS now
    expect(count('layer-land')).toBe(42)
    expect(count('layer-roads')).toBe(5)
    expect(count('layer-water-detail')).toBe(20)
    c.destroy()
  })

  it('places #measure and #labels as scene siblings inside .scene-root', () => {
    const c = mountScene(host, data)
    const root = host.querySelector('.scene-root')
    expect(root).not.toBeNull()
    expect(root!.parentElement).toBe(host)
    expect(Array.from(root!.children, (child) => child.id)).toEqual(['scene', 'measure', 'labels'])
    const measure = root!.querySelector('svg#measure')
    expect(measure!.getAttribute('viewBox')).toBe('0 0 3023.11 2021.19')
    expect(measure!.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice')
    expect(measure!.childElementCount).toBe(0)
    const labels = root!.querySelector('#labels')
    expect(labels!.getAttribute('aria-hidden')).toBe('true')
    // The fixture's one map renders its city name label AND one org pill
    // (both fixture orgs carry pos → two pills) + the city name label.
    expect(labels!.childElementCount).toBe(3)
    expect(labels!.querySelector('.label-city')!.textContent).toBe('Belém')
    expect(labels!.querySelectorAll('.label-pill')).toHaveLength(2)
    c.destroy()
  })

  it('destroy() empties the host and is idempotent', () => {
    const c = mountScene(host, data)
    c.destroy()
    c.destroy()
    expect(host.childElementCount).toBe(0)
  })

  it('mount → destroy → mount leaves exactly one of everything (StrictMode-safe)', () => {
    const first = mountScene(host, data)
    first.destroy()
    const second = mountScene(host, data)
    expect(host.querySelectorAll('.scene-root')).toHaveLength(1)
    expect(host.querySelectorAll('svg#scene')).toHaveLength(1)
    expect(host.querySelectorAll('svg#measure')).toHaveLength(1)
    expect(host.querySelectorAll('#labels')).toHaveLength(1)
    second.destroy()
  })

  it('onTransform unsubscriber stops delivery', async () => {
    const c = mountScene(host, data)
    const seen: number[] = []
    const off = c.onTransform((t) => seen.push(t.k))
    // zoomBy commits a d3-zoom transform synchronously (no gesture math needed).
    c.zoomBy(1.5)
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 2000 })
    off()
    off() // idempotent
    const delivered = seen.length
    // Sentinel stays subscribed: when it fires, the second zoomBy has committed
    // a frame — so the unsubscribed callback provably got none of them.
    const sentinel: number[] = []
    c.onTransform((t) => sentinel.push(t.k))
    c.zoomBy(1.5)
    await vi.waitFor(() => expect(sentinel.length).toBeGreaterThan(0), { timeout: 2000 })
    expect(seen.length).toBe(delivered)
    c.destroy()
  })

  it('intro: skipIntro() finalizes targets, is idempotent, and late onIntroDone fires immediately', () => {
    const c = mountScene(host, data)
    // primed start: the land layer is hidden while the intro runs (jsdom has
    // no rAF-driven GSAP ticking, so the timeline never advances here)
    expect(getComputedStyle(document.querySelector('#layer-land')!).opacity).toBe('0')
    c.skipIntro()
    expect(getComputedStyle(document.querySelector('#layer-land')!).opacity).toBe('1')
    expect(document.documentElement.classList.contains('intro-done')).toBe(true)
    // late subscriber fires immediately (SPEC §10 contract)
    const calls: number[] = []
    c.onIntroDone(() => calls.push(1))
    expect(calls).toEqual([1])
    // idempotent: second call is a no-op, listeners fire once
    c.skipIntro()
    expect(calls).toEqual([1])
    c.destroy()
    expect(document.documentElement.classList.contains('intro-done')).toBe(false)
  })

  it('intro: onIntroDone registered before completion fires when skipIntro() resolves', () => {
    const c = mountScene(host, data)
    const calls: number[] = []
    c.onIntroDone(() => calls.push(1))
    expect(calls).toEqual([])
    c.skipIntro()
    expect(calls).toEqual([1])
    c.destroy()
  })

  it('intro: reduced-motion renders the final state immediately (no priming)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    )
    try {
      const c = mountScene(host, data)
      // never primed: no inline opacity was set on the land layer (the
      // reduced-motion path skips primeIntroTargets entirely)
      expect(document.querySelector('#layer-land')!.hasAttribute('style')).toBe(false)
      expect(document.documentElement.classList.contains('intro-done')).toBe(true)
      c.skipIntro() // idempotent even though the intro never ran
      c.destroy()
      expect(document.documentElement.classList.contains('intro-done')).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('intro: label offsets are GSAP property, not CSS transform (one owner — opus P1)', () => {
    const c = mountScene(host, data)
    c.skipIntro()
    const pill = document.querySelector<HTMLElement>('.label-pill')!
    expect(pill.style.transform).toContain('-50%')
    expect(pill.style.transform).toContain('translate(-50%, 0%)')
    expect(pill.style.transform).toContain('8px')
    expect(getComputedStyle(pill).transform).not.toBe('none')
    c.destroy()
  })

  it('emits empty-tap once per background click (nothing interactive in P1)', () => {
    const c = mountScene(host, data)
    const taps: number[] = []
    c.on('empty-tap', () => taps.push(1))
    const scene = host.querySelector('svg#scene')!
    scene.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(taps).toEqual([1])
    // Clicks on painted base-map nodes count as empty taps in Phase 1 too
    // (v1.1: the sea rect is gone — a land node stands in as painted base).
    const land = scene.querySelector('#layer-land')!.firstElementChild!
    land.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(taps).toEqual([1, 1])
    c.destroy()
  })

  // --- Issue #12: city tap = select + org-entrance replay ---------------------
  // jsdom never ticks GSAP's rAF loop, so the replay TWEENS don't land here —
  // but the replay's priming is gsap.set (synchronous), and so is the settle.
  // These tests assert that synchronous state contract: primed → hidden +
  // dash-scaffolded; settled → the pristine post-intro rest (aria-pressed is
  // the DOM reflection of mount.ts's single raisedCityId owner, plus the hub
  // events). The city groups themselves gain NO tap styles at all (issue #12:
  // the raise/dim is gone).

  function cityGroups() {
    return {
      belem: host.querySelector<SVGGElement>('[data-city-id="belem"]')!,
      ananindeua: host.querySelector<SVGGElement>('[data-city-id="ananindeua"]')!,
      moju: host.querySelector<SVGGElement>('[data-city-id="moju"]')!,
    }
  }

  function pressedState(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(cityGroups()).map(([id, g]) => [id, g.getAttribute('aria-pressed') ?? '']),
    )
  }

  /** A tap lands on a painted landmass path inside the city's interaction g. */
  function tapCity(id: keyof ReturnType<typeof cityGroups>): void {
    const g = cityGroups()[id]
    g.querySelector('path')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  /** A tap on a painted non-interactive base node (v1.1: sea rect is CSS now). */
  function backgroundClick(detail = 1): void {
    const land = host.querySelector('svg#scene #layer-land')!.firstElementChild!
    land.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))
  }

  it('city click toggles aria-pressed and emits city-tap; empty-tap stays silent', () => {
    const c = mountScene(host, data)
    const raised: string[] = []
    const empties: number[] = []
    c.on('city-tap', (id) => raised.push(id))
    c.on('empty-tap', () => empties.push(1))
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'false', moju: 'false' })
    tapCity('belem')
    expect(raised).toEqual(['belem'])
    expect(empties).toEqual([])
    expect(pressedState()).toEqual({ belem: 'true', ananindeua: 'false', moju: 'false' })
    c.destroy()
  })

  it('re-select: tapping a different city moves the selection; city-tap fires per change', () => {
    const c = mountScene(host, data)
    const raised: string[] = []
    c.on('city-tap', (id) => raised.push(id))
    tapCity('belem')
    tapCity('ananindeua')
    expect(raised).toEqual(['belem', 'ananindeua'])
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'true', moju: 'false' })
    c.destroy()
  })

  it('reversal: tapping the selected city again settles everything back to rest', () => {
    const c = mountScene(host, data)
    const raised: string[] = []
    c.on('city-tap', (id) => raised.push(id))
    tapCity('moju')
    tapCity('moju')
    // city-tap emits on raise only — the reverse is a settle, not a change to a city
    expect(raised).toEqual(['moju'])
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'false', moju: 'false' })
    c.destroy()
  })

  it('reversal: tapping empty background settles the selection and emits empty-tap', () => {
    const c = mountScene(host, data)
    const raised: string[] = []
    const empties: number[] = []
    c.on('city-tap', (id) => raised.push(id))
    c.on('empty-tap', () => empties.push(1))
    tapCity('belem')
    expect(empties).toEqual([])
    backgroundClick()
    expect(raised).toEqual(['belem'])
    expect(empties).toEqual([1])
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'false', moju: 'false' })
    c.destroy()
  })

  // Two-city fixture so a replay's blast radius is assertable: only belem's
  // orgs may move when belem is tapped; ananindeua's 'rede' must hold rest.
  const replayData: ComiteData = {
    maps: {
      belem: { name: 'Belém', projects: { ...data.maps.belem.projects } },
      ananindeua: {
        name: 'Ananindeua',
        projects: {
          rede: {
            name: 'REDE',
            pos: { x: 1700, y: 300, from: [{ x: 1700, y: 278 }] },
            conflitos: [],
            acao: [],
            identificacao_e_territorio: [],
            futuro: [],
            memoria: [],
            identidade: [],
          },
        },
      },
    },
  }

  /** One org's attributed arrow elements (issue #12 replay targets). */
  function orgArrowsOf(orgId: string): { paths: SVGPathElement[]; tails: SVGCircleElement[] } {
    return {
      paths: Array.from(
        host.querySelectorAll<SVGPathElement>(`#layer-arrows path[data-arrow-org="${orgId}"]`),
      ),
      tails: Array.from(
        host.querySelectorAll<SVGCircleElement>(`#layer-arrows circle[data-arrow-org="${orgId}"]`),
      ),
    }
  }

  it('cityReplayAction (pure): replay on select, settle on reverse, none on no-change', () => {
    expect(cityReplayAction(null, 'belem')).toBe('replay')
    expect(cityReplayAction('belem', 'ananindeua')).toBe('replay')
    expect(cityReplayAction('belem', null)).toBe('settle')
    expect(cityReplayAction('belem', 'belem')).toBe('none')
    expect(cityReplayAction(null, null)).toBe('none')
  })

  it('replay primes ONLY the tapped city orgs: totems hidden, arrows dash-scaffolded', () => {
    const c = mountScene(host, replayData)
    // The tap itself settles the intro first (mount.ts guard) — then primes.
    tapCity('belem')
    const groups = artifactGroups()
    // belem's orgs: primed at the entrance start state (drop-in pending)
    expect(getComputedStyle(groups['na_cuia']!).opacity).toBe('0')
    expect(getComputedStyle(groups['chibe']!).opacity).toBe('0')
    // the OTHER city's org: untouched at the post-intro rest
    expect(getComputedStyle(groups['rede']!).opacity).toBe('1')
    // arrows primed with dash scaffolding + hidden tails (pairwise, like intro)
    const primed = orgArrowsOf('na_cuia')
    expect(primed.paths[0]!.getAttribute('stroke-dasharray')).not.toBeNull()
    expect(primed.paths[0]!.getAttribute('stroke-dashoffset')).not.toBeNull()
    expect(getComputedStyle(primed.paths[0]!).opacity).toBe('0')
    expect(getComputedStyle(primed.tails[0]!).opacity).toBe('0')
    const untouched = orgArrowsOf('rede')
    expect(untouched.paths[0]!.getAttribute('stroke-dasharray')).toBeNull()
    expect(getComputedStyle(untouched.paths[0]!).opacity).toBe('1')
    c.destroy()
  })

  it('city dim + filter: others dim to 0.35, non-city orgs hide, selected stays full (user directive)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    )
    try {
      const c = mountScene(host, replayData)
      tapCity('belem')
      const cities = cityGroups()
      // dim: other city group faded, selected group full
      expect(getComputedStyle(cities['belem']!).opacity).toBe('1')
      expect(getComputedStyle(cities['ananindeua']!).opacity).toBe('0.35')
      // filter: the other city's org + arrows hidden, hit circle untappable
      expect(getComputedStyle(artifactGroups()['rede']!).opacity).toBe('0')
      const redeHit = host.querySelector<SVGCircleElement>('circle[data-artifact-id="rede"]')!
      expect(redeHit.style.pointerEvents).toBe('none')
      expect(getComputedStyle(orgArrowsOf('rede').paths[0]!).opacity).toBe('0')
      expect(getComputedStyle(orgArrowsOf('rede').tails[0]!).opacity).toBe('0')
      const redePill = host.querySelector<HTMLElement>('[data-label-id="rede"] .label-pill')!
      expect(redePill.style.pointerEvents).toBe('none')
      expect(getComputedStyle(redePill).opacity).toBe('0')
      // selected city's org: untouched by the filter (rest, not '0'; the
      // reduced-motion replay is a no-op so no end-at-1 tween exists)
      expect(getComputedStyle(artifactGroups()['na_cuia']!).opacity).not.toBe('0')
      c.destroy()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('filter reverse: empty-tap restores dimmed group + hidden org to full visibility', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    )
    try {
      const c = mountScene(host, replayData)
      tapCity('belem')
      backgroundClick()
      const cities = cityGroups()
      expect(getComputedStyle(cities['ananindeua']!).opacity).toBe('1')
      expect(getComputedStyle(artifactGroups()['rede']!).opacity).toBe('1')
      const redeHit = host.querySelector<SVGCircleElement>('circle[data-artifact-id="rede"]')!
      expect(redeHit.style.pointerEvents).toBe('auto')
      const redePill = host.querySelector<HTMLElement>('[data-label-id="rede"] .label-pill')!
      expect(redePill.style.pointerEvents).toBe('auto')
      expect(getComputedStyle(redePill).opacity).toBe('1')
      c.destroy()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('filter switch: belem → ananindeua restores belem orgs and hides ananindeua orgs', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    )
    try {
      const c = mountScene(host, replayData)
      tapCity('belem')
      tapCity('ananindeua')
      const cities = cityGroups()
      expect(getComputedStyle(cities['belem']!).opacity).toBe('0.35')
      expect(getComputedStyle(cities['ananindeua']!).opacity).toBe('1')
      expect(getComputedStyle(artifactGroups()['na_cuia']!).opacity).toBe('0')
      expect(getComputedStyle(artifactGroups()['rede']!).opacity).toBe('1')
      c.destroy()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('fast switch mid-fade: replay-owned restore overwrites the in-flight fade-out (no stranded pill)', async () => {
    const c = mountScene(host, replayData)
    try {
      tapCity('belem')
      // switch INSIDE the 0.5s filter fade — rede's fade-out tween is live
      await new Promise((r) => setTimeout(r, 120))
      tapCity('ananindeua')
      await new Promise((r) => setTimeout(r, 1500))
      // rede (ananindeua's org) must NOT be stranded at 0 by the racing tween
      const redePill = host.querySelector<HTMLElement>('[data-label-id="rede"] .label-pill')!
      expect(getComputedStyle(redePill).opacity).toBe('1')
      expect(redePill.style.pointerEvents).toBe('auto')
      const redeHit = host.querySelector<SVGCircleElement>('circle[data-artifact-id="rede"]')!
      expect(getComputedStyle(redeHit).opacity).toBe('1')
      c.destroy()
    } finally {
      // noop — symmetry with the other filter tests
    }
  })

  it('destroy() clears filter pointer-events so a remount starts hit-testable', () => {
    const c = mountScene(host, replayData)
    tapCity('belem')
    c.destroy()
    const c2 = mountScene(host, replayData)
    const hit = c2
      ? host.querySelector<SVGCircleElement>('circle[data-interactive="artifact"]')!
      : null
    expect(hit!.style.pointerEvents).toBe('')
    c2.destroy()
  })

  it('dim reaches its final value and hidden totems are untappable (timer-advanced)', async () => {
    const c = mountScene(host, replayData)
    try {
      tapCity('belem')
      // wait past the 0.5s filter tween — real browsers see this end state
      await new Promise((r) => setTimeout(r, 700))
      const cities = cityGroups()
      expect(getComputedStyle(cities['ananindeua']!).opacity).toBe('0.35')
      expect(getComputedStyle(cities['belem']!).opacity).toBe('1')
      // hidden totem itself: invisible AND unhit-testable through its painted paths
      const redeG = artifactGroups()['rede']!
      expect(getComputedStyle(redeG).opacity).toBe('0')
      expect(redeG.style.pointerEvents).toBe('none')
      c.destroy()
    } finally {
      // noop — kept symmetric with the other filter tests' finally blocks
    }
  })

  it('empty-tap after a replay re-finalizes the orgs to the pristine rest state', () => {
    const c = mountScene(host, replayData)
    tapCity('belem')
    backgroundClick()
    for (const id of ['na_cuia', 'chibe', 'rede']) {
      expect(getComputedStyle(artifactGroups()[id]!).opacity).toBe('1')
    }
    const settled = orgArrowsOf('na_cuia')
    expect(settled.paths[0]!.getAttribute('stroke-dasharray')).toBeNull()
    expect(settled.paths[0]!.getAttribute('stroke-dashoffset')).toBeNull()
    expect(getComputedStyle(settled.paths[0]!).opacity).toBe('1')
    expect(getComputedStyle(settled.tails[0]!).opacity).toBe('1')
    c.destroy()
  })

  it('switching cities settles the previous replay before the new one plays (nothing lingers)', () => {
    const c = mountScene(host, replayData)
    tapCity('belem')
    tapCity('ananindeua')
    const groups = artifactGroups()
    expect(getComputedStyle(groups['na_cuia']!).opacity).toBe('1') // settled back
    expect(getComputedStyle(groups['chibe']!).opacity).toBe('1')
    expect(orgArrowsOf('na_cuia').paths[0]!.getAttribute('stroke-dasharray')).toBeNull()
    expect(getComputedStyle(groups['rede']!).opacity).toBe('0') // newly replayed
    expect(orgArrowsOf('rede').paths[0]!.getAttribute('stroke-dasharray')).not.toBeNull()
    c.destroy()
  })

  it('a city with no mounted orgs (moju) taps cleanly: aria + emit, nothing primed', () => {
    const c = mountScene(host, replayData)
    const raised: string[] = []
    c.on('city-tap', (id) => raised.push(id))
    tapCity('moju')
    expect(raised).toEqual(['moju'])
    expect(cityGroups().moju.getAttribute('aria-pressed')).toBe('true')
    for (const id of ['na_cuia', 'chibe', 'rede']) {
      expect(getComputedStyle(artifactGroups()[id]!).opacity).toBe('1')
    }
    c.destroy()
  })

  it('reduced motion: the replay is a state jump — nothing is primed, nothing tweens', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    )
    try {
      const c = mountScene(host, replayData)
      tapCity('belem')
      const groups = artifactGroups()
      // Reduced-motion state jumps: the filter's fade renders instantly, so
      // the selected city's orgs stay at rest (no inline style needed in
      // jsdom — na_cuia is in toShow AND at rest, so no tween is created),
      // while the OTHER city's org, arrows and pill fade out + drop hits.
      expect(getComputedStyle(groups['na_cuia']!).opacity).not.toBe('0')
      expect(getComputedStyle(groups['rede']!).opacity).toBe('0')
      expect(orgArrowsOf('na_cuia').paths[0]!.getAttribute('stroke-dasharray')).toBeNull()
      expect(orgArrowsOf('rede').paths[0]!.getAttribute('stroke-dasharray')).toBeNull()
      expect(getComputedStyle(orgArrowsOf('rede').paths[0]!).opacity).toBe('0')
      expect(host.querySelector<HTMLElement>('[data-label-for="rede"]')!.style.pointerEvents).toBe(
        'none',
      )
      c.destroy()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // ---- Phase 5: artifacts ----
  /** Artifact interaction groups keyed by org id (mountCalibratedLayers). */
  function artifactGroups(): Record<string, SVGGElement> {
    return Object.fromEntries(
      Array.from(host.querySelectorAll<SVGGElement>('#layer-artifacts g[data-artifact-id]')).map(
        (g) => [g.getAttribute('data-artifact-id')!, g],
      ),
    )
  }

  it('artifact tap: emits artifact-tap, sets aria-pressed, single-select moves, toggle deselects', () => {
    const c = mountScene(host, data)
    const taps: string[] = []
    c.on('artifact-tap', (id) => taps.push(id))
    const groups = artifactGroups()
    const circles = Object.fromEntries(
      Array.from(
        host.querySelectorAll<SVGCircleElement>('#layer-artifacts circle[data-artifact-id]'),
      ).map((c) => [c.getAttribute('data-artifact-id')!, c]),
    )
    // select the first org (tap its hit circle — the real tap target)
    circles['na_cuia'].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(taps).toEqual(['na_cuia'])
    expect(groups['na_cuia'].getAttribute('aria-pressed')).toBe('true')
    // selecting another MOVES the selection
    circles['chibe'].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(taps).toEqual(['na_cuia', 'chibe'])
    expect(groups['na_cuia'].getAttribute('aria-pressed')).toBe('false')
    expect(groups['chibe'].getAttribute('aria-pressed')).toBe('true')
    // toggling the selected one deselects (no emit — mirrors city reverse)
    circles['chibe'].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(taps).toEqual(['na_cuia', 'chibe'])
    expect(groups['chibe'].getAttribute('aria-pressed')).toBe('false')
    // empty tap deselects silently
    backgroundClick()
    expect(groups['chibe'].getAttribute('aria-pressed')).toBe('false')
    c.destroy()
  })

  it('artifact-tap does NOT re-emit for an already-selected id (focusArtifact path — opus P2)', () => {
    const c = mountScene(host, data)
    const taps: string[] = []
    c.on('artifact-tap', (id) => taps.push(id))
    c.focusArtifact('na_cuia') // select + pulse + fly → emits once
    expect(taps).toEqual(['na_cuia'])
    c.focusArtifact('na_cuia') // same id: pulse may replay, emit must not
    expect(taps).toEqual(['na_cuia'])
    c.destroy()
  })

  // ---- Issue #13: title-pill tap opens the org modal ----
  // The pill lives in #labels (HTML sibling of the scene SVG) — a pointer tap
  // there must behave exactly like tapping the totem, EXCEPT it never toggles.

  /** A pointer tap lands on an org's title pill (inside #labels, not the SVG). */
  function tapPill(orgId: string, detail = 1): void {
    const pill = host.querySelector<HTMLElement>(`#labels .label-pill[data-label-for="${orgId}"]`)!
    pill.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))
  }

  it('pill tap: selects and emits artifact-tap exactly like a totem tap', () => {
    const c = mountScene(host, data)
    const taps: string[] = []
    c.on('artifact-tap', (id) => taps.push(id))
    tapPill('na_cuia')
    expect(taps).toEqual(['na_cuia'])
    expect(artifactGroups().na_cuia.getAttribute('aria-pressed')).toBe('true')
    c.destroy()
  })

  it('pill tap: re-tapping the SELECTED org re-emits — pills never toggle (issue #13)', () => {
    const c = mountScene(host, data)
    const taps: string[] = []
    c.on('artifact-tap', (id) => taps.push(id))
    tapPill('na_cuia')
    // A totem re-tap would DESELECT silently (no emit — mirrors the city
    // reverse); a pill tap must (re)open the modal via a direct emit.
    tapPill('na_cuia')
    expect(taps).toEqual(['na_cuia', 'na_cuia'])
    expect(artifactGroups().na_cuia.getAttribute('aria-pressed')).toBe('true')
    // moving to another org through its pill single-selects like the totem
    tapPill('chibe')
    expect(taps).toEqual(['na_cuia', 'na_cuia', 'chibe'])
    expect(artifactGroups().na_cuia.getAttribute('aria-pressed')).toBe('false')
    expect(artifactGroups().chibe.getAttribute('aria-pressed')).toBe('true')
    c.destroy()
  })

  it('pill tap: one gesture = one action (no scene double-fire, no empty-tap, inert areas)', () => {
    const c = mountScene(host, data)
    const taps: string[] = []
    const empties: number[] = []
    c.on('artifact-tap', (id) => taps.push(id))
    c.on('empty-tap', () => empties.push(1))
    tapPill('na_cuia')
    expect(taps).toEqual(['na_cuia'])
    expect(empties).toEqual([])
    // If the scene's toggle handler had ALSO run for this gesture, the
    // selection would have flipped back to null — it stays selected, so the
    // pill was the one and only handler (#labels and the SVG are siblings).
    expect(artifactGroups().na_cuia.getAttribute('aria-pressed')).toBe('true')
    // double-tap zoom compat click (detail > 1) is ignored, mirroring onSceneClick
    tapPill('na_cuia', 2)
    expect(taps).toEqual(['na_cuia'])
    // clicks on non-pill label areas (city label, .label anchor) stay inert
    host
      .querySelector<HTMLElement>('#labels .label-city')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    host
      .querySelector<HTMLElement>('#labels .label')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(taps).toEqual(['na_cuia'])
    expect(empties).toEqual([])
    c.destroy()
  })

  it('pill tap: a stale data-label-for (org without a mounted artifact) is inert', () => {
    const c = mountScene(host, data)
    const taps: string[] = []
    c.on('artifact-tap', (id) => taps.push(id))
    const pill = host.querySelector<HTMLElement>('#labels .label-pill')!
    pill.setAttribute('data-label-for', 'ghost')
    pill.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(taps).toEqual([])
    expect(artifactGroups().na_cuia.getAttribute('aria-pressed')).toBe('false')
    c.destroy()
  })

  it('pill tap: focus moves to the totem interaction g (SPEC §8 restore-focus, codex r1 P2)', () => {
    // The pill is not focusable; Panel captures document.activeElement on
    // open and restores it on close. The pill handler must therefore focus
    // the org's SVG button BEFORE the panel opens, so close returns focus to
    // the triggering artifact, not <body>.
    const c = mountScene(host, data)
    expect(document.activeElement).not.toBe(artifactGroups().na_cuia)
    tapPill('na_cuia')
    expect(document.activeElement).toBe(artifactGroups().na_cuia)
    c.destroy()
  })

  it('artifact focusin flies ONLY under keyboard modality (:focus-visible guard)', () => {
    const c = mountScene(host, data)
    const g = artifactGroups()['na_cuia']
    const realMatches = Element.prototype.matches
    // Keyboard modality: :focus-visible matches → fly happens (selection unchanged)
    Element.prototype.matches = function (selector: string): boolean {
      return selector === ':focus-visible' ? true : realMatches.call(this, selector)
    }
    g.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(g.getAttribute('aria-pressed')).toBe('false') // fly ≠ select
    // Mouse modality: :focus-visible does NOT match → no fly side effects
    Element.prototype.matches = function (selector: string): boolean {
      return selector === ':focus-visible' ? false : realMatches.call(this, selector)
    }
    g.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    Element.prototype.matches = realMatches
    expect(g.getAttribute('aria-pressed')).toBe('false')
    c.destroy()
  })

  it('focus halo: keyboard focusin paints .is-kbd-focus, focusout clears it, pointer never does (issue #12)', () => {
    const c = mountScene(host, data)
    const city = cityGroups().belem
    const artifact = artifactGroups()['na_cuia']
    const realMatches = Element.prototype.matches
    // Keyboard modality: :focus-visible matches → halo + fly
    Element.prototype.matches = function (selector: string): boolean {
      return selector === ':focus-visible' ? true : realMatches.call(this, selector)
    }
    city.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    artifact.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(city.classList.contains('is-kbd-focus')).toBe(true)
    expect(artifact.classList.contains('is-kbd-focus')).toBe(true)
    // focus always drops the halo, whatever modality brought it
    city.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    artifact.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(city.classList.contains('is-kbd-focus')).toBe(false)
    expect(artifact.classList.contains('is-kbd-focus')).toBe(false)
    // Pointer modality: :focus-visible does NOT match → no halo, no stuck ring
    Element.prototype.matches = function (selector: string): boolean {
      return selector === ':focus-visible' ? false : realMatches.call(this, selector)
    }
    city.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    artifact.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(city.classList.contains('is-kbd-focus')).toBe(false)
    expect(artifact.classList.contains('is-kbd-focus')).toBe(false)
    Element.prototype.matches = realMatches
    c.destroy()
  })

  it('artifact keyboard: Enter selects, Space deselects, Space never scrolls', () => {
    const c = mountScene(host, data)
    const taps: string[] = []
    c.on('artifact-tap', (id) => taps.push(id))
    const g = artifactGroups()['na_cuia']
    g.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(taps).toEqual(['na_cuia'])
    expect(g.getAttribute('aria-pressed')).toBe('true')
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    g.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(true)
    expect(g.getAttribute('aria-pressed')).toBe('false')
    c.destroy()
  })

  it('pills-hidden: hysteresis band entirely below 1 (hide < 0.9, show ≥ 1.0 — drives the same updatePillFade the controller calls)', () => {
    const labels = document.createElement('div')
    // below 0.9 → hidden
    updatePillFade(labels, 0.6)
    expect(labels.classList.contains('pills-hidden')).toBe(true)
    // inside the band (0.9..1.0) → unchanged (still hidden)
    updatePillFade(labels, 0.95)
    expect(labels.classList.contains('pills-hidden')).toBe(true)
    // at exactly 1.0 → shown: reset() lands at k = 1 and pills must return
    // (the old >1.1 show edge left pills hidden after a K_MIN zoom-out reset)
    updatePillFade(labels, 1.0)
    expect(labels.classList.contains('pills-hidden')).toBe(false)
    // falling back in from above does NOT re-hide inside the band
    updatePillFade(labels, 0.95)
    expect(labels.classList.contains('pills-hidden')).toBe(false)
    updatePillFade(labels, 0.6)
    expect(labels.classList.contains('pills-hidden')).toBe(true)
  })

  it('pill distance gate (mobile): .is-far toggles with ±10% hysteresis around the center radius', () => {
    // jsdom viewport 1024×768 → center (512,384), R = 0.45×768 = 345.6
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    const R = 0.45 * Math.min(window.innerWidth, window.innerHeight)
    const labels = document.createElement('div')
    // real structure: .label anchor (dataset + per-frame transform) wrapping
    // the inner .label-pill (which gains/loses .is-far)
    const anchor = document.createElement('div')
    anchor.className = 'label'
    anchor.dataset.x = '0'
    anchor.dataset.y = '0'
    const pill = document.createElement('div')
    pill.className = 'label-pill'
    anchor.appendChild(pill)
    labels.appendChild(anchor)
    // jsdom ships no DOMMatrix — an identity-shaped stub is enough here (only
    // .a/.d scale and .e/.f translate are read).
    const ctm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix
    const id = (x: number, y: number): TransformState => ({ x, y, k: 1 })
    // dead center → visible
    updateLabels(labels, id(cx, cy), ctm, true)
    expect(pill.classList.contains('is-far')).toBe(false)
    // walk out: past 1.1R from center → hidden
    updateLabels(labels, id(cx, cy + R * 1.2), ctm, true)
    expect(pill.classList.contains('is-far')).toBe(true)
    // inside the band (0.9R..1.1R) → holds hidden
    updateLabels(labels, id(cx, cy + R), ctm, true)
    expect(pill.classList.contains('is-far')).toBe(true)
    // walk back under 0.9R → visible again
    updateLabels(labels, id(cx, cy + R * 0.8), ctm, true)
    expect(pill.classList.contains('is-far')).toBe(false)
    // desktop (gated=false) NEVER fades, even far off-center
    updateLabels(labels, id(cx, cy + R * 1.2), ctm, false)
    expect(pill.classList.contains('is-far')).toBe(false)
  })

  it('keyboard: Enter selects, Space reverses, and Space never scrolls', () => {
    const c = mountScene(host, data)
    const raised: string[] = []
    c.on('city-tap', (id) => raised.push(id))
    const belem = cityGroups().belem
    belem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(raised).toEqual(['belem'])
    expect(pressedState()).toEqual({ belem: 'true', ananindeua: 'false', moju: 'false' })
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    belem.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(true) // SPEC §9: Space must not scroll
    expect(raised).toEqual(['belem'])
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'false', moju: 'false' })
    c.destroy()
  })

  it('destroy() reverts the replay styles (StrictMode remount starts at rest)', () => {
    const first = mountScene(host, data)
    tapCity('belem')
    first.destroy()
    const second = mountScene(host, data)
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'false', moju: 'false' })
    second.destroy()
  })

  it('replay: a tap during the intro settles the entrance first (no stuck replay — opus P1)', () => {
    const c = mountScene(host, data)
    const introCalls: number[] = []
    c.onIntroDone(() => introCalls.push(1))
    // jsdom never ticks GSAP, so the intro has NOT completed here
    tapCity('belem')
    // skipIntro() ran → intro resolved AND the selection state is consistent
    expect(introCalls).toEqual([1])
    expect(pressedState()).toEqual({ belem: 'true', ananindeua: 'false', moju: 'false' })
    // and the tapped city reverses normally afterwards (no stuck selection)
    tapCity('belem')
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'false', moju: 'false' })
    c.destroy()
  })

  it('tap: compat click with detail > 1 is ignored (double-tap zoom guard — opus P2)', () => {
    const c = mountScene(host, data)
    const raised: string[] = []
    const empties: number[] = []
    c.on('city-tap', (id) => raised.push(id))
    c.on('empty-tap', () => empties.push(1))
    cityGroups()
      .belem.querySelector('path')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }))
    backgroundClick(2)
    expect(raised).toEqual([])
    expect(empties).toEqual([])
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'false', moju: 'false' })
    c.destroy()
  })

  it('pauses loops when hidden: .scene-hidden tracks document.hidden, incl. initial state, and stops after destroy', () => {
    // jsdom owns document.hidden as a getter on Document.prototype
    const hiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')!
    const setHidden = (value: boolean) =>
      Object.defineProperty(Document.prototype, 'hidden', {
        configurable: true,
        get: () => value,
      })
    try {
      setHidden(true)
      const c = mountScene(host, data)
      const root = host.querySelector('.scene-root')!
      // mounted while already hidden → paused immediately (opus P2 fix)
      expect(root.classList.contains('scene-hidden')).toBe(true)
      setHidden(false)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(root.classList.contains('scene-hidden')).toBe(false)
      setHidden(true)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(root.classList.contains('scene-hidden')).toBe(true)
      c.destroy()
      // after destroy the listener is gone: the class must not flip back
      setHidden(false)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(root.classList.contains('scene-hidden')).toBe(true)
    } finally {
      Object.defineProperty(Document.prototype, 'hidden', hiddenDesc)
    }
  })
})

describe('desktop totem hover glow (mount wiring)', () => {
  // jsdom (25.x) has no PointerEvent constructor — mount.ts only reads
  // event.pointerType, so a MouseEvent subclass carrying the field dispatches
  // identically through jsdom's event system.
  class PointerEvent extends MouseEvent {
    readonly pointerType: string
    constructor(type: string, init: MouseEventInit & { pointerType?: string }) {
      super(type, init)
      this.pointerType = init.pointerType ?? ''
    }
  }

  it('mouse pointerover on the hit circle lights the interaction g; pointerout clears it', () => {
    const c = mountScene(host, data)
    const g = host.querySelector<SVGGElement>('g.artifact-target[data-artifact-id="na_cuia"]')!
    const hit = host.querySelector<SVGCircleElement>('circle[data-artifact-id="na_cuia"]')!
    const over = new PointerEvent('pointerover', {
      bubbles: true,
      pointerType: 'mouse',
    })
    const out = new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' })
    hit.dispatchEvent(over)
    expect(g.classList.contains('is-pointer-hover')).toBe(true)
    // moving within the same group (art path → hit circle) keeps the glow
    hit.dispatchEvent(over)
    expect(g.classList.contains('is-pointer-hover')).toBe(true)
    hit.dispatchEvent(out)
    expect(g.classList.contains('is-pointer-hover')).toBe(false)
    c.destroy()
  })

  it('touch and pen pointers never stick the glow', () => {
    const c = mountScene(host, data)
    const g = host.querySelector<SVGGElement>('g.artifact-target[data-artifact-id="na_cuia"]')!
    const hit = host.querySelector<SVGCircleElement>('circle[data-artifact-id="na_cuia"]')!
    for (const pointerType of ['touch', 'pen']) {
      hit.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType }))
      expect(g.classList.contains('is-pointer-hover')).toBe(false)
      hit.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType }))
      expect(g.classList.contains('is-pointer-hover')).toBe(false)
    }
    c.destroy()
  })

  it('destroy() removes the hover listeners — no class changes after teardown', () => {
    const c = mountScene(host, data)
    const g = host.querySelector<SVGGElement>('g.artifact-target[data-artifact-id="na_cuia"]')!
    const hit = host.querySelector<SVGCircleElement>('circle[data-artifact-id="na_cuia"]')!
    c.destroy()
    hit.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
    expect(g.classList.contains('is-pointer-hover')).toBe(false)
  })
})
