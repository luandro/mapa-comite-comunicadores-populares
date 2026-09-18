import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
await page.goto('http://localhost:5178', { waitUntil: 'load' })
await page.waitForTimeout(6500) // intro done + 1.2s
const samples = []
for (let i = 0; i < 6; i++) {
  samples.push(await page.evaluate(() => {
    const t = document.querySelector('.app-title')
    const cs = getComputedStyle(t)
    return { op: cs.opacity, tf: cs.transform.slice(0, 30), vis: cs.visibility }
  }))
  await page.waitForTimeout(120)
}
console.log(JSON.stringify(samples))
await browser.close()
