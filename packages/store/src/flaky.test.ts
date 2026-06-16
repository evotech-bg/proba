import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { describe, expect, it } from 'vitest'
import { openStore } from './client'
import { computeFlakyScore, deriveCaseVerdict, enforceFlakySLA, updateFlakyRecord } from './flaky'
import { flakyRecords, results, tasks, testCases, testRuns } from './schema'

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

describe('computeFlakyScore', () => {
  it('is 0 for stable, higher for alternating', () => {
    expect(computeFlakyScore(['passed', 'passed', 'passed'])).toBe(0)
    expect(computeFlakyScore(['passed', 'failed', 'passed', 'failed'])).toBe(1)
    expect(computeFlakyScore(['passed', 'passed', 'failed'])).toBeCloseTo(0.5)
  })
})

describe('deriveCaseVerdict', () => {
  it('prioritizes failed > blocked > passed', () => {
    expect(deriveCaseVerdict(['passed', 'failed', 'passed'])).toBe('failed')
    expect(deriveCaseVerdict(['passed', 'blocked'])).toBe('blocked')
    expect(deriveCaseVerdict(['passed', 'passed'])).toBe('passed')
    expect(deriveCaseVerdict([])).toBe('not_run')
  })
})

describe('updateFlakyRecord', () => {
  it('quarantines a case whose history flips, with an SLA', () => {
    const db = openStore(':memory:')
    migrate(db, { migrationsFolder })
    const [tc] = db.insert(testCases).values({ title: 'flaky one' }).returning().all()
    const [run] = db.insert(testRuns).values({}).returning().all()
    const verdicts = ['passed', 'failed', 'passed', 'failed'] as const
    verdicts.forEach((v, i) =>
      db
        .insert(results)
        .values({
          runId: run!.id,
          caseId: tc!.id,
          verdict: v,
          executedAt: new Date(2026, 0, i + 1),
        })
        .run(),
    )

    const rec = updateFlakyRecord(db, tc!.id, {
      threshold: 0.2,
      slaMs: 86_400_000,
      now: new Date(2026, 0, 10),
    })
    expect(rec.score).toBe(1)
    expect(rec.quarantined).toBe(true)
    expect(rec.slaDueAt).toBeInstanceOf(Date)

    // a second call updates in place (no duplicate row)
    updateFlakyRecord(db, tc!.id)
    expect(db.select().from(flakyRecords).all()).toHaveLength(1)
  })
})

describe('enforceFlakySLA', () => {
  it('creates a board task for an overdue quarantine, once', () => {
    const db = openStore(':memory:')
    migrate(db, { migrationsFolder })
    const [tc] = db.insert(testCases).values({ title: 'wobbly checkout' }).returning().all()
    const [run] = db.insert(testRuns).values({}).returning().all()
    for (const [i, v] of (['passed', 'failed', 'passed', 'failed'] as const).entries()) {
      db.insert(results)
        .values({
          runId: run!.id,
          caseId: tc!.id,
          verdict: v,
          executedAt: new Date(2026, 0, i + 1),
        })
        .run()
    }
    // quarantine with an SLA already in the past
    updateFlakyRecord(db, tc!.id, { threshold: 0.2, slaMs: 1000, now: new Date(2026, 0, 5) })

    const r1 = enforceFlakySLA(db, { now: new Date(2026, 0, 10) })
    expect(r1.createdTaskIds).toHaveLength(1)
    const r2 = enforceFlakySLA(db, { now: new Date(2026, 0, 11) }) // idempotent
    expect(r2.createdTaskIds).toHaveLength(0)
    const taskRows = db.select().from(tasks).all()
    expect(taskRows).toHaveLength(1)
    expect(taskRows[0]!.title).toContain('Flaky SLA overdue')
  })
})
