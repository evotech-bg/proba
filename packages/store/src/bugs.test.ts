import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { openStore } from './client'
import { tasks, testCases, testRuns } from './schema'
import {
  bugTaskDescription,
  bugTaskTitle,
  createBugTaskFromRun,
  resolveBugTaskOnPass,
} from './bugs'

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

const failures = [
  { ordinal: 3, kind: 'web', action: 'click', message: 'locator timeout: button[name=Sign in]' },
  { ordinal: 4, kind: 'web', action: 'expect', message: 'text lacks "Welcome"' },
]

describe('bug task title/description', () => {
  it('titles from the first failure', () => {
    expect(bugTaskTitle('login flow', failures)).toBe('login flow — failed at step 3 (click)')
  })
  it('lists every failing step and where it was caught', () => {
    const d = bugTaskDescription({
      runId: 'run-1',
      caseTitle: 'login flow',
      environment: 'replay',
      failures,
    })
    expect(d).toContain('step 3 · web click')
    expect(d).toContain('step 4 · web expect')
    expect(d).toContain('Caught during replay run run-1')
  })
})

describe('createBugTaskFromRun', () => {
  it('creates a well-formed bug task with evidence, idempotent per run', () => {
    const db = openStore(':memory:')
    migrate(db, { migrationsFolder })
    const [tc] = db
      .insert(testCases)
      .values({ title: 'login flow', polarity: 'negative' })
      .returning()
      .all()
    const [run] = db.insert(testRuns).values({ environment: 'replay' }).returning().all()

    const first = createBugTaskFromRun(db, {
      runId: run!.id,
      caseId: tc!.id,
      caseTitle: 'login flow',
      environment: 'replay',
      failures,
      screenshot: `/shots/${run!.id}-3.png`,
    })
    expect(first.created).toBe(true)
    expect(first.taskId).toBeTruthy()

    const task = db.select().from(tasks).where(eq(tasks.id, first.taskId!)).all()[0]
    expect(task!.title).toContain('failed at step 3')
    expect(task!.assignee).toBe('agent')
    expect(task!.runId).toBe(run!.id)
    expect(task!.evidence?.source).toBe('replay')
    expect(task!.evidence?.screenshot).toBe(`/shots/${run!.id}-3.png`)
    expect(task!.evidence?.failingStep?.ordinal).toBe(3)
    expect(task!.priority).toBe(2) // two failing steps

    // re-running the SAME failing test (a NEW run) refreshes the one ticket, never duplicates
    const run2 = db.insert(testRuns).values({ environment: 'replay' }).returning().all()[0]
    const second = createBugTaskFromRun(db, {
      runId: run2!.id,
      caseId: tc!.id,
      caseTitle: 'login flow',
      failures,
    })
    expect(second.created).toBe(false)
    expect(second.updated).toBe(true)
    expect(second.taskId).toBe(first.taskId)
    expect(db.select().from(tasks).all()).toHaveLength(1)
    // the live ticket now points at the latest run
    expect(db.select().from(tasks).where(eq(tasks.id, first.taskId!)).all()[0]!.runId).toBe(
      run2!.id,
    )
  })

  it('re-files a fresh ticket only after the previous one is resolved (done)', () => {
    const db = openStore(':memory:')
    migrate(db, { migrationsFolder })
    const tc = db
      .insert(testCases)
      .values({ title: 'checkout', polarity: 'positive' })
      .returning()
      .all()[0]
    const r1 = db.insert(testRuns).values({ environment: 'replay' }).returning().all()[0]
    const a = createBugTaskFromRun(db, {
      runId: r1!.id,
      caseId: tc!.id,
      caseTitle: 'checkout',
      failures,
    })
    expect(a.created).toBe(true)
    // resolve it
    db.update(tasks).set({ status: 'done' }).where(eq(tasks.id, a.taskId!)).run()
    // a new failure files a NEW ticket (regression), doesn't touch the resolved one
    const r2 = db.insert(testRuns).values({ environment: 'replay' }).returning().all()[0]
    const b = createBugTaskFromRun(db, {
      runId: r2!.id,
      caseId: tc!.id,
      caseTitle: 'checkout',
      failures,
    })
    expect(b.created).toBe(true)
    expect(b.taskId).not.toBe(a.taskId)
    expect(db.select().from(tasks).all()).toHaveLength(2)
  })

  it('no-ops when there are no failures', () => {
    const db = openStore(':memory:')
    migrate(db, { migrationsFolder })
    const [run] = db.insert(testRuns).values({ environment: 'replay' }).returning().all()
    const r = createBugTaskFromRun(db, { runId: run!.id, caseTitle: 'clean', failures: [] })
    expect(r.created).toBe(false)
    expect(db.select().from(tasks).all()).toHaveLength(0)
  })
})

describe('resolveBugTaskOnPass', () => {
  it('marks the open auto-bug done when the case passes again', () => {
    const db = openStore(':memory:')
    migrate(db, { migrationsFolder })
    const tc = db
      .insert(testCases)
      .values({ title: 'login flow', polarity: 'negative' })
      .returning()
      .all()[0]
    const r1 = db.insert(testRuns).values({ environment: 'replay' }).returning().all()[0]
    const bug = createBugTaskFromRun(db, {
      runId: r1!.id,
      caseId: tc!.id,
      caseTitle: 'login flow',
      failures,
    })
    expect(bug.created).toBe(true)

    const r2 = db.insert(testRuns).values({ environment: 'replay' }).returning().all()[0]
    const resolvedId = resolveBugTaskOnPass(db, tc!.id, r2!.id)
    expect(resolvedId).toBe(bug.taskId)
    const t = db.select().from(tasks).where(eq(tasks.id, bug.taskId!)).all()[0]!
    expect(t.status).toBe('done')
    expect(t.description).toContain('Auto-resolved')

    // idempotent: nothing left open to resolve
    expect(resolveBugTaskOnPass(db, tc!.id, r2!.id)).toBeNull()
  })
})
