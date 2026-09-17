// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComiteData } from '../data/types'
import type { TransformState } from './types'
import { updateLabels, updatePillFade } from './labels'
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

  it('builds #camera with the 3 base layers first, then the calibrated composite', () => {
    const c = mountScene(host, data)
    const camera = host.querySelector('svg#scene #camera')
    expect(camera).not.toBeNull()
    const ids = Array.from(camera!.children, (g) => g.id)
    // Full §4 stack order is asserted in layers.test.ts; here the base
    // partition must remain the first three, untouched by the composite.
    // v1.1: no layer-water — the .scene-root CSS background is the ocean.
    expect(ids.slice(0, 3)).toEqual(['layer-land', 'layer-roads', 'layer-water-detail'])
    expect(ids.slice(3)).toEqual([
      'layer-squiggles',
      'layer-city-belem',
      'layer-city-ananindeua',
      'layer-city-moju',
      'layer-artifacts',
      'layer-arrows',
    ])
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

  // --- Phase 4: city tap = raise ---------------------------------------------
  // jsdom never ticks GSAP's rAF loop, so the tween styles don't land here —
  // these tests assert the STATE contract instead (aria-pressed is the DOM
  // reflection of mount.ts's single raisedCityId owner, plus the hub events).

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

  it('raise: city click toggles aria-pressed and emits city-tap; empty-tap stays silent', () => {
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

  it('re-raise: tapping a different city moves the raise; city-tap fires per change', () => {
    const c = mountScene(host, data)
    const raised: string[] = []
    c.on('city-tap', (id) => raised.push(id))
    tapCity('belem')
    tapCity('ananindeua')
    expect(raised).toEqual(['belem', 'ananindeua'])
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'true', moju: 'false' })
    c.destroy()
  })

  it('reversal: tapping the raised city again settles everything back to rest', () => {
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

  it('reversal: tapping empty background settles the raise and emits empty-tap', () => {
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

  it('pills-hidden: ±10% hysteresis around labelK (drives the same updatePillFade the controller calls)', () => {
    const labels = document.createElement('div')
    // below 0.9 → hidden
    updatePillFade(labels, 0.8)
    expect(labels.classList.contains('pills-hidden')).toBe(true)
    // inside the hysteresis band → unchanged (still hidden)
    updatePillFade(labels, 1.0)
    expect(labels.classList.contains('pills-hidden')).toBe(true)
    // above 1.1 → shown
    updatePillFade(labels, 1.2)
    expect(labels.classList.contains('pills-hidden')).toBe(false)
    // falling back in from above does NOT re-hide inside the band
    updatePillFade(labels, 1.0)
    expect(labels.classList.contains('pills-hidden')).toBe(false)
    updatePillFade(labels, 0.8)
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

  it('keyboard: Enter raises, Space reverses, and Space never scrolls', () => {
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

  it('destroy() reverts the raise styles (StrictMode remount starts at rest)', () => {
    const first = mountScene(host, data)
    tapCity('belem')
    first.destroy()
    const second = mountScene(host, data)
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'false', moju: 'false' })
    second.destroy()
  })

  it('raise: a tap during the intro settles the entrance first (no stuck raise — opus P1)', () => {
    const c = mountScene(host, data)
    const introCalls: number[] = []
    c.onIntroDone(() => introCalls.push(1))
    // jsdom never ticks GSAP, so the intro has NOT completed here
    tapCity('belem')
    // skipIntro() ran → intro resolved AND the raise state is consistent
    expect(introCalls).toEqual([1])
    expect(pressedState()).toEqual({ belem: 'true', ananindeua: 'false', moju: 'false' })
    // and the tapped city reverses normally afterwards (no stuck raise)
    tapCity('belem')
    expect(pressedState()).toEqual({ belem: 'false', ananindeua: 'false', moju: 'false' })
    c.destroy()
  })

  it('raise: compat click with detail > 1 is ignored (double-tap zoom guard — opus P2)', () => {
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
