// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { pillsHiddenFor, updatePillFade } from './labels'

// Zoom-out context map: K_MIN = 0.55 makes k < 1 a resting state, so the pill
// hysteresis band moved entirely BELOW 1 — reset() lands at exactly k = 1 and
// must clear pills-hidden there (the old >1.1 show edge left pills hidden
// after reset). pillsHiddenFor itself keeps its 0.9 hide edge, pure.

describe('pillsHiddenFor (pure hide decision)', () => {
  it('hides below 0.9·labelK (0.6 — the K_MIN zoom-out state, pinned contract)', () => {
    expect(pillsHiddenFor(0.6)).toBe(true)
  })

  it('does not hide inside the band (0.95) or above labelK (1.0)', () => {
    expect(pillsHiddenFor(0.95)).toBe(false)
    expect(pillsHiddenFor(1.0)).toBe(false)
  })
})

describe('updatePillFade (band [0.9, 1.0) holds state; k ≥ 1 shows)', () => {
  it('a hidden layer at k=0.6 LOSES pills-hidden at exactly k=1.0', () => {
    const el = document.createElement('div')
    el.classList.add('pills-hidden')
    updatePillFade(el, 1.0)
    expect(el.classList.contains('pills-hidden')).toBe(false)
  })

  it('keeps pills-hidden at k=0.95 (inside the band — no flicker at the edge)', () => {
    const el = document.createElement('div')
    el.classList.add('pills-hidden')
    updatePillFade(el, 0.95)
    expect(el.classList.contains('pills-hidden')).toBe(true)
  })

  it('a shown layer hides again below 0.9 (k=0.6)', () => {
    const el = document.createElement('div')
    updatePillFade(el, 0.6)
    expect(el.classList.contains('pills-hidden')).toBe(true)
  })
})
