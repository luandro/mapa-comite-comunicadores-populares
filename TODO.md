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
- [ ] ALL layers mounted and **first-pass calibrated** (cities uniform-scale, waves, squiggles, roads, arrows drawn, artifacts at `pos`, pills rendered) — static composite, **no motion**
- [ ] DEV calibration tool: `Mapa.jpeg` underlay in scene coords, opacity slider, layer dropdown, arrow-key nudge (+shift = large), live coords, copy → exact `placements.ts` / `data.json` entries; uniform city scale `{x,y,s?}`, no rotation; `import.meta.env.DEV`-gated, zero prod bytes
- [ ] Underlay calibrated to `mapa cru` sea/land edges first; verified under `slice` at 16:9 + 9:19.5
- [ ] User review side-by-side vs `Mapa.jpeg`: irregularities preserved (asymmetry criterion); `initialFraming` chosen

## Phase 2 — Water that reads as water
- [ ] `onda 1/2/4` inlined, **uniform** scale ×1.3994, calibrated rows, source opacities preserved (.8/.2)
- [ ] Seamless drift: **three copies `[A][A′][A]`**, translate 0 → −4320.64 band-local units, durations 8–14 s, offset phases
- [ ] `ondinhas` drift + opacity pulse
- [ ] **Perf gate**: paint-flash + frame timing, mid-tier Android profile; fallback = aligned sibling `<svg>` per ambient layer inside one camera wrapper (SPEC §3) if inner-SVG transforms repaint — extent/clamp/hit-sizing Vitest re-run in **fallback mode** (measurement-owner contract)
- [ ] `prefers-reduced-motion` static fallback for all loops

## Phase 3 — Land, roads & entrance choreography
- [ ] Land + roads + water-detail groups in §4 stack order; entrance fade/rise
- [ ] ~3 s staggered intro (scene-owned): water → waves → land → cities → arrows → artifacts → title; `skipIntro()` from React button; replays each load; **atmospheric "waking poster" restraint**
- [ ] Title = live HTML (Fraunces) over authored blob path

## Phase 4 — City land masses (tap = raise)
- [ ] Verify Phase 1.5 first-pass calibration still holds once motion lands (no drift vs `Mapa.jpeg`)
- [ ] **Nested wrappers**: placement g → interaction g (GSAP raise: translateY + shadow + outline draw) → ambient g; siblings dim 0.35
- [ ] Desktop hover preview lift; tap empty = reset
- [ ] Cities as buttons: `tabindex="0"`, `role="button"`, Enter/Space, stroke focus ring, focus → camera fly

## Phase 5 — Artifacts, arrows & pins
- [ ] Calibration tool (Phase 1.5) → finalize `pos`/`from` for all 11 orgs in `data.json` (`from: Point[]`, `POS_MARGIN` honored); user review vs mockup
- [ ] Per-org artifacts via `import.meta.glob('/na cuia/icons/svg/icone *.svg')` (default = icone 6; icone 5 green variant; icone 7 pirarucu) + HTML pills (Archivo)
- [ ] Authored Bézier arrows (`#F2DCB0`, dash-draw, arrowhead) + invisible hit circles **kept ≥ 24 CSS px diameter at every zoom** (measurement-owner `getScreenCTM()` per SPEC §3: `u = measureCtm.a × k`, `k` from controller state, `r_scene ≥ 12/u` in `onTransform`)
- [ ] Idle bob on ambient wrapper (per-child delay); tap = pulse + arrow redraw
- [ ] Zoom-gated pill fade (mobile): distance-from-center threshold (`labelK` default 1 — zoom gate off by default), ±10% hysteresis, `opacity`/`visibility` only — hit targets and focus never affected

## Phase 6 — Content panel
- [ ] Desktop right drawer / mobile centered slide-in (user decision), `max-height: 80dvh`, `max-width: 85vw`, inner scroll, `overscroll-behavior: contain`; mobile occlusion intentional; **`#labels` layer wrapped by panel `inert`**
- [ ] Full dialog lifecycle: `aria-labelledby` → org heading, initial focus, background `inert`, focus trap, focus return, Esc/×, body scroll lock
- [ ] Panel art direction per SPEC §8: cream paper, green/brown strokes, §1 section icons, Fraunces/Archivo, irregular border + wave footer; body ≥ 16 px / 1.6; textures ≤ ~5 KB inline SVG
- [ ] Artifact tap → pulse + panel; `setObstruction(panelRect)` on open **(desktop only)**, `setObstruction(null)` on close and on mobile; **desktop**: artifact visible at `k ≥ min(1.6, k_max)` beside drawer; mobile: occlusion by design

## Phase 7 — Polish & ship
- [ ] Perf pass: ≤4 concurrent tweens, transform/opacity ambient (3 bands × 3 copies + squiggle + bob), pause on `document.hidden`; shipped bundle ≤ ~300 KB gz incl. latin-subset fonts
- [ ] Resize/orientation: cover fit fills portrait; targets reachable in all panel/camera states; full keyboard tour; reduced-motion end-to-end
- [ ] Zoom +/−/reset controls; dummy-org test: **content-only** addition renders (default icon + calibration-tool `pos`), schema violations fail loudly
- [ ] **Playwright smoke suite** (load → tap city → tap artifact → panel opens) green locally **before** deploy and re-run against the live URL after
- [ ] GH Pages via committed Actions workflow (`actions/deploy-pages`); wait deploy success; verify live URL with Playwright smoke; `git tag v1.0.0 && git push origin v1.0.0`
