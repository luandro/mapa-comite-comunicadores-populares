/**
 * Phase 7 zoom controls (SPEC §3): React-owned buttons calling the scene
 * controller's zoomBy/reset. Above #labels (AGENTS 12 z-order).
 */
import { ui } from '../data/ui'

interface ControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function Controls({ onZoomIn, onZoomOut, onReset }: ControlsProps) {
  return (
    <div className="app-controls" role="group" aria-label={ui.labels.controlsGroup}>
      <button type="button" onClick={onZoomIn} aria-label={ui.labels.zoomIn}>
        +
      </button>
      <button type="button" onClick={onZoomOut} aria-label={ui.labels.zoomOut}>
        −
      </button>
      <button type="button" onClick={onReset} aria-label={ui.labels.reset}>
        ⌂
      </button>
    </div>
  )
}
