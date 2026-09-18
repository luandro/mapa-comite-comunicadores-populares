import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000)
await page.evaluate(() => {
  document
    .querySelectorAll('[data-calibration-toolbar],[data-calibration-underlay]')
    .forEach((n) => n.remove())
})
// tap and wait LONGER for the fly (default duration?)
await page.locator('g[data-city-id="belem"] path').first().click({ force: true })
await page.waitForTimeout(9000)
await page.evaluate(() => {
  document
    .querySelectorAll('[data-calibration-toolbar],[data-calibration-underlay]')
    .forEach((n) => n.remove())
})
const state = await page.evaluate(() => {
  const m = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform)
  return { k: +m.a.toFixed(3), tx: Math.round(m.e), ty: Math.round(m.f) }
})
console.log('camera after 9s:', JSON.stringify(state))
await page.screenshot({ path: '/tmp/cb-selected2.png' })
await browser.close()
