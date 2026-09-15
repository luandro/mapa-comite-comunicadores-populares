/**
 * Phase 7 zoom controls (SPEC §3): React-owned buttons calling the scene
 * controller's zoomBy/reset. Above #labels (AGENTS 12 z-order).
 */
interface ControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function Controls({ onZoomIn, onZoomOut, onReset }: ControlsProps) {
  return (
    <div className="app-controls" role="group" aria-label="Controles do mapa">
      <button type="button" onClick={onZoomIn} aria-label="Aproximar">
        +
      </button>
      <button type="button" onClick={onZoomOut} aria-label="Afastar">
        −
      </button>
      <button type="button" onClick={onReset} aria-label="Redefinir vista">
        ⌂
      </button>
    </div>
  )
}
