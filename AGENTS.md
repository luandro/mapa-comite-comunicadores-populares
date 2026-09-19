# AGENTS.md — Na Cuia · interactive illustrated map

Read `SPEC.md` first — it is the source of truth for behavior and design decisions (rev 5: post review-loop + external advisory fold).

## What this is

Single-page interactive animated map (Belém/Ananindeua/Moju collectives). Hand-drawn SVG collage from `na cuia/icons/svg/` — **no map library**. React owns UI (panel, title, controls); the animated scene is an imperative TypeScript island **outside** the React tree, behind one `SceneController` (SPEC §10). Never render the animated SVG via JSX.

## Commands (after scaffold)

```bash
bun install        # bun is the repo default package manager
bun run dev        # Vite dev server
bun run build      # typecheck + production build
bun run lint       # ESLint
bun run test       # Vitest
```

## Architecture invariants

1. **Scene space**: one inline `<svg viewBox="0 0 3023.11 2021.19" preserveAspectRatio="xMidYMid slice">` (= `mapa cru.svg` native; `slice` = native cover). Layers are `<g id="layer-*">` in SPEC §4 order. All positions are scene coords.
2. **No shared coordinates between asset files** (verified): every non-base asset needs its calibrated transform from `src/scene/placements.ts` (which also exports `initialFraming`).
3. **`Mapa geral.svg`, `quadro 2.svg`, all PNGs, `Mapa cuia.ai` are reference-only** — never inline them into the app. Sole exception: the DEV-only calibration tool may render `Mapa.jpeg` as its underlay (`import.meta.env.DEV`-gated, zero prod bytes).
4. **Partition `mapa cru` by resolved fill hex, never by class name** — SVGO `prefixIds` renames classes. Ground truth: sea = 1 `<rect>` `#5da9a9` (**v1.1: not mounted** — the `.scene-root` CSS background is the ocean; counts exclude it); land = 42 nodes (41 path + 1 polygon) `#95c98e`; roads = 5 `#58b254`; water-detail = 17 marks + 3 river, mounted **above** roads (source paint order). Mount asserts counts 42/5/20 = 67 above the cut sea; mismatch = hard error. The pipeline resolves **all** declared style properties (`fill`, `opacity`, …) to attributes.
5. **RETIRED v1.1** — the `onda 1/2/4` wave-band system (3-copy `[A][A′][A]` mirror chains, `wave-drift` keyframes, `wavePlacements`) was removed at user request; the ocean is the `.scene-root` CSS background `#5da9a9` (scene.css). The ondinhas squiggle (`squiggle-drift` + `squiggle-pulse`) remains the only water animation. A CSS water animation (gradients/ripples) is deferred, not dropped.
6. **Nested transform wrappers**: placement `<g transform>` → interaction `<g>` (GSAP) → ambient `<g>` (CSS). Never two transform owners on one node — CSS animations win the cascade. Camera on a separate ancestor.
7. **Animation split**: ambient = CSS keyframes, whole-group, transform/opacity only. Interactions = GSAP timelines. Dash-draw/shadow are interaction-transients, the only exceptions. SMIL/WAAPI: no.
8. **Camera**: all state through d3-zoom's `zoom.transform`; GSAP writes every frame through it; user gesture cancels fly-to; per-frame clamping; **`slice` does cover** — camera is a pure multiplier `k ∈ [0.55, 4]`, `k_max = 4`, `k_min = 0.55` (zoom-out reveals `layer-context`), no hand-derived scale factors; **`zoom.extent` set explicitly** (default reads the viewBox, wrong under `slice` in portrait) via the **measurement owner** — an untransformed full-viewport `<svg id="measure">` outside the camera wrapper whose CTM never contains camera transforms (primary **and** fallback mode) — viewport corners through its `getScreenCTM().inverse()`, recomputed on resize (Vitest: 16:9 + 9:19.5, both modes); clamp domain = union(scene rect, hit-target bounds); `ResizeObserver` recompute always against the **full viewport**; `setObstruction` is **desktop-only** (mobile `null`) and **extends the clamp domain on the obstructed side** so focus targets sit beside the drawer; `null` re-clamps with a short tween; hit circles kept ≥ 24 CSS px diameter: `u = measureCtm.a × k` with `k` from **controller state, never DOM reads**, hold `r_scene ≥ 12/u` in `onTransform` — measured, never derived.
9. **`data.json` is canonical.** Panel renders only the six whitelisted section keys, empty sections hidden — never `icon`/`pos`. UI pt-BR.
10. **Honest data promise**: new org = content-only edits (data.json + optional icon) — no TypeScript changes; art choice + `pos` calibration remain human steps (dev calibration tool ships in Phase 1.5; org coords finalize in Phase 5). Icons glob: `import.meta.glob('/na cuia/icons/svg/icone *.svg')` (project-root absolute — Vite rejects bare relative globs). `pos` **and every `from` point** validated inside the scene rect (`POS_MARGIN` shared constant, decided Phase 0).
11. **Compositing fallback** (the only exception to one-SVG; SPEC §3): if the Phase 2 device gate fails, ambient layers move to aligned sibling `<svg>`s inside one camera `div` — camera transform on the shared wrapper, identical viewBox, `inset: 0`. Same partition/grouping rules.
12. **Label layer**: `#labels` is controller-owned (SPEC §3) — **sibling of the camera wrapper and `#measure`, outside any camera transform in both modes**; pills + city name labels rendered from `ComiteData`, `aria-hidden`, positioned per frame with the full transform `screen = measureCTM · (k·point + [tx, ty])` (translation included); `destroy()` removes the layer, remount recreates exactly one; React never projects scene coords; title/controls z-index above it; panel `inert` wraps it.

## Data contract

```jsonc
"projects": {
  "<id>": {
    "name": "ORG NAME",
    "icon": "icone-6",                                   // unknown id → default totem + warning
    "pos": { "x": 0, "y": 0, "from": [{ "x": 0, "y": 0 }] }, // from = Point[] (hub sources — SPEC §3)
    "conflitos": [], "acao": [], "identificacao_e_territorio": [],
    "futuro": [], "memoria": [], "identidade": []
  }
}
```
Schema validation: six ordered section keys; unknown `icon` → default + warning; `pos` and every `from` point inside scene rect (`POS_MARGIN`).

## Guardrails

- TS `strict`; ESLint + Prettier clean; Vitest green before yield. Camera clamp math and schema validation unit-tested without DOM.
- No new runtime deps beyond `gsap` and `d3-zoom` without explicit user approval.
- Calibration tooling is `import.meta.env.DEV`-gated — zero bytes in production bundles.
- Perf budget (SPEC §11): shipped assets ≈ 131 KB gz + ≤ 100 KB fonts (latin subsets); ambient = transform/opacity whole-group (3 bands × 3 copies + squiggle + bob); ≤ 4 concurrent tweens; Phase 2 device-timing gate.

## Verification expectations

- Behavior changes: prove in the running app (dev server + browser), not just unit tests.
- Asset/data changes: side-by-side against `na cuia/Mapa.jpeg` / `modal.jpeg`.
- **Phase 1.5 fidelity checkpoint** (static composite vs `Mapa.jpeg`, asymmetry preserved) gates animation work.
- Reduced-motion, keyboard activation (`tabindex="0"`, Enter/Space + role=button + focus-fly), resize/orientation (cover fit), and panel-obstruction behavior are part of "done" for any interaction work.

## Gotchas

- `mapa cru`'s sea is a `<rect>` and land includes a `<polygon>` — partition every painted child, not just `<path>`.
- Illustrator styles are classes (`cls-N`) resolved via `<style>` — resolve all properties to attributes at build; CSS descendant selectors (`#layer-x path`) still beat presentation attributes for tint overrides.
- Draw-on: `getTotalLength()` + dasharray/dashoffset; no plugin.
- ~~`onda 1/2/4` end contours ≠ start contours — a 2-copy tile jumps at wrap; use the 3-copy `[A][A′][A]` chain.~~ (v1.1: bands removed.)
- Panel text arrays can be long (138-char strings exist) — test overflow early.
- GSAP + d3-zoom: animate numbers, write through `zoom.transform`, or the next gesture jumps.
- Never read camera transforms from the DOM — controller state is the only source; the measurement owner's CTM is camera-free by construction.
