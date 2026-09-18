import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, hasTouch: false })
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000)
// what's the hit? the painted path might be under the DEV-underlay... we removed it.
const info = await page.evaluate(() => {
  const g = document.querySelector('g[data-city-id="belem"]')
  const r = g.querySelector('path').getBoundingClientRect()
  // elementFromPoint at path center
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  return {
    rect: {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    },
    at: el
      ? el.tagName +
        ' ' +
        (el.getAttribute?.('data-city-id') || el.className?.baseVal || '').toString().slice(0, 30)
      : 'none',
  }
})
console.log(JSON.stringify(info))
await browser.close()
