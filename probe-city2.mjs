import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000)
// remove DEV calibration tooling for clean screenshots
await page.evaluate(() => {
  document
    .querySelectorAll('[data-calibration-toolbar],[data-calibration-underlay]')
    .forEach((n) => n.remove())
})
await page.screenshot({ path: '/tmp/cb-before.png' })
await page.locator('g[data-city-id="belem"] path').first().click({ force: true })
await page.waitForTimeout(4500)
await page.evaluate(() => {
  document
    .querySelectorAll('[data-calibration-toolbar],[data-calibration-underlay]')
    .forEach((n) => n.remove())
})
await page.screenshot({ path: '/tmp/cb-selected.png' })
const state = await page.evaluate(() => {
  const k = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform).a
  return { k }
})
console.log('camera k:', state.k)
await browser.close()
