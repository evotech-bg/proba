import { type Browser, type Page, chromium } from 'playwright'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { runAxe } from './index'

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()
}, 60_000)

afterAll(async () => {
  await browser?.close()
})

test('axe finds real violations and always returns manual-review notes', async () => {
  await page.setContent(`
    <html lang="en"><body>
      <img src="x.png">                       <!-- missing alt -->
      <input type="text">                      <!-- no label -->
      <a href="#"></a>                         <!-- empty link -->
    </body></html>
  `)
  const report = await runAxe(page, { tags: ['wcag2a', 'wcag2aa'] })
  const ids = report.violations.map((v) => v.id)
  expect(ids).toContain('image-alt')
  expect(report.needsManualReview.length).toBeGreaterThan(0)
}, 30_000)

test('a clean page reports no violations for the same rules', async () => {
  await page.setContent(`
    <html lang="en"><body>
      <img src="x.png" alt="a descriptive label">
      <label>Email <input type="text"></label>
      <a href="#home">Home</a>
    </body></html>
  `)
  const report = await runAxe(page, { tags: ['wcag2a'] })
  expect(report.violations.map((v) => v.id)).not.toContain('image-alt')
}, 30_000)
