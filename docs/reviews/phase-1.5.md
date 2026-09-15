# Phase 1.5 — Static composite & calibration checkpoint (review evidence)

**Date:** 2026-09-15 · **Reviewer:** codex (gpt-5.6-sol, read-only) — next in
rotation per the parity ledger (commit 2 → codex); special gate does not consume
parity. · **Verdict:** see REVIEW VERDICT below.

## Scope reviewed

Static composite of ALL layer types (base partition, 3 wave bands as 3-copy
mirror chains, squiggle texture, 3 city land masses, 11 org artifact totems,
authored Bézier arrows + source dots, controller-owned label layer) + DEV
calibration tool. No motion. Commits `e1b5e17` (composite + tool), `7a4e5b7`
(underlay calibration), `4f49a4c` (city placements) + working tree
(org pos/from first pass, initialFraming).

## Calibration method (reproducible)

- **Underlay ↔ `mapa cru`:** full-scene Playwright render at 3024×2022
  (scene units 1:1 under slice cover, k=1) → PIL teal-sea mask correlation
  (grid search over uniform scale + translation, 4 refinement rounds;
  final mismatch 0.206) → `translate(-300, 5) scale(1.895)`. Verified
  visually: the calibrated underlay render is framing-identical to the raw
  `Mapa.jpeg` (side-by-side, `graft/.cache/calib/underlay-solo.png`).
- **Cities:** dark-green mask connected components + vision envelopes on the
  mockup, mapped through the underlay transform; uniform scale only
  (aspect drift 4–8 % = hand-drawn source asymmetry, preserved by design —
  normalization is a defect per SPEC §13).
- **Org pos/from:** totem-pole base positions read from the mockup
  (fractions → photo px → scene coords via the same transform); every
  `pos` and `from` point schema-validated in-rect (POS_MARGIN=0).
- **initialFraming:** densest org cluster (Belém mainland bottom-center,
  `{x: 1450, y: 1250}`) so portrait first paint centers content.

## Evidence

- `graft/.cache/calib/fidelity-sheet.png` — mockup vs app landscape (1512×1011)
  vs app portrait (390×844), timestamped 2026-09-15T12-48-32.
- Gates: `bun run build` ✅ · `bun run lint` ✅ · `bun run test` 71/71 ✅ ·
  `bunx prettier --check .` ✅.

## Fidelity notes (asymmetry preserved)

- Irregular coastlines, uneven org spacing and the mockup's hand-drawn
  irregularities are preserved — positions were transcribed, not regularized.
- Wave rows sit in the upper-left sea wedge (y 330/490/650, first pass);
  the mockup's open water is unmarked flat teal — row positions are a
  composition choice to be re-checked when motion lands (Phase 2 gate).
- Squiggle texture first-pass `y=32` (width-fit ×1.3994 preserved).

## REVIEW VERDICT

(to be filled by the senior reviewer: findings P0–P3 with concrete fixes,
then APPROVE or REQUEST_CHANGES)
