import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000)
// focus the city via keyboard (tab to it) to trigger focusin → fly
await page.evaluate(() => {
  const g = document.querySelector('g[data-city-id="belem"]')
  g.dispatchEvent(new FocusEvent('focusin', { bubbles: false }))
})
await page.waitForTimeout(3000)
console.log(
  'camera after focusin:',
  JSON.stringify(
    await page.evaluate(() => {
      const d = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform)
      return { k: +d.a.toFixed(3), tx: Math.round(d.e), ty: Math.round(d.f) }
    }),
  ),
)
await browser.close()
