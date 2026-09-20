// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { TitleOverlay } from './App'
import * as device from './device'

let host: HTMLElement
let root: Root | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  // jsdom ships no matchMedia; isMobile() caches per module, so every test
  // picks its device class by resetting the cache after stubbing
  // (pointer: coarse -> mobile retracts into the burger; desktop keeps the
  // title and shows the info button - user directive).
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  )
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
  vi.unstubAllGlobals()
  device.resetIsMobileCache()
  document.documentElement.classList.remove('intro-done')
})

function renderOverlay(): void {
  act(() => {
    root = createRoot(host)
    root.render(<TitleOverlay />)
  })
}

function useCoarsePointer(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)',
      addEventListener: vi.fn(),
    })),
  )
  device.resetIsMobileCache()
}

/** Fire the html.intro-done class the scene toggles, flush the retract timer. */
async function settleIntro(): Promise<void> {
  act(() => {
    document.documentElement.classList.add('intro-done')
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1300))
  })
}

describe('TitleOverlay (issue #10 - mobile behavior)', () => {
  it('mobile: starts expanded: title not retracted, burger not retracted (jsdom asserts the class contract)', () => {
    useCoarsePointer()
    renderOverlay()
    const title = document.querySelector('.app-title')
    const burger = document.querySelector<HTMLElement>('.app-burger')
    expect(title).not.toBeNull()
    expect(title!.classList.contains('is-retracted')).toBe(false)
    expect(burger!.classList.contains('is-retracted')).toBe(false)
  })

  it('mobile: intro-done retracts the title after the settle delay', async () => {
    useCoarsePointer()
    renderOverlay()
    act(() => {
      document.documentElement.classList.add('intro-done')
    })
    // retract timer is 1200 ms - await it
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1300))
    })
    const title = document.querySelector('.app-title')
    const burger = document.querySelector<HTMLElement>('.app-burger')
    expect(title!.classList.contains('is-retracted')).toBe(true)
    expect(burger!.classList.contains('is-retracted')).toBe(true)
  })

  it('mobile: retract measures the blob and lands it on the burger rect', async () => {
    useCoarsePointer()
    renderOverlay()

    const title = document.querySelector('.app-title') as HTMLElement
    const burger = document.querySelector('.app-burger') as HTMLElement
    const titleRect = {
      x: 12,
      y: 10,
      left: 12,
      top: 10,
      width: 366,
      height: 59,
      right: 378,
      bottom: 69,
    } as DOMRect
    const burgerRect = {
      x: 12,
      y: 8,
      left: 12,
      top: 8,
      width: 56,
      height: 44,
      right: 68,
      bottom: 52,
    } as DOMRect
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(titleRect)
    vi.spyOn(burger, 'getBoundingClientRect').mockReturnValue(burgerRect)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)

    await settleIntro()

    const blobInsetX = 8
    const blobInsetY = 5
    const blobLeft = titleRect.left - blobInsetX
    const blobTop = titleRect.top - blobInsetY
    const blobWidth = titleRect.width + blobInsetX * 2
    const blobHeight = titleRect.height + blobInsetY * 2
    const expectedSx = burgerRect.width / blobWidth
    const expectedSy = burgerRect.height / blobHeight
    const expectedTx = burgerRect.left - titleRect.left - (blobLeft - titleRect.left) * expectedSx
    const expectedTy = burgerRect.top - titleRect.top - (blobTop - titleRect.top) * expectedSy

    const actualSx = Number.parseFloat(title.style.getPropertyValue('--morph-sx'))
    const actualSy = Number.parseFloat(title.style.getPropertyValue('--morph-sy'))
    const actualTx = Number.parseFloat(title.style.getPropertyValue('--morph-tx'))
    const actualTy = Number.parseFloat(title.style.getPropertyValue('--morph-ty'))
    expect(actualSx).toBeCloseTo(expectedSx, 6)
    expect(actualSy).toBeCloseTo(expectedSy, 6)
    expect(actualTx).toBeCloseTo(expectedTx, 6)
    expect(actualTy).toBeCloseTo(expectedTy, 6)

    // The title-local transform puts the inflated blob's viewport edges on
    // the burger's border-box edges after scaling.
    expect(titleRect.left + actualTx + (blobLeft - titleRect.left) * actualSx).toBeCloseTo(
      burgerRect.left,
      6,
    )
    expect(titleRect.top + actualTy + (blobTop - titleRect.top) * actualSy).toBeCloseTo(
      burgerRect.top,
      6,
    )
    expect(blobWidth * actualSx).toBeCloseTo(burgerRect.width, 6)
    expect(blobHeight * actualSy).toBeCloseTo(burgerRect.height, 6)
  })

  it('mobile: burger click opens the menu (dialog with title + about); close button works', async () => {
    useCoarsePointer()
    renderOverlay()
    await settleIntro()
    const burger = document.querySelector('.app-burger') as HTMLElement
    act(() => {
      burger.click()
    })
    const menu = document.querySelector('.app-menu')
    expect(menu).not.toBeNull()
    expect(document.getElementById('app-menu-title')).not.toBeNull()
    expect(menu!.textContent).toContain('coletivos')
    // close via x
    const close = document.querySelector('.app-menu-close') as HTMLElement
    act(() => {
      close.click()
    })
    expect(document.querySelector('.app-menu')).toBeNull()
    // burger remains for re-opening
    expect(document.querySelector('.app-burger')).not.toBeNull()
  })

  it('mobile: backdrop click closes the menu', async () => {
    useCoarsePointer()
    renderOverlay()
    await settleIntro()
    act(() => {
      ;(document.querySelector('.app-burger') as HTMLElement).click()
    })
    expect(document.querySelector('.app-menu')).not.toBeNull()
    act(() => {
      ;(document.querySelector('.app-menu-backdrop') as HTMLElement).click()
    })
    expect(document.querySelector('.app-menu')).toBeNull()
  })

  it('mobile: aria: burger exposes aria-expanded; menu is a labelled dialog', async () => {
    useCoarsePointer()
    renderOverlay()
    await settleIntro()
    const burger = document.querySelector('.app-burger') as HTMLElement
    expect(burger.getAttribute('aria-expanded')).toBe('false')
    act(() => {
      burger.click()
    })
    expect(burger.getAttribute('aria-expanded')).toBe('true')
    const menu = document.querySelector('.app-menu')
    expect(menu!.getAttribute('aria-labelledby')).toBe('app-menu-title')
  })

  it('close button paints above the menu title blob; blob never intercepts pointers', () => {
    // jsdom applies no stylesheets — pin the contract on the CSS source.
    // The .app-menu-title blob overflows its box (inset -4px -8px) and, as a
    // later sibling, painted OVER .app-menu-close: elementFromPoint at the
    // button's center returned the blob on 390x844 AND 1600x900 (probe:
    // graft/.cache/checks/close-probe.mjs). The fix is two-sided: the button
    // wins paint order, and the decorative blob can never intercept a
    // pointer anywhere.
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    expect(css).toMatch(/\.app-menu-close\s*\{[^}]*z-index:\s*1/)
    expect(css).toMatch(/\.app-title-blob\s*\{[^}]*pointer-events:\s*none/)
    // Opus r1 P2: the morph math inflates the measured title rect by the
    // blob insets via MOBILE_TITLE_BLOB_INSET_X/Y in App.tsx — if the CSS
    // inset ever changes without the constants, the blob silently lands off
    // the burger. Pin the agreement: the ≤640px rule carries the
    // "synchronized with the inflation constants" comment; the coarse rule
    // repeats the same values at every width.
    const coarseBlock = css.slice(css.indexOf('(pointer: coarse)'))
    expect(coarseBlock).toMatch(
      /\.app-title\s*>\s*\.app-title-blob\s*\{[^}]*inset:\s*-5px\s+-8px[^}]*\}/,
    )
    expect(css).toMatch(/-5px\/-8px synchronized with the inflation constants/)
  })
})

describe('TitleOverlay (desktop: static title + info button - user directive)', () => {
  it('desktop: title never retracts and no burger exists, even after intro-done + timer', async () => {
    renderOverlay()
    await settleIntro()
    expect(document.querySelector('.app-title')!.classList.contains('is-retracted')).toBe(false)
    expect(document.querySelector('.app-burger')).toBeNull()
  })

  it('desktop: info button is present, labelled, and opens the centered about dialog', async () => {
    renderOverlay()
    const info = document.querySelector('.app-info') as HTMLElement
    expect(info).not.toBeNull()
    expect(info.getAttribute('aria-label')).toBe('Sobre o projeto')
    expect(info.getAttribute('aria-expanded')).toBe('false')
    act(() => {
      info.click()
    })
    const menu = document.querySelector('.app-menu')
    expect(menu).not.toBeNull()
    expect(document.getElementById('app-menu-title')).not.toBeNull()
    expect(info.getAttribute('aria-expanded')).toBe('true')
    act(() => {
      ;(document.querySelector('.app-menu-close') as HTMLElement).click()
    })
    expect(document.querySelector('.app-menu')).toBeNull()
    // info button remains for re-opening
    expect(document.querySelector('.app-info')).not.toBeNull()
  })

  it('desktop: backdrop click closes the menu opened from the info button', async () => {
    renderOverlay()
    act(() => {
      ;(document.querySelector('.app-info') as HTMLElement).click()
    })
    expect(document.querySelector('.app-menu')).not.toBeNull()
    act(() => {
      ;(document.querySelector('.app-menu-backdrop') as HTMLElement).click()
    })
    expect(document.querySelector('.app-menu')).toBeNull()
  })
})
