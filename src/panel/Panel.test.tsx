// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import type { Project } from '../data/types'
import { Panel } from './Panel'

// jsdom ships no ResizeObserver; the wave-overlay rect-sync owns one on the
// panel. Structure-only stub (same pattern as src/scene/mount.test.ts).
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub
}

const fullProject: Project = {
  name: 'NA CUIA (BELÉM)',
  conflitos: ['Grilagem na várzea'],
  acao: ['Rádio comunitária'],
  identificacao_e_territorio: ['Ilha do Combu'],
  futuro: [],
  memoria: [],
  identidade: ['Comunicadores populares'],
}

const emptyProject: Project = {
  name: 'ORG VAZIA',
  conflitos: [],
  acao: [],
  identificacao_e_territorio: [],
  futuro: [],
  memoria: [],
  identidade: [],
}

let host: HTMLElement
let root: Root | null = null

/** The inert target: the scene host div (sibling before the panel host). */
function panelBackground(): Element {
  return document.getElementById('scene-host')!
}

beforeEach(() => {
  document.body.innerHTML = '<main><div id="scene-host"></div><div id="panel-host"></div></main>'
  host = document.getElementById('panel-host')!
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
})

function renderPanel(project: Project | null, onClose: () => void, mobile = false): void {
  act(() => {
    root = createRoot(host)
    // inertTarget points at the test's scene host (App passes the real one)
    root.render(
      <Panel project={project} onClose={onClose} mobile={mobile} inertTarget="#scene-host" />,
    )
  })
}

describe('Panel (Phase 6)', () => {
  it('closed → renders nothing', () => {
    renderPanel(null, () => {})
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders org name + ONLY non-empty sections (whitelist order)', () => {
    renderPanel(fullProject, () => {})
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-labelledby')).toBe('panel-heading')
    expect(document.getElementById('panel-heading')!.textContent).toBe('NA CUIA (BELÉM)')
    const headings = Array.from(document.querySelectorAll('.panel-section h3')).map(
      (h) => h.textContent,
    )
    // futuro/memória are empty → hidden
    expect(headings).toEqual(['Conflitos', 'Ação', 'Identificação e território', 'Identidade'])
  })

  it('empty org → panel with heading and no sections', () => {
    renderPanel(emptyProject, () => {})
    expect(document.getElementById('panel-heading')!.textContent).toBe('ORG VAZIA')
    expect(document.querySelectorAll('.panel-section')).toHaveLength(0)
  })

  it('backdrop click closes (empty-tap path stays reachable while scene is inert — review P1)', () => {
    let closed = 0
    const onClose = (): void => {
      closed += 1
    }
    renderPanel(fullProject, onClose)
    expect(document.querySelector('.panel-backdrop')).toBeTruthy()
    act(() => {
      ;(document.querySelector('.panel-backdrop') as HTMLElement).click()
    })
    expect(closed).toBe(1)
  })

  it('dialog lifecycle: initial focus, background inert, body scroll lock, focus return', () => {
    const opener = document.createElement('button')
    opener.textContent = 'opener'
    document.getElementById('scene-host')!.appendChild(opener)
    opener.focus()

    renderPanel(fullProject, () => {})
    // initial focus on the close button
    expect(document.activeElement).toBe(document.querySelector('.panel-close'))
    // background (inertTarget = #scene-host) inert + fixed-technique scroll lock
    expect(panelBackground().hasAttribute('inert')).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.style.position).toBe('fixed')

    act(() => root!.unmount())
    root = null
    // focus returned, locks released
    expect(document.activeElement).toBe(opener)
    expect(panelBackground().hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
    expect(document.body.style.position).toBe('')
  })

  it('Esc and × both close', () => {
    let closed = 0
    const onClose = (): void => {
      closed += 1
    }
    renderPanel(fullProject, onClose)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(closed).toBe(1)
    act(() => {
      ;(document.querySelector('.panel-close') as HTMLElement).click()
    })
    expect(closed).toBe(2)
  })

  it('focus trap: Tab cycles within the panel (single focusable → stays on it)', () => {
    renderPanel(fullProject, () => {})
    const close = document.querySelector('.panel-close') as HTMLElement
    close.focus()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    })
    expect(document.activeElement).toBe(close)
  })

  it('mobile flag switches the class', () => {
    renderPanel(fullProject, () => {}, true)
    expect(document.querySelector('.panel-frame')!.classList.contains('panel-mobile')).toBe(true)
  })
})
