import type { Point } from '../data/types'
import type { Box, FlyToOptions } from './types'

/** One deselect fly-back (issue #11): the target box plus its flyTo options. */
export interface UnfocusFlight {
  box: Box
  opts: FlyToOptions
}

/**
 * Where an artifact deselect flies the camera back (issue #11): the framing
 * captured before focusArtifact's fly when one exists, else the initial
 * framing. The captured box is restored verbatim under padding 0 — flyTo then
 * recomputes exactly the captured k from the box's own size, so the camera
 * re-frames the same content (a window resized in between rescales it). The
 * fallback is a zero-area box at the framing point capped at k = 1: the same
 * centered-then-clamped k = 1 target reset() flies to.
 */
export function unfocusFlight(captured: Box | null, initial: Point): UnfocusFlight {
  if (captured) return { box: captured, opts: { padding: 0 } }
  return {
    box: { x: initial.x, y: initial.y, width: 0, height: 0 },
    // k pinned at exactly 1 on both edges: this is the reset() target — the
    // default K_MIN floor must not turn the empty point box into a zoom-out.
    opts: { padding: 0, maxK: 1, minK: 1 },
  }
}
