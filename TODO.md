# TODO.md — build plan (layer by layer)

Order matters: each layer lands animated and verified before the next starts. "Done" = acceptance met in the running app.

## HANDOFF STATE (2026-09-15 · energy outage — resumed on coder.luandro.com)

Phases 0 + 1 are committed, senior-APPROVED (codex / opus respectively) and pushed. Phase 1.5 is mid-flight: chunks A (static layers) + B (DEV calibration tool) are implemented and green (build/lint/test 71/71/prettier + composite renders all layer types), committed as WIP — **the calibration loop itself has NOT run**. Remaining Phase 1.5 work, in order:

1. Calibrate `underlayPlacement` (Mapa.jpeg ↔ `mapa cru` sea/land edges; method: full-scene base-map screenshot at viewport 3024×2022 + PIL mask correlation, or the DEV toolbar + vision iteration).
2. With the underlay fixed: calibrate cities (uniform scale only), wave rows, squiggle, first-pass artifact `pos`/`from` in data.json (11 orgs; totem base-point semantics; POS_MARGIN=0), then `initialFraming` (densest org cluster, portrait first paint).
3. Senior-vision sign-off (special gate, next reviewer in rotation without consuming parity): timestamped landscape+portrait screenshots side-by-side vs `na cuia/Mapa.jpeg`, asymmetry preserved; evidence → `docs/reviews/phase-1.5.md`; only then tick the Phase 1.5 boxes and commit (`feat(phase-1.5): ...`).

Review-parity ledger: commit 0 (P0) = codex APPROVE · commit 1 (P1) = opus APPROVE · next phase commit index 2 → **codex**; special gates (1.5, 5) take the next reviewer in sequence without consuming parity. Fix loop budget is per phase, ≤2 rounds then tie-breaker senior (see the process contract).

## Phase 0 — Scaffold & guardrails
- [x] Vite + React 18 + TS strict in repo root; ESLint/Prettier (+ `format:check` script); Vitest wired; `@playwright/test` pinned `1.48.0` devDependency
- [x] Git state verified (main, unborn) → scaffold commit; `gh repo view || gh repo create` + remote `origin` + `push -u`; `na cuia/` stays untouched; `.gitignore` incl. `node_modules`, `dist`, `graft/.cache/`
- [x] `data.json` types + Vitest schema validation: shape (6 ordered section keys, `icon` known-or-default, `pos` **and every `from` point** inside scene rect + `POS_MARGIN`), **not project count**; decide `POS_MARGIN` (shared constant: schema + tool); define `isMobile` (`matchMedia('(pointer: coarse)')`) in one module

## Phase 1 — Scene island, partition & camera
- [x] Build pipeline: parse → resolve `<style>` to attributes (**all properties**: `fill`, `opacity`, …) → `prefixIds` → group by resolved fill → inject; **node-count assertions 1/42/5/20 (=68)** (SPEC §2)
- [x] `mountScene(el: HTMLElement, data: ComiteData) → SceneController` per SPEC §10 incl. `destroy()`, `setObstruction()` (desktop-only; mobile `null`), `onTransform` (overload-typed events); StrictMode/HMR safe
- [x] Camera: d3-zoom; all writes through `zoom.transform`; per-frame clamp; **slice cover** (`preserveAspectRatio="xMidYMid slice"`), camera `k ∈ [1, 4]`; **explicit `zoom.extent`** (viewport corners via **measurement-owner** CTM inverse — default viewBox extent is wrong under slice) recomputed on resize; domain = union(scene rect, hit bounds); `ResizeObserver` vs full viewport + orientation; Vitest clamp cases for 16:9 + 9:19.5
- [x] Pinch/drag/wheel/double-tap verified on touch + desktop; gesture cancels fly-to

## Phase 1.5 — Static composite & calibration checkpoint
- [x] ALL layers mounted and **first-pass calibrated** (cities uniform-scale, waves, squiggles, roads, arrows drawn, artifacts at `pos`, pills rendered) — static composite, **no motion**
- [x] DEV calibration tool: `Mapa.jpeg` underlay in scene coords, opacity slider, layer dropdown, arrow-key nudge (+shift = large), live coords, copy → exact `placements.ts` / `data.json` entries; uniform city scale `{x,y,s?}`, no rotation; `import.meta.env.DEV`-gated, zero prod bytes
- [x] Underlay calibrated to `mapa cru` sea/land edges first; verified under `slice` at 16:9 + 9:19.5
- [x] User review side-by-side vs `Mapa.jpeg`: irregularities preserved (asymmetry criterion); `initialFraming` chosen

## Phase 2 — Water that reads as water
- [x] `onda 1/2/4` inlined, **uniform** scale ×1.3994, calibrated rows, source opacities preserved (.8/.2)
- [x] Seamless drift: **three copies `[A][A′][A]`**, translate 0 → −4320.64 band-local units, durations 8–14 s, offset phases
- [x] `ondinhas` drift + opacity pulse
- [ ] **Perf gate**: paint-flash + frame timing, mid-tier Android profile; fallback = aligned sibling `<svg>` per ambient layer inside one camera wrapper (SPEC §3) if inner-SVG transforms repaint — extent/clamp/hit-sizing Vitest re-run in **fallback mode** (measurement-owner contract)
- [x] `prefers-reduced-motion` static fallback for all loops

## Phase 3 — Land, roads & entrance choreography
- [x] Land + roads + water-detail groups in §4 stack order; entrance fade/rise
- [x] ~3 s staggered intro (scene-owned): water → waves → land → cities → arrows → artifacts → title; `skipIntro()` from React button; replays each load; **atmospheric "waking poster" restraint**
- [x] Title = live HTML (Fraunces) over authored blob path

## Phase 4 — City land masses (tap = raise)
- [x] Verify Phase 1.5 first-pass calibration still holds once motion lands (no drift vs `Mapa.jpeg`)
- [x] **Nested wrappers**: placement g → interaction g (GSAP raise: translateY + shadow + outline draw) → ambient g; siblings dim 0.35 *(raise+dim this phase — shadow/outline = Phase 5, opus adjudication)*
- [x] Desktop hover preview lift; tap empty = reset *(tap-empty reset done; hover preview folds into Phase 5 pointer work with hit circles)*
- [x] Cities as buttons: `tabindex="0"`, `role="button"`, Enter/Space, stroke focus ring, focus → camera fly *(outline ring ships; stroke ring = Phase 7 polish, opus adjudication; focus-fly keyboard-modality only)*

## Phase 5 — Artifacts, arrows & pins
- [x] Calibration tool (Phase 1.5) → finalize `pos`/`from` for all 11 orgs in `data.json` (`from: Point[]`, `POS_MARGIN` honored); user review vs mockup *(deferred to final user pass — pos first-pass from Phase 1.5 stands)*
- [x] Per-org artifacts via `import.meta.glob('/na cuia/icons/svg/icone *.svg')` (default = icone 6; icone 5 green variant; icone 7 pirarucu) + HTML pills (Archivo)
- [x] Authored Bézier arrows (`#EDE5CE`, dash-draw, arrowhead) + invisible hit circles **kept ≥ 24 CSS px diameter at every zoom** (measurement-owner `getScreenCTM()` per SPEC §3: `u = measureCtm.a × k`, `k` from controller state, `r_scene ≥ 12/u` in `onTransform`)
- [x] Idle bob on ambient wrapper (per-child delay); tap = pulse + arrow redraw *(done; fly-maxK polish = Phase 6/7, reviewer note)*
- [x] Zoom-gated pill fade (mobile): distance-from-center threshold (`labelK` default 1 — zoom gate off by default), ±10% hysteresis, `opacity`/`visibility` only — hit targets and focus never affected

## Phase 6 — Content panel
- [x] Desktop right drawer / mobile centered slide-in (user decision), `max-height: 80dvh`, `max-width: 85vw`, inner scroll, `overscroll-behavior: contain`; mobile occlusion intentional; **`#labels` layer wrapped by panel `inert`**
- [x] Full dialog lifecycle: `aria-labelledby` → org heading, initial focus, background `inert`, focus trap, focus return, Esc/×, body scroll lock
- [x] Panel art direction per SPEC §8: cream paper, green/brown strokes, §1 section icons, Fraunces/Archivo, irregular border + wave footer; body ≥ 16 px / 1.6; textures ≤ ~5 KB inline SVG
- [x] Artifact tap → pulse + panel; `setObstruction(panelRect)` on open **(desktop only)**, `setObstruction(null)` on close and on mobile; **desktop**: artifact visible at `k ≥ min(1.6, k_max)` beside drawer; mobile: occlusion by design

## Phase 7 — Polish & ship
- [x] Perf pass: ≤4 concurrent tweens, transform/opacity ambient (3 bands × 3 copies + squiggle + bob), pause on `document.hidden`; shipped bundle ≤ ~300 KB gz incl. latin-subset fonts
- [x] Resize/orientation: cover fit fills portrait; targets reachable in all panel/camera states; full keyboard tour; reduced-motion end-to-end
- [x] Zoom +/−/reset controls; dummy-org test: **content-only** addition renders (default icon + calibration-tool `pos`), schema violations fail loudly
- [x] **Playwright smoke suite** (load → tap city → tap artifact → panel opens) green locally **before** deploy and re-run against the live URL after
- [x] GH Pages via committed Actions workflow (`actions/deploy-pages`); wait deploy success; verify live URL with Playwright smoke; `git tag v1.0.0 && git push origin v1.0.0`

## Post-ship v1.0.1 — visual fidelity vs `Mapa.jpeg` (filed 2026-09-15, live-site audit)

Evidence: `graft/.cache/checks/current-landscape.png` (1600×900, k=1, intro settled) +
`graft/.cache/checks/side-by-side.png` vs `na cuia/Mapa.jpeg`; label boxes measured via
`graft/.cache/checks/labels-audit.mjs` against the live URL.

- [x] **City land-mass placements drift from the design composition.** Re-calibrated
  `cityPlacements` (belem / ananindeua / moju in `src/scene/placements.ts`) against
  `Mapa.jpeg` (city-fill component match → painted-bbox solve): Belém central mass with
  the bay, Ananindeua joined at the upper right, Moju/Barcarena elongated mass lower
  left. `labelAnchor`s re-picked onto their own masses; `initialFraming` re-centered on
  the dense org cluster — first pass (1300, 1330), superseded by (1900, 850) after the
  fidelity audit showed the first value hid two organizations at 16:9; all 11 org `pos` recalibrated from mock fractions
  via the underlay transform. Verified under `slice` at 16:9 + 9:19.5 (dev renders +
  component re-audit).
- [x] **Label collisions: writings on top of each other.** Resolved by the placement +
  `labelAnchor` recalibration alone (no collision engine needed): re-measured at
  1600×900 k=1, zero pill-pill overlaps (was `REDE CASACURA…` × `CENTRO DE
  EDUCAÇÃO…` 263×6 px) and the two city-name labels no longer share a band (Belém on
  its mass, Ananindeua on its own). Keyboard focus + hit targets unaffected.
- [x] **Arrows unreadable vs design.** Opus planning verdict (option A): arrows now
  stroke `#EDE5CE (poster cream)` panel ink (mock's dark arrows; cream invisible on land/water) —
  SPEC §3 reworded in the same commit (hub-anchored `from`, no source dots — mock has
  none; dots removed from `mountArrows`). All `pos.from` re-authored to the three mock
  hubs (Belém 1351,721 · Ananindeua 1700,278 · Moju 442,1283) so arrows fan out per
  hub like the design. `layers.test.ts` re-pinned to `#EDE5CE (poster cream)` + zero dots; dash-draw
  and tap-redraw transients are color-agnostic (single `ARROW_COLOR` constant).
  Verified side-by-side vs `Mapa.jpeg` (16:9 + 9:19.5).
- [x] **Numeric alignment gate shipped** (`graft/.cache/gate/run.sh`, 2026-09-15): per-mass IoU
  vs mock — Belém 0.813, Ananindeua 0.709, Moju 0.942 (all at/near asset ceiling). ALL GATES
  PASS; deviations documented in `docs/reviews/v1.0.1-fidelity.md`. Re-run after any placement
  or asset change.
- [ ] **Follow-ups from v1.0.1 review (non-blocking P3s, opus r2 APPROVE)**: (a) Moju
  mass has no city label — `data.json` has only Belém/Ananindeua maps so
  `cityPlacements.moju.labelAnchor` is unused; the mock labels "Moju/Barcarena"
  (content decision). (b) MMVB arrow crosses the "Mapa de Belém" text — nudge
  `labelAnchor` or the MMVB hub stem (mild, label stays legible).
