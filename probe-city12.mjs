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
// Tab ×12 → belem
for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
await page.waitForTimeout(3500)
console.log(
  'camera after kb-focus belem:',
  JSON.stringify(
    await page.evaluate(() => {
      const d = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform)
      return { k: +d.a.toFixed(3), tx: Math.round(d.e), ty: Math.round(d.f) }
    }),
  ),
)
await page.screenshot({ path: '/tmp/cb-kbfocus.png' })
await browser.close()
