// Phase 7 Playwright smoke suite: load → tap city → tap artifact → panel
// opens → Esc → reduced-motion end-to-end. Also used against the live URL.
import { readFile } from 'node:fs/promises'
import { chromium, devices } from '@playwright/test'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173'
const failures = []
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const browser = await chromium.launch()

// --- Desktop landscape ---
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(4500) // intro
check('load: scene svg mounted', (await page.locator('svg#scene').count()) > 0)
check(
  'load: 11 artifact totems',
  (await page.locator('#layer-artifacts [data-artifact-id]').count()) >= 11,
)
// Issue #19/#24: MOBILE retracts the title into a burger ~1.2s after
// intro-done; on DESKTOP the title stays and an info button replaces the
// burger (user directive). Desktop assertion here = static title + info
// button; the mobile retraction is asserted in the portrait pass below.
check(
  'load: desktop keeps the title + info button (no burger)',
  await page.evaluate(() => {
    const title = document.querySelector('.app-title')
    const info = document.querySelector('.app-info')
    return (
      title != null &&
      title.classList.contains('is-retracted') === false &&
      Number(getComputedStyle(title).opacity) === 1 &&
      info != null &&
      document.querySelector('.app-burger') === null
    )
  }),
)

// city tap raise — click a PAINTED point of the mass (the recalibrated Belém
// bbox center is over the bay, which is a tap-empty reset target, not the city).
// Deterministic 10×10 grid, row-major, same offsets every run: an unseeded
// random sample could miss the painted mass on a healthy build (CodeRabbit
// Minor / qodo Medium on PR #1).
const city = page.locator('[data-city-id="belem"]')
const tapPoint = await city.evaluate((g) => {
  const r = g.getBoundingClientRect()
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const x = r.x + (r.width * (col + 0.5)) / 10
      const y = r.y + (r.height * (row + 0.5)) / 10
      const el = document.elementFromPoint(x, y)
      if (el && g.contains(el)) return { x, y }
    }
  }
  return null
})
if (!tapPoint) failures.push('city tap: no painted point found in belem bbox')
else await page.mouse.click(tapPoint.x, tapPoint.y)
await page.waitForTimeout(500)
// Issue #12/#18 (user directives): tapping a city REPLAYS the entrance for
// that city's orgs (totems drop from ARTIFACT_DROP_FROM) and dims the other
// groups to 0.35 — there is NO translate lift anymore. Assert the shipped
// contract: own group at opacity 1, another group dimmed to 0.35.
const cityState = await page.evaluate(() => {
  const op = (id) => {
    const g = document.querySelector(`[data-city-id="${id}"]`)
    return g ? Number(getComputedStyle(g).opacity) : -1
  }
  return { belem: op('belem'), ananindeua: op('ananindeua'), moju: op('moju') }
})
check(
  'city tap: selected full + others dimmed (replay model, issue #18)',
  cityState.belem > 0.99 &&
    cityState.ananindeua >= 0.3 &&
    cityState.ananindeua <= 0.4 &&
    cityState.moju >= 0.3 &&
    cityState.moju <= 0.4,
  JSON.stringify(cityState),
)
// City tap FILTERS orgs not in the city: non-Belem orgs fade out + drop
// pointer-events. Undo it before the artifact step with an empty tap (the
// documented reset path) so the panel step sees the full scene again.
await page.mouse.click(40, 860) // bottom-left water corner = tap-empty
await page.waitForTimeout(700)

// Arrows never intercept taps (opus r2): each Belém `pos.from` hub point sits
// on the painted city mass, so its projected pixel must route to the city
// interaction group — not to #layer-arrows' decorative paths above it.
// Projection mirrors the app: #camera's screen CTM already composes the
// measurement owner's CTM with k/tx/ty (same viewBox/box, SPEC §3). Skips
// (no fail) when no from-point lands on the 1600×900 viewport.
const rawData = JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8'))
const fromPoints = Object.values(rawData.maps.belem.projects).flatMap((p) => p.pos?.from ?? [])
const { onScreen, routed } = await page.evaluate((pts) => {
  // Manual a–f affine application: getScreenCTM() may return an SVGMatrix
  // (matrixTransform) rather than a DOMMatrix (transformPoint) — the field
  // math is identical for both.
  const m = document.querySelector('#camera').getScreenCTM()
  let onScreen = 0
  for (const p of pts) {
    const x = m.a * p.x + m.c * p.y + m.e
    const y = m.b * p.x + m.d * p.y + m.f
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
    onScreen++
    if (document.elementFromPoint(x, y)?.closest('[data-city-id]'))
      return { onScreen, routed: true }
  }
  return { onScreen, routed: false }
}, fromPoints)
check(
  'arrows: hub pixel routes to city group',
  onScreen === 0 || routed,
  onScreen === 0 ? 'skipped — no on-screen from-point' : `${onScreen} on-screen`,
)

// artifact tap → panel
await page.locator('#layer-artifacts circle[data-artifact-id]').first().click({ force: true })
await page.waitForTimeout(600)
check('artifact tap: panel opens', await page.locator('.panel').isVisible())
check('panel: heading present', (await page.locator('#panel-heading').textContent())?.length > 0)
// Esc closes
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
check('esc: panel closes', (await page.locator('.panel').count()) === 0)
await page.close()

// --- Portrait (cover fit + mobile title retraction into the burger) ---
const portrait = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true, // (pointer: coarse) must match or isMobile() takes the desktop path
})
await portrait.goto(BASE, { waitUntil: 'networkidle' })
await portrait.waitForTimeout(4200) // intro + 1.2s read
// The morph flight (PR #35) ends when visibility flips at flight END —
// its end state is what issue #19 guarantees. Wait for the STATES, never
// a sleep past them (a fixed timeout lands mid-flight on slow runs).
// Playwright signature: waitForFunction(fn, arg, options) — the options
// object MUST be the third argument (opus r1 P2: a bare {timeout} second
// arg is ignored and the cap silently becomes the 30s page default).
await portrait
  .waitForFunction(
    () => document.querySelector('.app-title')?.classList.contains('is-retracted') ?? false,
    undefined,
    { timeout: 10000 },
  )
  .catch(() => {})
await portrait
  .waitForFunction(
    () => {
      const t = document.querySelector('.app-title')
      return t != null && getComputedStyle(t).visibility === 'hidden'
    },
    undefined,
    { timeout: 5000 },
  )
  .catch(() => {})
const cover = await portrait.evaluate(() => {
  const svg = document.querySelector('svg#scene')
  return svg?.getAttribute('preserveAspectRatio')?.includes('slice')
})
check('portrait: slice cover fit', cover)
check(
  'portrait: mobile title morphed into burger (issue #19, PR #35 morph)',
  await portrait.evaluate(() => {
    const title = document.querySelector('.app-title')
    const burger = document.querySelector('.app-burger')
    return (
      title?.classList.contains('is-retracted') === true &&
      // The morph (PR #35) keeps the title at opacity 1 during the flight —
      // the blue blob IS the landing paper — and hides it via visibility at
      // the END of the 0.7s flight. Pin visibility, not opacity.
      getComputedStyle(title).visibility === 'hidden' &&
      burger != null &&
      Number(getComputedStyle(burger).opacity) > 0.9 &&
      document.querySelector('.app-info') === null
    )
  }),
)
await portrait.close()

// --- Reduced motion: final state immediately ---
// Issue #10/#19: reduced-motion keeps READ delays (the title's 1.2s on-screen
// time) and only jumps the ANIMATION. Since the desktop static-title rework
// (issue #23) this 1600×900 no-touch context has NO retraction at all, so the
// final state is asserted directly: title fully visible + info button, no
// burger, no is-retracted (opus 24 P2 — the old under-assertion would stay
// green if desktop retraction regressed).
const rm = await browser.newContext({
  reducedMotion: 'reduce',
  viewport: { width: 1600, height: 900 },
})
const rpage = await rm.newPage()
await rpage.goto(BASE, { waitUntil: 'networkidle' })
await rpage.waitForTimeout(2000)
check(
  'reduced-motion: instant final state (desktop = static title + info)',
  await rpage.evaluate(() => {
    const title = document.querySelector('.app-title')
    return (
      document.documentElement.classList.contains('intro-done') &&
      title != null &&
      Number(getComputedStyle(title).opacity) === 1 &&
      title.classList.contains('is-retracted') === false &&
      document.querySelector('.app-info') != null &&
      document.querySelector('.app-burger') === null
    )
  }),
)
await rm.close()

await browser.close()
console.log(failures.length ? `SMOKE FAILED: ${failures.join(', ')}` : 'SMOKE GREEN')
process.exit(failures.length ? 1 : 0)
