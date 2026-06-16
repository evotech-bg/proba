import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StepSpec } from './types'
import { WebSession } from './web'

let session: WebSession

beforeAll(async () => {
  session = await WebSession.launch({ headless: true })
}, 60_000)

afterAll(async () => {
  await session?.close()
})

describe('WebSession (real chromium)', () => {
  it('resolves role locators, clicks, and asserts DOM via canonical steps', async () => {
    await session.setContent(`
      <button onclick="document.getElementById('out').textContent='clicked!'">Save</button>
      <div id="out" role="status">idle</div>
    `)

    const click: StepSpec = {
      kind: 'web',
      action: 'click',
      target: { strategy: 'role', value: 'button', name: 'Save' },
    }
    const clickResult = await session.execute(click)
    expect(clickResult.verdict).toBe('passed')

    const expectStep: StepSpec = {
      kind: 'web',
      action: 'expect',
      target: { strategy: 'role', value: 'status' },
      assertions: [{ type: 'dom', toContainText: 'clicked!', visible: true }],
    }
    const assertResult = await session.execute(expectStep)
    expect(assertResult.verdict).toBe('passed')
  }, 30_000)

  it('fails a wrong DOM expectation rather than passing silently', async () => {
    await session.setContent('<div role="status">nope</div>')
    const r = await session.execute({
      kind: 'web',
      action: 'expect',
      target: { strategy: 'role', value: 'status' },
      assertions: [{ type: 'dom', toContainText: 'success' }],
    })
    expect(r.verdict).toBe('failed')
  }, 30_000)
})

describe('snapshot assertions (text + visual)', () => {
  let snap: WebSession
  let dir: string
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'proba-snap-'))
    snap = await WebSession.launch({ headless: true, snapshotDir: dir })
  }, 60_000)
  afterAll(async () => {
    await snap?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  const expectStep = (assertions: StepSpec['assertions']): StepSpec => ({
    kind: 'web',
    action: 'expect',
    target: { strategy: 'role', value: 'status' },
    assertions,
  })

  it('text snapshot: first run sets the baseline, match passes, drift fails', async () => {
    await snap.setContent('<div role="status">Начало · Новини · Видео</div>')
    // first run establishes the baseline → passes
    expect((await snap.execute(expectStep([{ type: 'snapshot', name: 'nav' }]))).verdict).toBe(
      'passed',
    )
    // unchanged content → still passes
    expect((await snap.execute(expectStep([{ type: 'snapshot', name: 'nav' }]))).verdict).toBe(
      'passed',
    )
    // changed content → drift detected
    await snap.setContent('<div role="status">Начало · Новини · Ревюта</div>')
    const drift = await snap.execute(expectStep([{ type: 'snapshot', name: 'nav' }]))
    expect(drift.verdict).toBe('failed')
    expect(drift.message).toContain('drifted')
  }, 30_000)

  it('visual snapshot: baseline then a changed element fails the pixel diff', async () => {
    await snap.setContent(
      '<div role="status" style="width:120px;height:40px;background:#3366cc"></div>',
    )
    expect((await snap.execute(expectStep([{ type: 'visual', name: 'badge' }]))).verdict).toBe(
      'passed',
    )
    expect((await snap.execute(expectStep([{ type: 'visual', name: 'badge' }]))).verdict).toBe(
      'passed',
    )
    await snap.setContent(
      '<div role="status" style="width:120px;height:40px;background:#cc3333"></div>',
    )
    const changed = await snap.execute(expectStep([{ type: 'visual', name: 'badge' }]))
    expect(changed.verdict).toBe('failed')
    expect(changed.message).toContain('visual')
  }, 30_000)
})
