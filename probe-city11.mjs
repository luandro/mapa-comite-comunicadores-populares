import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5176', { waitUntil: 'load' })
await page.waitForTimeout(7000)
const seq = []
for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Tab')
  seq.push(
    await page.evaluate(() => {
      const a = document.activeElement
      return (
        a?.getAttribute?.('data-city-id') ||
        a?.getAttribute?.('data-artifact-id') ||
        a?.tagName ||
        '?'
      )
    }),
  )
}
console.log('tab sequence:', JSON.stringify(seq))
await browser.close()
