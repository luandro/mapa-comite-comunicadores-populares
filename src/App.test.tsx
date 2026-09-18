// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { TitleOverlay } from './App'

let host: HTMLElement
let root: Root | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
  document.documentElement.classList.remove('intro-done')
})

function renderOverlay(): void {
  act(() => {
    root = createRoot(host)
    root.render(<TitleOverlay />)
  })
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

describe('TitleOverlay (issue #10)', () => {
  it('starts expanded: title not retracted, burger not retracted (jsdom asserts the class contract)', () => {
    renderOverlay()
    const title = document.querySelector('.app-title')
    const burger = document.querySelector<HTMLElement>('.app-burger')
    expect(title).not.toBeNull()
    expect(title!.classList.contains('is-retracted')).toBe(false)
    expect(burger!.classList.contains('is-retracted')).toBe(false)
  })

  it('intro-done retracts the title after the settle delay', async () => {
    renderOverlay()
    act(() => {
      document.documentElement.classList.add('intro-done')
    })
    // retract timer is 1200 ms — await it
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1300))
    })
    const title = document.querySelector('.app-title')
    const burger = document.querySelector<HTMLElement>('.app-burger')
    expect(title!.classList.contains('is-retracted')).toBe(true)
    expect(burger!.classList.contains('is-retracted')).toBe(true)
  })

  it('burger click opens the menu (dialog with title + about); close button works', async () => {
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
    // close via ×
    const close = document.querySelector('.app-menu-close') as HTMLElement
    act(() => {
      close.click()
    })
    expect(document.querySelector('.app-menu')).toBeNull()
    // burger remains for re-opening
    expect(document.querySelector('.app-burger')).not.toBeNull()
  })

  it('backdrop click closes the menu', async () => {
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

  it('aria: burger exposes aria-expanded; menu is a labelled dialog', async () => {
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
