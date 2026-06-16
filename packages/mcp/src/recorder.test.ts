import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { knowledge, openStore, results, steps } from '@proba/store'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { Recorder } from './recorder'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'store',
  'migrations',
)

const PAGE = `data:text/html,${encodeURIComponent(
  `<button onclick="document.getElementById('out').textContent='clicked!'">Save</button>
   <div id="out" role="status">idle</div>`,
)}`

let recorder: Recorder
const db = openStore(':memory:')
const out = mkdtempSync(join(tmpdir(), 'proba-'))

beforeAll(() => {
  migrate(db, { migrationsFolder })
  recorder = new Recorder(db, out)
}, 60_000)

afterAll(async () => {
  await recorder?.closeSession()
})

test('full loop: drive web → record to store → finalize → Playwright TS + Gherkin artifacts', async () => {
  const opened = await recorder.openSession({ appKey: 'demo', headless: true })
  expect(opened.knownSelectors).toBe(0) // nothing known yet

  recorder.startCase('save button records a click', 'positive')
  expect(
    (
      await recorder.act({
        kind: 'web',
        action: 'navigate',
        params: { url: PAGE },
        description: 'the page is open',
      })
    ).verdict,
  ).toBe('passed')
  expect(
    (
      await recorder.act({
        kind: 'web',
        action: 'click',
        target: { strategy: 'role', value: 'button', name: 'Save' },
        description: 'the user clicks Save',
      })
    ).verdict,
  ).toBe('passed')
  expect(
    (
      await recorder.act({
        kind: 'web',
        action: 'expect',
        target: { strategy: 'role', value: 'status' },
        assertions: [{ type: 'dom', toContainText: 'clicked!' }],
        description: 'a confirmation appears',
      })
    ).verdict,
  ).toBe('passed')

  // the moat: persist the discovered selector
  recorder.remember('selector', 'save.button', { strategy: 'role', value: 'button', name: 'Save' })

  // recorded to the durable store
  expect(db.select().from(steps).all()).toHaveLength(3)
  expect(
    db
      .select()
      .from(results)
      .all()
      .every((r) => r.verdict === 'passed'),
  ).toBe(true)

  // finalize → both artifacts written and correct
  const { tsPath, featurePath } = recorder.finalizeCase()
  expect(existsSync(tsPath)).toBe(true)
  const ts = readFileSync(tsPath, 'utf8')
  expect(ts).toContain("await page.getByRole('button', { name: 'Save' }).click()")
  expect(ts).toContain("await expect(page.getByRole('status')).toContainText('clicked!')")
  const feature = readFileSync(featurePath, 'utf8')
  expect(feature).toContain('Scenario: save button records a click')
  expect(feature).toContain('Given the page is open')
}, 60_000)

test('replay re-runs a recorded case from the store', async () => {
  const r = new Recorder(db, out)
  await r.openSession({ appKey: 'replay', headless: true })
  r.startCase('replayable click')
  await r.act({ kind: 'web', action: 'navigate', params: { url: PAGE } })
  await r.act({
    kind: 'web',
    action: 'click',
    target: { strategy: 'role', value: 'button', name: 'Save' },
  })
  await r.act({
    kind: 'web',
    action: 'expect',
    target: { strategy: 'role', value: 'status' },
    assertions: [{ type: 'dom', toContainText: 'clicked!' }],
  })

  const res = await r.replay()
  expect(res.passed).toBe(3)
  expect(res.failed).toBe(0)
  await r.closeSession()
}, 60_000)

test('layout audit + a11y scan + visual diff run on the live recorded page', async () => {
  const r = new Recorder(db, out)
  await r.openSession({ appKey: 'audit', headless: true })
  r.startCase('audit page')
  await r.act({
    kind: 'web',
    action: 'navigate',
    params: {
      url: `data:text/html,${encodeURIComponent('<div id="a" role="status">ok</div><img id="b" src="x.png">')}`,
    },
  })

  const audit = await r.layoutAudit(['#a', '#b'])
  expect(audit).toHaveProperty('overlaps')

  const scan = await r.a11yScan({ tags: ['wcag2a'] })
  expect(scan.violations.map((v) => v.id)).toContain('image-alt') // img missing alt
  expect(scan.needsManualReview.length).toBeGreaterThan(0)

  const first = await r.diff('audit-baseline')
  expect(first.baseline).toBe('created')
  const second = await r.diff('audit-baseline')
  expect(second.pass).toBe(true) // same page → matches baseline

  await r.closeSession()
}, 60_000)

test('moat: a new session resumes with prior knowledge instead of re-exploring', async () => {
  const known = db.select().from(knowledge).where(eq(knowledge.appKey, 'demo')).all()
  expect(known.length).toBeGreaterThanOrEqual(1)
  const r2 = new Recorder(db, out)
  const opened = await r2.openSession({ appKey: 'demo', headless: true })
  expect(opened.knownSelectors).toBeGreaterThanOrEqual(1)
  expect(r2.recallSelector('save.button')).toMatchObject({ strategy: 'role', name: 'Save' })
  await r2.closeSession()
}, 60_000)
