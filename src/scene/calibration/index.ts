/**
 * DEV-only calibration toolbar (TODO Phase 1.5 · AGENTS invariant 10): nudges
 * layer placements against the `Mapa.jpeg` underlay and emits paste-ready
 * `placements.ts` / `initialFraming` snippets. This module tree is reached
 * ONLY through mount.ts's `import.meta.env.DEV`-gated dynamic import — the
 * underlay JPEG import below must never leak into a production bundle.
 */
import './calibration.css'
import { invalidateLabelMetrics } from '../labels'
import { visibleWindow } from '../clamp'
import type { Point } from '../../data/types'
import underlayUrl from '/na cuia/Mapa.jpeg?url'
import {
  buildTargets,
  findPlacementGroup,
  fmt,
  framingSnippet,
  placementSnippet,
  placementTransform,
  UNDERLAY_HEIGHT,
  UNDERLAY_WIDTH,
  type CalibTarget,
} from './targets'

const SVG_NS = 'http://www.w3.org/2000/svg'
const UNDERLAY_OPACITY = '0.5'
const NUDGE = 1
const NUDGE_LARGE = 10
const SCALE_STEP = 0.005
const SCALE_STEP_LARGE = 0.05
const MIN_SCALE = 0.01

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

/**
 * Attach the floating calibration toolbar. Idempotent: a second call while a
 * `[data-calibration-toolbar]` exists in the scene root is a no-op. Everything
 * the tool injects (toolbar + underlay image) lives inside `sceneRoot`, so a
 * scene remount (StrictMode/HMR) disposes it with the root; the one window
 * listener self-removes on the first keydown after that.
 */
export function attachCalibration(sceneRoot: HTMLElement, sceneSvg: SVGSVGElement): void {
  if (sceneRoot.querySelector('[data-calibration-toolbar]')) return
  const cameraNode: SVGGElement | null = sceneSvg.querySelector('#camera')
  if (!(cameraNode instanceof SVGGElement)) {
    console.warn('[calibration] no #camera group in the scene svg — toolbar not attached')
    return
  }
  // narrowed binding — closure bodies below can't reuse the instanceof narrowing
  const camera = cameraNode
  const measureSvg = sceneRoot.querySelector('svg#measure')
  const labelsEl = sceneRoot.querySelector('#labels')

  const targets = buildTargets()
  let current: CalibTarget = targets[0] // underlay

  // --- underlay (scene space: pans/zooms with the layers being calibrated) ---

  const underlayImg = document.createElementNS(SVG_NS, 'image')
  underlayImg.setAttribute('href', underlayUrl)
  underlayImg.setAttribute('width', String(UNDERLAY_WIDTH))
  underlayImg.setAttribute('height', String(UNDERLAY_HEIGHT))
  underlayImg.setAttribute('opacity', UNDERLAY_OPACITY)
  underlayImg.setAttribute('pointer-events', 'none')
  underlayImg.setAttribute('data-calibration-underlay', '')
  underlayImg.setAttribute('transform', placementTransform(current))
  // first child of #camera: bottom of the §4 stack (above the CSS ocean bg)
  camera.insertBefore(underlayImg, camera.firstChild)

  // --- toolbar DOM -----------------------------------------------------------

  const toolbar = el('div', 'calib-toolbar')
  toolbar.setAttribute('data-calibration-toolbar', '')
  toolbar.setAttribute('role', 'group')
  toolbar.setAttribute('aria-label', 'Calibração (dev)')
  toolbar.tabIndex = -1

  const head = el('div', 'calib-head')
  const title = el('span', 'calib-title')
  title.textContent = 'Calibração (dev)'
  const closeBtn = el('button', 'calib-close')
  closeBtn.type = 'button'
  closeBtn.textContent = 'Fechar'
  head.append(title, closeBtn)

  const layerField = el('label', 'calib-field')
  const layerCaption = el('span', 'calib-caption')
  layerCaption.textContent = 'Camada'
  const layerSelect = el('select', 'calib-select')
  for (const [groupLabel, kind] of [
    ['Underlay', 'underlay'],
    ['Cidades', 'city'],
    ['Textura', 'squiggle'],
  ] as const) {
    const optgroup = document.createElement('optgroup')
    optgroup.label = groupLabel
    for (const target of targets.filter((t) => t.kind === kind)) {
      const option = document.createElement('option')
      option.value = target.id
      option.textContent = target.label
      optgroup.appendChild(option)
    }
    layerSelect.appendChild(optgroup)
  }
  layerSelect.value = current.id
  layerField.append(layerCaption, layerSelect)

  const opacityField = el('label', 'calib-field')
  const opacityCaption = el('span', 'calib-caption')
  opacityCaption.textContent = 'Opacidade'
  const opacityInput = el('input', 'calib-opacity')
  opacityInput.type = 'range'
  opacityInput.min = '0'
  opacityInput.max = '1'
  opacityInput.step = '0.05'
  opacityInput.value = UNDERLAY_OPACITY
  opacityField.append(opacityCaption, opacityInput)

  const readout = el('div', 'calib-readout')
  readout.setAttribute('aria-live', 'polite')

  const actions = el('div', 'calib-row')
  const copyBtn = el('button', 'calib-btn')
  copyBtn.type = 'button'
  copyBtn.textContent = 'Copiar'
  const focusBtn = el('button', 'calib-btn')
  focusBtn.type = 'button'
  focusBtn.textContent = 'Copiar foco'
  focusBtn.title = 'Copia o centro atual da câmera como candidato a initialFraming'
  actions.append(copyBtn, focusBtn)

  function checkbox(
    text: string,
    hint: string,
  ): { wrap: HTMLLabelElement; input: HTMLInputElement } {
    const input = el('input')
    input.type = 'checkbox'
    const wrap = el('label', 'calib-toggle')
    wrap.title = hint
    const caption = el('span')
    caption.textContent = text
    wrap.append(input, caption)
    return { wrap, input }
  }

  const keys = checkbox('Teclas', 'Setas funcionam mesmo com o foco fora do painel')
  const pauseLabels = checkbox('Ocultar rótulos', 'Esconde #labels durante a calibração')
  const isolate = checkbox('Isolar', 'Escurece as demais camadas (opacidade 0.15)')
  const toggles = el('div', 'calib-row calib-toggles')
  toggles.append(keys.wrap, pauseLabels.wrap, isolate.wrap)

  const hint = el('div', 'calib-hint')
  hint.textContent = '← ↑ ↓ → mover · Shift ×10 · [ ] escala'

  toolbar.append(head, layerField, opacityField, readout, actions, toggles, hint)
  sceneRoot.appendChild(toolbar)
  toolbar.focus()

  // --- state helpers ---------------------------------------------------------

  const warnedGroups = new Set<string>()
  const layerOpacityBefore = new Map<SVGGElement, string>()
  let labelsDisplayBefore: string | null = null
  let detached = false

  function updateReadout(): void {
    const { x, y, scale } = current.placement
    readout.textContent = `x ${fmt(x, 2)} · y ${fmt(y, 2)} · escala ${fmt(scale ?? 1, 4)}`
  }

  /** Rewrite the target's live transform: underlay image or the layer's placement g. */
  function applyCurrent(): void {
    if (current.kind === 'underlay') {
      underlayImg.setAttribute('transform', placementTransform(current))
    } else {
      const group = findPlacementGroup(sceneSvg, current)
      if (!group && !warnedGroups.has(current.id)) {
        warnedGroups.add(current.id)
        console.warn(
          `[calibration] no placement group found for '${current.id}' (${current.layerId}) — ` +
            'nudges update the readout only',
        )
      }
      group?.setAttribute('transform', placementTransform(current))
    }
    updateReadout()
  }

  /** Dim every non-selected `#layer-*` group to 0.15; restore on untoggle/close. */
  function updateIsolation(): void {
    for (const child of camera.children) {
      if (!(child instanceof SVGGElement) || !child.id.startsWith('layer-')) continue
      // underlay target (layerId null) isolates against every layer
      const dim = isolate.input.checked && child.id !== current.layerId
      if (dim) {
        if (!layerOpacityBefore.has(child)) layerOpacityBefore.set(child, child.style.opacity)
        child.style.opacity = '0.15'
      } else if (layerOpacityBefore.has(child)) {
        child.style.opacity = layerOpacityBefore.get(child) ?? ''
        layerOpacityBefore.delete(child)
      }
    }
  }

  function setLabelsHidden(hidden: boolean): void {
    if (!(labelsEl instanceof HTMLElement)) return
    if (hidden) {
      if (labelsDisplayBefore === null) labelsDisplayBefore = labelsEl.style.display
      labelsEl.style.display = 'none'
    } else if (labelsDisplayBefore !== null) {
      labelsEl.style.display = labelsDisplayBefore
      labelsDisplayBefore = null
      // display:none frames measure offsetWidth 0 — the pill size cache would
      // hold {0,0} and skip push/clamp until the next resize/font event
      // (opus final-gate note 2). Drop it when the labels come back.
      invalidateLabelMetrics()
    }
  }

  /** d3-zoom writes `translate(x,y) scale(k)` on #camera (camera.ts on('zoom')). */
  function readCameraTransform(): { x: number; y: number; k: number } {
    const match = /translate\(([-\d.eE+]+)[ ,]\s*([-\d.eE+]+)\)\s*scale\(([-\d.eE+]+)\)/.exec(
      camera.getAttribute('transform') ?? '',
    )
    if (!match) return { x: 0, y: 0, k: 1 }
    const k = Number(match[3])
    return { x: Number(match[1]), y: Number(match[2]), k: k > 0 ? k : 1 }
  }

  /**
   * Scene coords of the viewport center at the current k: the visible window
   * (measurement owner's CTM inverse, camera.ts's own `win` math) un-panned by
   * the camera transform — the exact inverse of camera.ts's centering writes.
   */
  function currentFocus(): Point | null {
    const ctm = measureSvg instanceof SVGSVGElement ? measureSvg.getScreenCTM() : null
    const rect = sceneRoot.getBoundingClientRect()
    if (!ctm || rect.width === 0 || rect.height === 0) return null
    const win = visibleWindow(rect.x, rect.y, rect.width, rect.height, {
      a: ctm.a,
      b: ctm.b,
      c: ctm.c,
      d: ctm.d,
      e: ctm.e,
      f: ctm.f,
    })
    const t = readCameraTransform()
    return {
      x: ((win.x0 + win.x1) / 2 - t.x) / t.k,
      y: ((win.y0 + win.y1) / 2 - t.y) / t.k,
    }
  }

  const flashTimers = new WeakMap<HTMLButtonElement, number>()

  function flashCopied(button: HTMLButtonElement): void {
    const previous = flashTimers.get(button)
    if (previous !== undefined) window.clearTimeout(previous)
    if (!button.dataset.label) button.dataset.label = button.textContent ?? ''
    button.textContent = 'Copiado!'
    button.classList.add('calib-copied')
    flashTimers.set(
      button,
      window.setTimeout(() => {
        button.textContent = button.dataset.label ?? ''
        button.classList.remove('calib-copied')
      }, 900),
    )
  }

  async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
    let copied = false
    try {
      await navigator.clipboard.writeText(text)
      copied = true
    } catch {
      // non-secure-context fallback
      const textarea = el('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        copied = document.execCommand('copy')
      } catch {
        copied = false
      }
      textarea.remove()
    }
    if (copied) flashCopied(button)
    else console.warn('[calibration] clipboard bloqueado — snippet:', text)
  }

  // --- keyboard: nudge only when the toolbar has focus (or "Teclas" is on) ---

  function onKeydown(event: KeyboardEvent): void {
    if (detached) return
    if (!sceneRoot.isConnected) {
      // scene remounted/destroyed without Fechar — stop stealing keys
      detach()
      return
    }
    const node = event.target
    const inToolbar = node instanceof Node && toolbar.contains(node)
    if (!inToolbar && !keys.input.checked) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    // the dropdown and the slider own their arrow keys natively
    if (node instanceof HTMLElement && node.tagName === 'SELECT') return
    if (node instanceof HTMLInputElement && node.type === 'range') return

    const placement = current.placement
    const move = event.shiftKey ? NUDGE_LARGE : NUDGE
    switch (event.key) {
      case 'ArrowLeft':
        placement.x -= move
        break
      case 'ArrowRight':
        placement.x += move
        break
      case 'ArrowUp':
        placement.y -= move
        break
      case 'ArrowDown':
        placement.y += move
        break
      default: {
        const step = event.shiftKey ? SCALE_STEP_LARGE : SCALE_STEP
        const scale = placement.scale ?? 1
        // layout-stable keys: BracketLeft/Right survive non-US keyboard layouts
        if (event.code === 'BracketLeft') {
          placement.scale = Math.max(MIN_SCALE, +(scale - step).toFixed(6))
        } else if (event.code === 'BracketRight') {
          placement.scale = Math.max(MIN_SCALE, +(scale + step).toFixed(6))
        } else {
          return
        }
      }
    }
    event.preventDefault()
    applyCurrent()
  }

  // --- teardown --------------------------------------------------------------

  function detach(): void {
    if (detached) return
    detached = true
    window.removeEventListener('keydown', onKeydown)
    underlayImg.remove()
    for (const [group, opacity] of layerOpacityBefore) group.style.opacity = opacity
    layerOpacityBefore.clear()
    if (labelsDisplayBefore !== null && labelsEl instanceof HTMLElement) {
      labelsEl.style.display = labelsDisplayBefore
    }
    toolbar.remove()
  }

  // --- wiring ----------------------------------------------------------------

  layerSelect.addEventListener('change', () => {
    current = targets.find((t) => t.id === layerSelect.value) ?? current
    updateReadout()
    updateIsolation()
  })

  opacityInput.addEventListener('input', () => {
    underlayImg.setAttribute('opacity', opacityInput.value)
  })

  copyBtn.addEventListener('click', () => void copyText(placementSnippet(current), copyBtn))

  focusBtn.addEventListener('click', () => {
    const focus = currentFocus()
    if (!focus) {
      console.warn('[calibration] CTM indisponível — copie o foco depois do primeiro layout')
      return
    }
    void copyText(framingSnippet(focus), focusBtn)
  })

  pauseLabels.input.addEventListener('change', () => setLabelsHidden(pauseLabels.input.checked))
  isolate.input.addEventListener('change', updateIsolation)
  closeBtn.addEventListener('click', detach)
  window.addEventListener('keydown', onKeydown)

  updateReadout()
}
