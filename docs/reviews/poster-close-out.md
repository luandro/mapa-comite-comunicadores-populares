# Poster alignment close-out — 2026-09-16

Ground truth: `graft/.cache/gate/ref/poster.jpg`. This continuation supersedes
older `Mapa.jpeg` comparisons and the last section's unverified “none in open
water” claim in `v1.0.1-fidelity.md`. No city placements, framing, SVG artwork,
or gate thresholds are changed by this continuation.

The interrupted title work was recovered and committed first after build,
lint, all 112 tests, formatting, and browser smoke passed. A pre-existing
formatting discrepancy in `layers.ts` was normalized with Prettier.

## Continuation round 1

Defects addressed:

- Title: the responsive two-line navy poster heading now has a broad aqua blob.
- Org labels: compact brown boxes with cream, centered multiline text below
  totem bases replace single-line cream pills above them.
- City labels: content names are Belém and Ananindeua; an empty Moju map entry
  supplies its label without renderer special cases.
- Totems: base-anchored artwork grows from 110 to 190 scene units. Layer tests
  pin the height and translation; label tests pin names, count and below-base
  GSAP offsets, with SPEC updated in the same implementation commit.
- Coordinate corrections: only CABA and Centro de Educação Popular org bases
  move onto dry land; five out-of-mass arrow sources move to nearby mass edges.

## Accepted limits

- The Belém silhouette/bay mismatch is an asset limitation. IoU is at the
  documented 0.589 ceiling; translating or scaling the city to chase its fill
  centroid would spoil the accepted composition. Asset edits need a separate
  user decision. Ananindeua and Moju likewise sit at their documented ceilings.
- The cover-only portrait view deliberately crops the scene. Existing E uses
  Belém centroid visibility, at least 50% Ananindeua visibility and at least
  three org anchors; it does not require both historical hubs in view.
- Existing icon artwork remains a placeholder. 190-unit sizing is shipped;
  replacing the artwork or matching each poster illustration is separate work.
- Labels wrap the canonical full organization names. A collision-avoidance
  system or editorial short-name field remains outside this close-out scope.

Validation and final metrics are recorded below after the fresh-mask and
visual comparison gates complete.
