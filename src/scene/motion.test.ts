// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import rawData from '../../data.json'
import { validateComiteData } from '../data/schema'
import type { ComiteData } from '../data/types'
import { mountCalibratedLayers, SQUIGGLE_MOTION } from './layers'
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
})

function mountLayers() {
  const cameraNode = document.createElementNS(SVG_NS, 'g')
  host.appendChild(cameraNode)
  return { cameraNode, layers: mountCalibratedLayers(cameraNode, realData, cameraStub) }
}

describe('Phase 2 motion constants', () => {
  it('keeps the squiggle sway/pulse inside the SPEC §5 10–16 s window', () => {
    expect(SQUIGGLE_MOTION.duration).toBeGreaterThanOrEqual(10)
    expect(SQUIGGLE_MOTION.duration).toBeLessThanOrEqual(16)
    expect(SQUIGGLE_MOTION.pulseDuration).toBeGreaterThan(0)
  })
})

describe('Phase 2 motion wiring on mount', () => {
  it('puts .squiggle-drift with split drift/pulse durations on the squiggle ambient g', () => {
    const { layers } = mountLayers()
    const placement = layers.squiggles.firstElementChild as SVGGElement
    expect(placement.getAttribute('transform')).toMatch(/^translate\(/)
    expect(placement.classList.contains('squiggle-drift')).toBe(false)
    const ambient = placement.firstElementChild as SVGGElement
    expect(ambient.classList.contains('squiggle-drift')).toBe(true)
    expect(ambient.getAttribute('transform')).toBeNull()
    expect(ambient.style.animationDuration).toBe(
      `${SQUIGGLE_MOTION.duration}s, ${SQUIGGLE_MOTION.pulseDuration}s`,
    )
  })

  it('mounts no wave bands and no .wave-drift anywhere (v1.1 — big water animation removed)', () => {
    const { cameraNode } = mountLayers()
    expect(cameraNode.querySelector('#layer-waves')).toBeNull()
    expect(cameraNode.querySelector('[data-band]')).toBeNull()
    expect(cameraNode.querySelector('.wave-drift')).toBeNull()
  })
})

describe('Phase 2 scene.css keyframes (read as text)', () => {
  // vitest mangles `new URL(..., import.meta.url)` — resolve from cwd (AGENTS gotcha)
  const css = readFileSync(resolve(process.cwd(), 'src/scene/scene.css'), 'utf8')

  it('retired the wave-band drift keyframes entirely (v1.1)', () => {
    expect(css).not.toContain('wave-drift')
  })

  it('defines the squiggle sway + opacity pulse and pauses the loop when hidden', () => {
    expect(css).toContain('@keyframes squiggle-drift')
    expect(css).toContain('@keyframes squiggle-pulse')
    expect(css).toMatch(/\.scene-hidden\s+\.squiggle-drift[\s\S]*?animation-play-state:\s*paused/)
  })

  it('disables every loop under prefers-reduced-motion (SPEC §5 static fallback)', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?animation-name:\s*none/,
    )
  })

  it('the ocean is the .scene-root CSS background (v1.1 — sea rect unmounted)', () => {
    expect(css).toMatch(/\.scene-root\s*{[^}]*background:\s*#5da9a9/)
  })

  it('issue #12: focus rings are keyboard-only drop-shadow halos, never outlines', () => {
    // the outline rectangle on g[data-*-id] is gone entirely…
    expect(css).not.toContain('outline: 3px solid #304e23')
    // …replaced by outline: none + the .is-kbd-focus halo mount.ts toggles
    expect(css).toMatch(/g\[data-(city|artifact)-id\]:focus-visible\s*,?\s*\{[^}]*outline:\s*none/)
    expect(css).toMatch(
      /g\[data-(city|artifact)-id\]\.is-kbd-focus:focus-visible\s*,?[^{]*\{[^}]*drop-shadow/,
    )
  })
})

describe('layer-context zoom-out reveal (SPEC §4, opus r1 P2)', () => {
  const css = () => readFileSync(resolve(process.cwd(), 'src/scene/scene.css'), 'utf8')

  it('pins the context layer invisible at the home framing (default opacity 0)', () => {
    const m = css().match(/#layer-context\s*{[^}]*}/)
    expect(m).not.toBeNull()
    expect(m![0]).toMatch(/opacity:\s*0/)
    // transform/opacity-only contract + never intercepts taps
    expect(m![0]).toMatch(/pointer-events:\s*none/)
  })

  it('pins the zoom-out band attributes (near/far) and the transition', () => {
    const cssText = css()
    expect(cssText).toMatch(/#layer-context\[data-zoom-out='near']\s*{[^}]*opacity:\s*0\.35/)
    expect(cssText).toMatch(/#layer-context\[data-zoom-out='far']\s*{[^}]*opacity:\s*1/)
    expect(cssText).toMatch(/#layer-context\s*{[^}]*transition:\s*opacity/)
  })
})
