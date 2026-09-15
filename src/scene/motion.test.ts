// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import rawData from '../../data.json'
import { validateComiteData } from '../data/schema'
import type { ComiteData } from '../data/types'
import {
  mountCalibratedLayers,
  SQUIGGLE_MOTION,
  WAVE_DRIFT_BY_BAND,
  WAVE_DRIFT_DISTANCE,
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
})

function mountLayers() {
  const cameraNode = document.createElementNS(SVG_NS, 'g')
  host.appendChild(cameraNode)
  return { cameraNode, layers: mountCalibratedLayers(cameraNode, realData, cameraStub) }
}

describe('Phase 2 motion constants', () => {
  it('drifts each band by exactly the 2W mirror-chain period (SPEC §5)', () => {
    expect(WAVE_DRIFT_DISTANCE).toBe(4320.64) // 2 × 2160.32
  })

  it('assigns distinct durations 8/11/14 s with negative phase delays', () => {
    const bands = ['onda1', 'onda2', 'onda4'] as const
    expect(bands.map((band) => WAVE_DRIFT_BY_BAND[band].duration)).toEqual([8, 11, 14])
    for (const band of bands) {
      const { duration, delay } = WAVE_DRIFT_BY_BAND[band]
      expect(duration).toBeGreaterThan(0)
      expect(delay).toBeLessThan(0)
      expect(Math.abs(delay)).toBeLessThan(duration) // negative delay stays in-period
    }
  })

  it('keeps the squiggle sway/pulse inside the SPEC §5 10–16 s window', () => {
    expect(SQUIGGLE_MOTION.duration).toBeGreaterThanOrEqual(10)
    expect(SQUIGGLE_MOTION.duration).toBeLessThanOrEqual(16)
    expect(SQUIGGLE_MOTION.pulseDuration).toBeGreaterThan(0)
  })
})

describe('Phase 2 motion wiring on mount', () => {
  it('puts .wave-drift + duration/delay on each band AMBIENT g (never the placement)', () => {
    const { layers } = mountLayers()
    const bands = layers.waves.querySelectorAll(':scope > g[data-band]')
    expect(bands).toHaveLength(3)
    for (const band of Array.from(bands)) {
      const placement = band as SVGGElement
      expect(placement.classList.contains('wave-drift')).toBe(false) // owns translate
      expect(placement.getAttribute('transform')).toMatch(/^translate\(/)
      const ambient = placement.firstElementChild as SVGGElement
      expect(ambient.classList.contains('wave-drift')).toBe(true)
      expect(ambient.getAttribute('transform')).toBeNull() // CSS owns the drift
      const { duration, delay } =
        WAVE_DRIFT_BY_BAND[placement.dataset.band as 'onda1' | 'onda2' | 'onda4']
      expect(ambient.style.animationDuration).toBe(`${duration}s`)
      expect(ambient.style.animationDelay).toBe(`${delay}s`)
    }
  })

  it('preserves the source band opacities alongside the drift (onda2 .8, onda4 .2)', () => {
    const { layers } = mountLayers()
    const opacityOf = (band: string) =>
      layers.waves.querySelector(`g[data-band="${band}"] > g`)!.getAttribute('opacity')
    expect(opacityOf('onda1')).toBeNull()
    expect(opacityOf('onda2')).toBe('0.8')
    expect(opacityOf('onda4')).toBe('0.2')
  })

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
})

describe('Phase 2 scene.css keyframes (read as text)', () => {
  // vitest mangles `new URL(..., import.meta.url)` — resolve from cwd (AGENTS gotcha)
  const css = readFileSync(resolve(process.cwd(), 'src/scene/scene.css'), 'utf8')

  it('drifts wave-drift from 0 to the exact −4320.64 distance, linear', () => {
    expect(css).toContain('@keyframes wave-drift')
    // pin the keyframe to the TS constant so CSS and code can't diverge silently
    expect(css).toMatch(new RegExp(`wave-drift[\\s\\S]*?translateX\\(-${WAVE_DRIFT_DISTANCE}px\\)`))
    expect(css).toMatch(/\.wave-drift\s*{[^}]*animation-timing-function:\s*linear/)
    expect(css).toMatch(/\.wave-drift\s*{[^}]*animation-iteration-count:\s*infinite/)
  })

  it('defines the squiggle sway + opacity pulse and pauses both loops when hidden', () => {
    expect(css).toContain('@keyframes squiggle-drift')
    expect(css).toContain('@keyframes squiggle-pulse')
    expect(css).toMatch(/\.scene-hidden\s+\.wave-drift[\s\S]*?animation-play-state:\s*paused/)
    expect(css).toMatch(/\.scene-hidden\s+\.squiggle-drift[\s\S]*?animation-play-state:\s*paused/)
  })

  it('disables every loop under prefers-reduced-motion (SPEC §5 static fallback)', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?animation-name:\s*none/,
    )
  })
})
