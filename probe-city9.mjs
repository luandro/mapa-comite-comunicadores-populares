import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000)
// Real keyboard navigation: Tab until belem g is focused (12 tabs max)
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    city: document.activeElement?.getAttribute?.('data-city-id'),
    art: document.activeElement?.getAttribute?.('data-artifact-id'),
  }))
  if (focused.city === 'belem') {
    console.log('tab', i, '→ belem focused')
    break
  }
}
await page.waitForTimeout(3500)
console.log(
  'camera after kb-focus:',
  JSON.stringify(
    await page.evaluate(() => {
      const d = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform)
      return { k: +d.a.toFixed(3), tx: Math.round(d.e), ty: Math.round(d.f) }
    }),
  ),
)
await browser.close()
