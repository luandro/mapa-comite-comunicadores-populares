// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComiteData } from '../data/types'
import { mountScene } from './mount'

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
      name: 'Mapa de Belém',
      projects: {
        na_cuia: {
          name: 'NA CUIA (BELÉM)',
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

  it('builds #camera with the 4 base layers first, then the calibrated composite', () => {
    const c = mountScene(host, data)
    const camera = host.querySelector('svg#scene #camera')
    expect(camera).not.toBeNull()
    const ids = Array.from(camera!.children, (g) => g.id)
    // Full §4 stack order is asserted in layers.test.ts; here the base
    // partition must remain the first four, untouched by the composite.
    expect(ids.slice(0, 4)).toEqual([
      'layer-water',
      'layer-land',
      'layer-roads',
      'layer-water-detail',
    ])
    expect(ids.slice(4)).toEqual([
      'layer-waves',
      'layer-squiggles',
      'layer-city-belem',
      'layer-city-ananindeua',
      'layer-city-moju',
      'layer-artifacts',
      'layer-arrows',
    ])
    c.destroy()
  })

  it('mounts the partitioned base map with asserted node counts (1/42/5/20)', () => {
    const c = mountScene(host, data)
    const count = (id: string) => host.querySelector(`svg#scene #${id}`)!.childElementCount
    // Real `?scene` import — chunk A's vite pipeline serves the processed string.
    expect(count('layer-water')).toBe(1)
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
    // Phase 1.5: the fixture's one map renders its city name label; no org
    // pills (fixture projects carry no pos). Pill/city coverage: layers.test.
    expect(labels!.childElementCount).toBe(1)
    expect(labels!.querySelector('.label-city')!.textContent).toBe('Mapa de Belém')
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

  it('onIntroDone fires immediately after skipIntro() (P1: no intro yet)', () => {
    const c = mountScene(host, data)
    c.skipIntro()
    const calls: number[] = []
    c.onIntroDone(() => calls.push(1))
    expect(calls).toEqual([1])
    c.destroy()
  })

  it('emits empty-tap once per background click (nothing interactive in P1)', () => {
    const c = mountScene(host, data)
    const taps: number[] = []
    c.on('empty-tap', () => taps.push(1))
    const scene = host.querySelector('svg#scene')!
    scene.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(taps).toEqual([1])
    // Clicks on painted base-map nodes count as empty taps in Phase 1 too.
    const sea = scene.querySelector('#layer-water')!.firstElementChild!
    sea.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(taps).toEqual([1, 1])
    c.destroy()
  })
})
