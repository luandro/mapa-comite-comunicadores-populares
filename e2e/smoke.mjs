// Phase 7 Playwright smoke suite: load → tap city → tap artifact → panel
// opens → Esc → reduced-motion end-to-end. Also used against the live URL.
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
check(
  'load: title visible',
  await page.evaluate(() => getComputedStyle(document.querySelector('.app-title')).opacity === '1'),
)

// city tap raise
const city = page.locator('[data-city-id="belem"]')
await city.click({ force: true })
await page.waitForTimeout(500)
const raised = await city.evaluate(
  (g) => new DOMMatrixReadOnly(getComputedStyle(g).transform).m42 < 0,
)
check('city tap: raise', raised)

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

// --- Portrait (cover fit) ---
const portrait = await browser.newPage({ viewport: { width: 390, height: 844 } })
await portrait.goto(BASE, { waitUntil: 'networkidle' })
await portrait.waitForTimeout(4200)
const cover = await portrait.evaluate(() => {
  const svg = document.querySelector('svg#scene')
  return svg?.getAttribute('preserveAspectRatio')?.includes('slice')
})
check('portrait: slice cover fit', cover)
await portrait.close()

// --- Reduced motion: final state immediately ---
const rm = await browser.newContext({
  reducedMotion: 'reduce',
  viewport: { width: 1600, height: 900 },
})
const rpage = await rm.newPage()
await rpage.goto(BASE, { waitUntil: 'networkidle' })
await rpage.waitForTimeout(800)
check(
  'reduced-motion: instant final state',
  await rpage.evaluate(
    () => getComputedStyle(document.querySelector('.app-title')).opacity === '1',
  ),
)
await rm.close()

await browser.close()
console.log(failures.length ? `SMOKE FAILED: ${failures.join(', ')}` : 'SMOKE GREEN')
process.exit(failures.length ? 1 : 0)
