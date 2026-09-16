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
- Labels wrap the canonical full organization names; static box collisions
  are resolved by `resolveLabelPush` (pure function in `labels.ts`: sort
  boxes by top y, push colliders straight down until clear with a 4px gap).
  The push is applied on the anchor translate — not the pill's GSAP
  properties — and decays to 0 as zoom separates the anchors. An editorial
  short-name field remains outside this close-out scope.

## Validation

Numeric gate (ceil in parentheses):

- belem: IoU 0.589 (0.589), centroid 76, area 0.788, seaΔ 0.026
- ananindeua: IoU 0.816 (0.816), centroid 9, area 1.026, seaΔ 0.033
- moju: IoU 0.818 (0.818), centroid 12, area 1.012, seaΔ 0.000
- E portrait check: pass

App gates all green: build, lint, 117 vitest tests, `prettier --check`,
smoke suite.

Final comparison sheet: `graft/.cache/gate/final-sheet-sbs-3.png`.

Accepted deviations:

- Belém mass ~20% thinner than the poster (asset shape; needs a user-approved
  SPEC §3 exception).
- Poster totems are drawn larger than app icons (UX).
- Mobile k=1 crop clips the right cluster (pan/zoom affordance).
