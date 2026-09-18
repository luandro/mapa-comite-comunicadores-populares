import { chromium } from '@playwright/test'
const browser = await chromium.launch()
// mobile viewport (the issue is mobile-focused but works everywhere)
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
await page.goto('http://localhost:5178', { waitUntil: 'load' })
await page.waitForTimeout(3000)
await page.screenshot({ path: '/tmp/burger-1-title.png' })
await page.waitForTimeout(6000) // intro + 1.2s retract delay
await page.evaluate(() => {
  document
    .querySelectorAll('[data-calibration-toolbar],[data-calibration-underlay]')
    .forEach((n) => n.remove())
})
await page.screenshot({ path: '/tmp/burger-2-retracted.png' })
const st = await page.evaluate(() => {
  const title = document.querySelector('.app-title')
  const burger = document.querySelector('.app-burger')
  return {
    titleRetracted: title?.classList.contains('is-retracted'),
    titleVisible: getComputedStyle(title).visibility,
    burgerShown:
      getComputedStyle(burger).opacity === '1' && getComputedStyle(burger).pointerEvents === 'auto',
  }
})
console.log('state:', JSON.stringify(st))
await page.locator('.app-burger').tap()
await page.waitForTimeout(500)
await page.evaluate(() => {
  document
    .querySelectorAll('[data-calibration-toolbar],[data-calibration-underlay]')
    .forEach((n) => n.remove())
})
await page.screenshot({ path: '/tmp/burger-3-menu.png' })
console.log('menu open:', await page.evaluate(() => !!document.querySelector('.app-menu')))
// close via backdrop
await page.touchscreen.tap(30, 780)
await page.waitForTimeout(400)
console.log('menu closed:', await page.evaluate(() => !document.querySelector('.app-menu')))
await browser.close()
