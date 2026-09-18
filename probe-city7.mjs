import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000)
// call the controller's focusCity directly through keyboard activation instead
// (Enter on focused city g) — or check: maybe onSceneClick toggle logic turned it OFF
await page.evaluate(() => {
  const g = document.querySelector('g[data-city-id="belem"]')
  g.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
})
await page.waitForTimeout(300)
console.log(
  'pressed after Enter:',
  await page.evaluate(() =>
    document.querySelector('g[data-city-id="belem"]')?.getAttribute('aria-pressed'),
  ),
)
await page.waitForTimeout(8000)
console.log(
  'camera:',
  JSON.stringify(
    await page.evaluate(() => {
      const d = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform)
      return { k: +d.a.toFixed(3), tx: Math.round(d.e), ty: Math.round(d.f) }
    }),
  ),
)
await browser.close()
