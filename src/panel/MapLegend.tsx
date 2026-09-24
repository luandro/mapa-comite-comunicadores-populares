/**
 * v1.7 desktop map legend (user directive): the section key lives on the MAP,
 * bottom-left, ALWAYS visible — including while the content panel is open
 * (z-index above .panel-frame). Desktop only (coarse pointers keep the
 * in-panel visible labels, the approved v1.5 mobile layout). Static key —
 * icon + label rows, no actions; the modal keeps its own sr-only headings
 * for the accessibility tree.
 */
import { SECTION_KEYS } from '../data/types'
import { ui } from '../data/ui'
import { SECTION_ICONS, sectionLabel } from './sections'

export function MapLegend() {
  return (
    <aside className="map-legend" aria-labelledby="map-legend-title">
      <h2 id="map-legend-title" className="map-legend-title">
        {ui.labels.legendTitle}
      </h2>
      <ul className="map-legend-list">
        {SECTION_KEYS.map((key) => (
          <li key={key} className="map-legend-entry">
            <img src={SECTION_ICONS[key]} alt="" aria-hidden="true" />
            <span>{sectionLabel(key)}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
