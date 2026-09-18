// @vitest-environment jsdom
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
