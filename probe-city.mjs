import { chromium } from '@playwright/test'
const browser = await chromium.launch()
// Desktop viewport
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000) // intro settles
await page.screenshot({ path: '/tmp/city-before.png' })
// Tap Belém (click its city group)
const belem = page.locator('g[data-city-id="belem"] path').first()
await belem.click({ force: true })
await page.waitForTimeout(4500) // replay + fly
await page.screenshot({ path: '/tmp/city-selected.png' })
// state dump
const state = await page.evaluate(() => {
  const out = {}
  out.cameraK = new DOMMatrix(getComputedStyle(document.querySelector('#camera')).transform).a
  out.cities = Object.fromEntries(
    Array.from(document.querySelectorAll('g[data-city-id]')).map((g) => [
      g.getAttribute('data-city-id'),
      getComputedStyle(g).opacity,
    ]),
  )
  const arts = Array.from(document.querySelectorAll('g[data-artifact-id]'))
  out.artifacts = arts.map((g) => ({
    id: g.getAttribute('data-artifact-id'),
    op: getComputedStyle(g).opacity,
  }))
  out.focusOutline = getComputedStyle(
    document.querySelector('g[data-city-id="belem"]'),
  ).outlineStyle
  return out
})
console.log(JSON.stringify(state, null, 1))
await browser.close()
