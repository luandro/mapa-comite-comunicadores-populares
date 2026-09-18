import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const logs = []
page.on('console', (m) => {
  const t = m.text()
  if (t.includes('[scene]') || t.includes('flyTo')) logs.push(t.slice(0, 120))
})
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000)
// instrument: did click register? aria-pressed?
await page.locator('g[data-city-id="belem"] path').first().click({ force: true })
await page.waitForTimeout(500)
const pressed = await page.evaluate(() =>
  document.querySelector('g[data-city-id="belem"]')?.getAttribute('aria-pressed'),
)
console.log('belem pressed:', pressed)
await page.waitForTimeout(9000)
const m = await page.evaluate(() => {
  const d = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform)
  return { k: +d.a.toFixed(3), tx: Math.round(d.e), ty: Math.round(d.f) }
})
console.log('camera:', JSON.stringify(m))
console.log('logs:', JSON.stringify(logs))
await browser.close()
