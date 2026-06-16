import { type Browser, type Page, chromium } from 'playwright'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { layoutAudit } from './page'

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()
}, 60_000)

afterAll(async () => {
  await browser?.close()
})

test('layoutAudit catches overlap, truncation and non-clickable on a real page', async () => {
  await page.setContent(`
    <div id="btn" style="position:absolute;left:0;top:0;width:100px;height:40px">Button</div>
    <div id="ov"  style="position:absolute;left:10px;top:10px;width:50px;height:20px;opacity:0">x</div>
    <div id="lbl" style="width:50px;white-space:nowrap;overflow:hidden">a very long label that overflows its box</div>
  `)
  const audit = await layoutAudit(page, ['#btn', '#ov', '#lbl'])

  expect(audit.overlaps).toContainEqual({ a: '#btn', b: '#ov' })
  expect(audit.nonClickable).toContain('#ov')
  expect(audit.truncated).toContain('#lbl')
}, 30_000)
