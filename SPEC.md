# SPEC — Na Cuia · Mapa do Comitê de Comunicadores Populares

Interactive animated map of popular communicators' collectives (Belém, Ananindeua, Moju/Barcarena).
Hand-illustrated SVG collage — **no map library**. Target look: `graft/.cache/gate/ref/poster.jpg` (scene; supersedes `na cuia/Mapa.jpeg`) and `na cuia/modal.jpeg` (content panel).

Decisions locked in the grilling session (2026-09-14); spec revised through dual adversarial review rounds (gpt-5.6-sol + opus 5) and an external advisory fold (rev 5: Phase 1.5 fidelity checkpoint, calibration tool, controller-owned label layer, mobile label declutter, panel art direction, asymmetry criterion). `data.json` is canonical; mockup discrepancies are ignored.

---

## 1. Asset inventory (`na cuia/icons/svg/`) — mechanically verified

| File | viewBox | Verified content | Role |
|---|---|---|---|
| `mapa cru.svg` | 3023.11×2021.19 | **68 painted nodes**: 66 `<path>` + 1 `<rect>` (sea) + 1 `<polygon>`; 6 fill classes (§2) | **Scene base** |
| `mapa belém.svg` | 1157.53×1026.18 | City land mass (fill `#52b04e`, outline `#27642d`) | Layer: city |
| `mapa ananindeua.svg` | 625.23×618.08 | City land mass | Layer: city |
| `mapa moju.svg` | 741.70×1131.89 | City land mass (Moju Barcarena) | Layer: city |
| `onda 1.svg` | 2160.32×108.01 | Wave band `#d9effd`; **start/end contours differ — not natively tileable** | Layer: waves |
| `onda 2.svg` | 2160.32×118.73 | Wave band `#f1f9fe` **at `opacity: .8`**; same caveat | Layer: waves |
| `onda 4.svg` | 2160.32×140.94 | Wave band `#d9effd` **at `opacity: .2`**; same caveat | Layer: waves |
| `onda 3.svg`, `onda 5.svg` | — | **Empty files. Ship with bands 1/2/4** | — |
| `ondinhas mapa geral.svg` | 2160.32×1026.18 | Water squiggle texture `#509393`/`#99d3d8` | Layer: water texture |
| `icone 1.svg` | 289.46×618.08 | Lightning bolt `#2e5124`/`#f7ae0d` | Panel icon: `conflitos` |
| `icone 2.svg` | 345.40×618.08 | Atabaque drum | Panel icon: `memoria` (+`identidade` reuse) |
| `icone 3.svg` | 337.23×618.08 | Foliage | Panel icon: `identificacao_e_territorio` (+`futuro` reuse) |
| `icone 4.svg` | 283.02×618.08 | Cuia gourd | Panel icon: `acao` |
| `icone 5.svg` | 415.87×618.08 | **Green totem** (`#466746`/`#4cad3b`) — not the mockup totem | Artifact variant |
| `icone 6.svg` | 337.23×618.08 | **Cream totem** (`#fed27f`/`#304e23`) — **matches Mapa.jpeg totems**; default artifact | Artifact (default) |
| `icone 7.svg` | 924.46×299.09 | Pirarucu fish — not on target map | Artifact variant (audiovisual/riberine orgs) |
| `quadro 2.svg` | 2160.32×1302.90 | Frame/mask, wavy bottom | Reference only |
| `Mapa geral.svg` | 3000×2000 | 763 paths, 2 generic groups (`Camada_3/4`), no usable ids | **Reference only** |

PNGs (`na cuia/icons/png/`, **12 files**): 6 icon rasters, 2 populated map mockups, 1 solid base map, 3 transparent landmass rasters — reference only. `Mapa cuia.ai` = source artwork; never edited.

**Verified facts**: Illustrator re-traced every export — zero shared path data; every non-base layer needs a calibrated transform. Weight (decimal KB): **shipped set (15 files above) = 318 KB raw / ≈ 131 KB gz**; all repo SVGs together = 993 KB raw / 377 KB gz (reference files excluded from budget). No lazy-loading required.

## 2. `mapa cru.svg` partition — by resolved fill, with node-count assertions

Stylesheet ground truth: `.cls-1{#5da9a9} .cls-2{#95c98e} .cls-3{#58b254} .cls-4{#509393} .cls-5{#99d3d8} .cls-6{#abd5f3}`.

| Resolved fill | Nodes | Group (DOM order matters, §4) |
|---|---|---|
| `#5da9a9` | **1 `<rect>`** (not a path) | `layer-water` |
| `#95c98e` | 42 (41 `<path>` + 1 `<polygon>`) | `layer-land` |
| `#58b254` | 5 | `layer-roads` |
| `#509393` + `#99d3d8` | 17 | `layer-water-detail` |
| `#abd5f3` | 3 (river) | `layer-water-detail` |

Rules:
- Partition **by resolved fill hex** (styles resolved to attributes at build), never by class name — `prefixIds` may rename classes and silently break a `cls-*` selector.
- **Resolve every declared property** (`fill`, `opacity`, …), not just fill — `onda 2` ships `opacity:.8`, `onda 4` `opacity:.2`; fill-only resolution changes the look.
- Mount asserts counts `1 / 42 / 5 / 20` (total 68); mismatch = hard error.
- **Paint order**: in the source, marks (`cls-4/5`) and river (`cls-6`) paint **after** land — sinking them under land would occlude the river visible in `Mapa.jpeg`. Hence `layer-water-detail` sits **above** roads. Hoisting all 5 roads above all 42 land nodes is an accepted z-change (verify visually at calibration).

## 3. Scene architecture

- **Island pattern**: the animated scene is one imperative module *outside* the React tree. React owns panel/title/controls. **Never render the animated SVG through JSX.**
- **One composed inline `<svg viewBox="0 0 3023.11 2021.19" preserveAspectRatio="xMidYMid slice">`**: `slice` gives native **cover** — the scene fills the viewport at camera k = 1 with no letterbox, portrait or landscape. Every layer a `<g id="layer-*">`; all positions in scene coords.
- **Build pipeline (ordered)**: parse → resolve `<style>` to per-node attributes (**all properties**) → SVGO `prefixIds` (ids **and** class names) → group by resolved fill (§2) → inject → assert node counts. Assets inlined via `?raw`/svg plugin; `<img>`/external `<use>` forbidden for animated layers.
- **Compositing fallback (only exception to one-SVG)**: if the §11 device gate fails on inner-SVG transform repaint, switch ambient layers to **aligned sibling `<svg>` elements inside one camera `div`**: the camera transform applies to the shared wrapper (one coordinate space preserved), each sibling is positioned identically (`inset:0`, same viewBox + `preserveAspectRatio`), and partition/grouping rules are unchanged. HTML-composited transforms are the fallback's win. Documented deviation; not a design change.
- **Measurement owner (both modes)**: all viewport↔scene reads go through a dedicated **untransformed** full-viewport `<svg id="measure">` that lives **outside** the camera wrapper — **identical `viewBox`, `preserveAspectRatio="xMidYMid slice"` and `inset: 0` box as the scene SVG** (otherwise `ctm.a` is CSS px per raw unit, not per scene unit, and extent/clamp/hit math silently breaks — jsdom-mocked CTM tests will not catch this). Its `getScreenCTM()` never contains camera transforms, in the primary mode (camera `<g>` inside the scene SVG) or the fallback (camera as CSS ancestor). Camera parameters (`k`, translation) come **only from controller state**, never from DOM reads. Extent inverse-mapping, clamp math, and hit sizing all use this owner; Vitest covers extent/clamp/hit-sizing in **both** modes.
- **Label layer (controller-owned)**: an HTML `#labels` div — **sibling of the camera wrapper and of `#measure`, outside any camera transform in both modes** — is created, owned and destroyed by `SceneController`, never React. The controller renders label pills **and city name labels** from `ComiteData` (structured fields only — names, tone; never arbitrary HTML) and positions them per frame with the full camera transform: `screen = measureCTM · (k·point + [tx, ty])` — translation included, or pans drift. Pills are `aria-hidden="true"` decoration (`pointer-events: none`; taps land on scene hit circles — the SVG button is the single focusable control per org, §9). `destroy()` removes the layer; remount recreates exactly one (no leaks, no duplicates); title/controls carry explicit z-index above `#labels`; panel `inert` wraps it.
- **Calibration**: cities, waves, squiggles, artifacts each get a one-time `<g transform>` in `src/scene/placements.ts`, placed against a `Mapa.jpeg`/`Mapa geral` underlay and reviewed with the user. `placements.ts` also exports `initialFraming {x, y}` — a **scene-coordinate focus point**: at k=1 the viewport centers on it (then clamps), all aspects; `reset()` returns to it. Chosen at calibration so portrait first paint centers the densest org cluster, not open water.
- **Nested transform wrappers (mandatory)**: `placement <g transform=attr>` → `interaction <g>` (GSAP target) → `ambient <g>` (CSS animation target). CSS animations win the cascade over GSAP/attribute transforms on the same node — never share a node between two transform owners. Camera transform lives on a separate ancestor.
- Arrows exist in no reusable asset — **authored in code**: quadratic Bézier from a **source point on its city mass edge** (Belém / Ananindeua / Moju — multiple arrows fan outward, per the poster) to the artifact, stroke **`#EDE5CE` warm cream**, 6 scene units wide, round cap, same-color arrowhead marker, dash-offset draw. `pos.from` points are calibrated on their corresponding city mass, independently of `pos`; no source dots. Org base anchors sit on dry land; the corrected CABA and Centro de Educação Popular anchors retain at least 15 scene units of shoreline clearance. Validate all org anchors against freshly rendered sea/city masks and the portrait composition gate after coordinate edits.
- Org label boxes use dark brown (`#513822`) with cream (`#fdf6e3`) text, centered below each totem base, with compact multiline wrapping. Where two boxes would statically overlap at a given camera state, the lower one is pushed straight down until clear (pure `resolveLabelPush`, applied on the anchor translate — the inner div's GSAP offset stays single-owner); the push shrinks back to 0 as zoom separates the anchors. City display names come from `data.json`: Belém, Ananindeua and Moju (an empty projects map still renders its city label). Totems are 190 scene units tall, anchored at their base.
- Title backing blob: broad aqua authored SVG path in code, not sourced from any file. The responsive navy heading reads “Mapeamento de 25 Coletivos do” / “Comitê de Comunicadores Populares” on two lines where space permits. Title, pills, panel, controls = HTML overlay.
- Responsive: the scene wrapper fills the viewport (`100% × 100dvh`, `background: #5da9a9` — the sea color, so pan-reveal past the sea rect, which extends to x = 3027.66, never shows blank); `slice` cover does the fitting; no separate portrait layout.

## 4. Layer stack (bottom → top)

1. `layer-water` (1 rect)
2. `layer-land` (42)
3. `layer-roads` (5)
4. `layer-water-detail` (17 marks + 3 river — preserves source paint order over land)
5. `layer-waves` (`onda 1/2/4`)
6. `layer-squiggles` (`ondinhas`)
7. `layer-city-{belem,ananindeua,moju}` (city name labels render in `#labels`, controller-owned)
8. `layer-artifacts` (totems + invisible hit circles; taps) < `layer-arrows` (authored paths, `pointer-events: none` — decorative, never intercepts taps)
9. HTML overlay (paints above the whole SVG): `#labels` (controller-owned pills) < title < zoom controls / skip button — explicit z-index in that order.

## 5. Motion design

**Ambient — CSS keyframes, whole-group, `transform`/`opacity` only:**
- Waves: uniform `waveScale = 3023.11/2160.32 ≈ 1.3994` on **both axes** (never non-uniform stretch). **Tile = three copies `[A][A′][A]` (A′ = `scaleX(-1)` mirror) → period 2W = 4320.64 band-local units**: animate `translateX` 0 → −4320.64, linear, infinite; at wrap the third copy sits exactly where the first was (a 2-copy pair has period 2W but only 1 copy-step of travel before it runs out — the 3-copy chain is the minimum seamless linear loop). Durations 8–14 s per band, offset phases. Opacities .8/.2 preserved from source. Bands calibrated at x = 0; a calibrated x-shift ≥ W/2 requires a 4th copy.
- `layer-squiggles`: slow drift + opacity pulse.
- Artifacts: shared bob rule, per-child `animation-delay` (composited).
- Ambient is the only always-on animation; dash-offset draws and shadow growth are **interaction-transient effects** — the explicit, documented exception to the transform/opacity rule.

water rect → waves start → land + roads fade/rise → water-detail → cities staggered rise → arrows dash-draw → artifacts drop + bob → pills that pass the mobile gate (`labelK = 1` default — distance gate only) pop → title letters. React's skip button calls `controller.skipIntro()`. `prefers-reduced-motion: reduce` → final state, no loops. **Tone: atmospheric, not spectacular** — the poster waking up; restraint constrains timing/easing, it is not an invitation for more effects.

**City tap:** GSAP timeline: camera fly → interaction-`<g>` lift (`translateY` ≈ −20, `transform-box: fill-box`) + growing soft shadow + cloned-path outline draw (`getTotalLength()` dash) → siblings dim 0.35. Desktop hover = preview lift. Tap empty = settle + reset.

**Label declutter (mobile):** pills fade by camera state — hidden when the label's screen distance from the viewport center exceeds a threshold (`labelK` defaults to 1, so at k=1 only the distance gate applies and no pill is hidden by zoom), revealed as the camera approaches, with a ±10% hysteresis band so labels never flicker at the threshold. Fading uses `opacity` + `visibility` + `pointer-events: none` (never `display: none`). Hit circles, artifacts and keyboard focusability are unaffected — pills are decoration (§3); the button is the scene node. Full collision-avoidance systems are out of scope.
**Artifact tap:** pulse/pop, arrows redraw, panel opens. **Desktop**: camera puts the artifact in the region not covered by the drawer (left-biased) at `k ≥ min(1.6, k_max)` — the artifact-visibility guarantee is a desktop criterion. **Mobile**: the centered panel occludes the map by design (user decision §8); occlusion is intentional, no visibility criterion.

## 6. Camera

Single controller in the island. All state lives in d3-zoom's element-owned transform: GSAP animates numbers but **every frame writes through `zoom.transform`**; any user gesture (`pointerdown`/`wheel`) cancels the active fly. Clamp **per frame**.

- **Cover is native**: `preserveAspectRatio="xMidYMid slice"` fits the scene to the viewport; the camera is a pure multiplier `k ∈ [1, 4]` with `k_max = 4` (k = 1 ≡ the slice fit). No hand-derived scale factors anywhere. Pan clamped to the **union of the scene rect and the transformed bounds of all hit targets** (calibrated content may exceed the rect; targets must never be unreachable). **Obstruction**: `setObstruction(rect)` extends the pan-clamp domain on the obstructed side by the rect's viewport span so focus targets sit fully in the unobstructed region; `setObstruction(null)` re-clamps with a short tween (no jump).
- **d3-zoom `extent` must be set explicitly**: the default reads the `viewBox`, which under `slice` is larger than the visible rect (portrait 390×844 shows ≈934 of 3023 units at k=1). Set `zoom.extent` = the viewport corners mapped through the **measurement owner's** `getScreenCTM().inverse()` (§3), recomputed in the `ResizeObserver`; Vitest cases for 16:9 and 9:19.5 aspect ratios, primary and fallback modes.
- **Hit targets in CSS px — measured, never derived**: in `onTransform`, read `getScreenCTM()` from the **measurement owner** (§3 — untransformed, so `ctm.a` never contains camera transforms in either mode); `u = measureCtm.a × k`, with `k` taken from **controller state** (never a DOM-read transform); hold each hit circle at `r_scene ≥ 12/u` (≥ 24 CSS px diameter at every zoom). Reading any CTM from inside the camera wrapper would double-count k.
- Double-tap zoom; `+ / − / reset` buttons.

## 7. Data model (`data.json` — canonical)

Per project: `name` + 6 ordered sections (`conflitos`, `acao`, `identificacao_e_territorio`, `futuro`, `memoria`, `identidade`), each `string[]`. 11 projects today; the number 25 is title copy, never a constant in code.

Extensions (top-level project fields — same shape as AGENTS.md):
```jsonc
"na_cuia": {
  "name": "NA CUIA (BELÉM)",
  "icon": "icone-6",                     // artifact id; unknown id → default totem + console warning
  "pos": { "x": 1600, "y": 1480,
           "from": [{ "x": 1351, "y": 721 }] },  // scene coords; from = Point[] (hub source — §3)
  "conflitos": [], "acao": [], "…": []
}
```
- Icons resolve via `import.meta.glob('/na cuia/icons/svg/icone *.svg')` (project-root absolute — Vite requires a `/`, `./` or alias prefix). Icon ids normalize by stripping spaces/hyphens (`"icone-6"` ≙ `icone 6.svg`). `pos` **and every `from` point** validated inside the scene rect at schema load, margin `POS_MARGIN` — a single shared constant (schema **and** calibration tool import the same value), decided in Phase 0 before calibration; default 0 scene units. Edge-sitting orgs like Guamá are valid composition.
- **Honest promise**: adding an org requires **content-only edits** (data.json + optional icon file) — no TypeScript changes. It still requires human steps: artifact art choice and `pos` calibration (dev-only calibration tool ships in Phase 1.5; org coords finalize in Phase 5).

## 8. Content panel

- Desktop: right side drawer. Mobile: **centered panel sliding in from the side** (user decision), `max-height: 80dvh`, `max-width: 85vw`, inner `overflow-y: auto`, `overscroll-behavior: contain`. Mobile map occlusion is intentional (§5). **Device predicate defined once**: `isMobile = matchMedia('(pointer: coarse)')` in `src/device.ts` — used by the panel variant, `setObstruction` policy, and pill fade; no other module guesses.
- **Art direction (not a SaaS drawer)**: cream paper background, dark green/brown stroke accents, the §1 section icons, Fraunces headings + Archivo body, subtle irregular hand-drawn border, wave-band footer echoing `modal.jpeg`. Long-text readability: body ≥ 16 px, line-height ≥ 1.6; decoration is inline-SVG only (≤ ~5 KB — §11).
- Renders **exactly the six whitelisted content keys in data order** — never `icon`/`pos` metadata. Sections with empty arrays are **hidden**. No link rendering today (data has no URL fields); a structured links field is future work.
- Accessible name: `aria-labelledby` bound to the organization-name heading; `role="dialog"`, `aria-modal`, initial focus to the panel, background `inert`, focus trap, focus returns to the triggering artifact on close, `Esc` + `×`, body scroll locked (`position: fixed` technique).
- While open: desktop drawer calls `controller.setObstruction(panelRect)` (§6 — desktop-only); mobile passes `setObstruction(null)` (occlusion intentional). `setObstruction(null)` on close in both cases.

## 9. Accessibility

Artifacts and cities are real buttons semantically: `role="button"`, `tabindex="0"` (SVG children), Enter/Space activation, visible **stroke-based** focus ring (no `outline` dependency), deterministic tab order (**cities → artifacts**; `pos.from` hub points are decorative, never focusable), keyboard focus triggers camera fly-to. Label pills are `aria-hidden` decoration owned by the controller (§3) — exactly one focusable control per org/city. Panel per §8. `prefers-reduced-motion` static mode. Zoom controls ARIA-labelled. pt-BR UI throughout.

## 10. Scene controller API (single owner of the imperative world)

```ts
mountScene(el: HTMLElement, data: ComiteData): SceneController
interface SceneController {
  destroy(): void;                       // idempotent: reverts gsap.context, d3 listeners, observers, injected DOM — StrictMode/HMR safe
  onTransform(cb: (t: { x: number; y: number; k: number }) => void): () => void;
  setObstruction(rect: { x: number; y: number; w: number; h: number } | null): void; // viewport-space; DESKTOP ONLY — mobile passes null (occlusion intentional)
  flyTo(target: Box, opts?: FlyToOptions): void; zoomBy(f: number): void; reset(): void;
  focusCity(id: string): void; focusArtifact(id: string): void;
  skipIntro(): void; onIntroDone(cb: () => void): () => void;
  on(event: 'artifact-tap' | 'city-tap', cb: (id: string) => void): () => void;
  on(event: 'empty-tap', cb: () => void): () => void;
}
```
(`ComiteData` is the schema-validated `data.json` type; `Box`/`FlyToOptions` live in `src/scene/types.ts` — no implicit `any` under strict.) The controller also owns the `#labels` layer (§3): it renders and positions pills from `ComiteData`; React never projects scene coords. React mounts it in exactly one `useEffect` (StrictMode double-mount safe: mount → destroy → mount). All GSAP work inside `gsap.context` reverted on destroy. Intro state owned by the scene; React only renders its skip button and reacts to events.

## 11. Performance budget

- Shipped assets ≈ **131 KB gz** (§1, decimal) + fonts: Fraunces + Archivo **latin subsets only**, target ≤ 100 KB gz combined; total ≤ ~300 KB gz.
- Ambient loops: transform/opacity only, whole-group. Budget: 3 wave bands × **3 copies** (one transform per copy) + 1 squiggle group + 1 artifact-bob group rule.
- Interaction transients (dash draw, shadow) allowed; ≤ 4 concurrently tweened groups.
- Panel decoration: inline-SVG textures ≤ ~5 KB, no raster textures; body text ≥ 16 px / 1.6 — readability beats decoration.
- Named perf gate in Phase 2: DevTools paint-flash + frame timing on a real mid-tier Android (or CPU-throttled desktop ×6) — if inner-SVG transforms repaint full-width, adopt the §3 compositing fallback (sibling SVGs + shared camera wrapper). Pause all loops on `document.hidden`.

## 12. Risks / open items

1. **Calibration is manual** — review pass with user against `Mapa.jpeg`.
2. Wave bands are not natively tileable — 3-copy mirror chain is v1; designer re-export of a truly tileable band remains the clean upgrade.
3. Per-org icons are placeholders (default = icone 6) until per-org art arrives via `data.json`.
4. Fonts: Fraunces (title) + Archivo (UI), Google Fonts, latin subset, pt-BR confirmed.
5. Cover-only camera (no k < 1): portrait users pan instead of seeing the whole map — accepted design choice (map-app convention).
6. **Underlay calibration**: `Mapa geral` is 3000×2000 vs the 3023.11×2021.19 scene and `Mapa.jpeg`'s crop/aspect is unknown — calibrate the overlay to `mapa cru` sea/land edges first, verify under `slice` at 16:9 and 9:19.5, or every placement is wrong together, invisibly.
7. Portrait users may not guess at off-screen content (cover-only camera, item 5) — watch in testing; a "ver mapa inteiro" overview/minimap stays deferred and must not break `k ≥ 1` or reduced motion if ever added.
8. `POS_MARGIN` must be decided before the calibration pass — far-edge orgs (Guamá) sit at rect edges by design.

## 13. Acceptance criteria

- Entrance choreography plays ~3 s; skip works; reduced-motion renders static final state.
- Water reads as water: seamless band drift across the full 2W period (no seam/step at wrap), squiggle pulse, artifact bob; band opacities match source (.8/.2).
- Tap city → camera flies, landmass raises (lift + shadow + outline draw), others dim; tap empty resets.
- Tap artifact → pulse + panel with the six whitelisted sections (empty hidden). Desktop: artifact visible at `k ≥ min(1.6, k_max = 4)` beside the drawer (obstruction-aware clamp, §6). Mobile: occlusion intentional; close returns to context.
- Camera: pinch/drag/wheel/double-tap on touch + desktop; **slice cover** fills portrait and landscape at k = 1; per-frame clamped; targets reachable after resize/orientation/panel-open; fly-to cancelled by user gesture; no state jump after gesture; hit circles ≥ 24 CSS px at every zoom (CTM-measured).
- Keyboard: full tour of cities + artifacts (`tabindex=0`, Enter/Space, focus → fly), panel focus lifecycle complete with `aria-labelledby`.
- Org addition: dummy org with default icon + calibration-tool-authored `pos` renders with **zero TypeScript edits**; schema violations (incl. out-of-rect `from` points) fail loudly.
- Camera extent/obstruction unit-tested for 16:9 and 9:19.5 aspect ratios (Vitest, per §6).
- Perf gate (§11) passes on mid-tier Android profile — else §3 fallback adopted and re-gated.
- **Phase 1.5 fidelity checkpoint**: static composite of all layers is compared to `graft/.cache/gate/ref/poster.jpg` side-by-side (overlay diff; supersedes `Mapa.jpeg`) with irregular spacing preserved — asymmetry is a criterion; normalization is a defect.
- Labels track the camera with zero visible drift at every zoom; mobile pill fade engages with hysteresis and never removes a hit target or a focusable control.
- Panel matches the `modal.jpeg` art direction (palette, icons, typography) and passes long-text overflow at `max-height: 80dvh`.
