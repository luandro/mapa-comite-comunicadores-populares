import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000)
// call camera.flyTo through the exposed controller? Not exposed on window.
// Instead: check what happens with focusCity via Enter (which calls applyCityState only)
// and separately test flyTo by directly invoking d3 zoom transform? Simplest:
// does ANY fly work? Test zoomBy via the + button.
await page.locator('.app-controls button').first().click()
await page.waitForTimeout(1500)
console.log(
  'camera after + :',
  JSON.stringify(
    await page.evaluate(() => {
      const d = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform)
      return { k: +d.a.toFixed(3) }
    }),
  ),
)
// and a real artifact tap fly (click totem → focusArtifact via artifact-tap → App)
await page.evaluate(() => {
  const g = document.querySelector('g[data-artifact-id="na_cuia"]')
  g.querySelector('path').dispatchEvent(new MouseEvent('click', { bubbles: true }))
})
await page.waitForTimeout(2500)
console.log(
  'camera after totem tap:',
  JSON.stringify(
    await page.evaluate(() => {
      const d = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform)
      return { k: +d.a.toFixed(3), tx: Math.round(d.e), ty: Math.round(d.f) }
    }),
  ),
)
await browser.close()
