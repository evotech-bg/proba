/**
 * Flaky detection + status rollup. Pure functions over verdict history, plus a quarantine writer.
 *
 * A test is flaky when it yields different verdicts on the same code — we score that from the
 * pass/fail transition rate, then quarantine (non-blocking) with an SLA so it doesn't rot forever.
 */
import { eq } from 'drizzle-orm'
import type { ProbaDb } from './client'
import {
  flakyRecords,
  results as resultsT,
  tasks as tasksT,
  testCases as testCasesT,
} from './schema'
import type { Verdict } from './schema'

/** Flakiness score 0..1 from chronological verdicts (transition rate between pass/fail). */
export function computeFlakyScore(verdicts: Verdict[]): number {
  const pf = verdicts.filter((v) => v === 'passed' || v === 'failed')
  if (pf.length < 2) return 0
  let transitions = 0
  for (let i = 1; i < pf.length; i++) if (pf[i] !== pf[i - 1]) transitions++
  return transitions / (pf.length - 1)
}

/** Roll up step verdicts into a case verdict (failed > blocked > passed). */
export function deriveCaseVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.length === 0) return 'not_run'
  if (verdicts.includes('failed')) return 'failed'
  if (verdicts.includes('blocked')) return 'blocked'
  if (verdicts.every((v) => v === 'skipped')) return 'skipped'
  return 'passed'
}

export interface FlakyOptions {
  threshold?: number
  /** SLA window in ms (quarantine must be resolved within) */
  slaMs?: number
  now?: Date
}

/** Recompute a case's flakiness from its result history and upsert the quarantine record. */
export function updateFlakyRecord(db: ProbaDb, caseId: string, opts: FlakyOptions = {}) {
  const threshold = opts.threshold ?? 0.2
  const now = opts.now ?? new Date()
  const history = db
    .select()
    .from(resultsT)
    .where(eq(resultsT.caseId, caseId))
    .all()
    .sort((a, b) => +a.executedAt - +b.executedAt)
    .map((r) => r.verdict)

  const score = computeFlakyScore(history)
  const quarantined = score >= threshold
  const slaDueAt = quarantined && opts.slaMs ? new Date(+now + opts.slaMs) : null

  const existing = db.select().from(flakyRecords).where(eq(flakyRecords.caseId, caseId)).all()[0]
  const values = { caseId, score, quarantined, slaDueAt, lastSeenAt: now }
  if (existing) {
    db.update(flakyRecords).set(values).where(eq(flakyRecords.caseId, caseId)).run()
  } else {
    db.insert(flakyRecords).values(values).run()
  }
  return { score, quarantined, slaDueAt }
}

/**
 * SLA enforcement: any quarantined flaky case whose SLA is overdue gets a board task (once).
 * Keeps quarantine temporary instead of a permanent dumping ground. Idempotent per case.
 */
export function enforceFlakySLA(db: ProbaDb, opts: { now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const overdue = db
    .select()
    .from(flakyRecords)
    .all()
    .filter((f) => f.quarantined && f.slaDueAt != null && +f.slaDueAt <= +now)

  const created: string[] = []
  for (const rec of overdue) {
    // idempotent: skip if a task for this case already exists
    const already = db.select().from(tasksT).where(eq(tasksT.caseId, rec.caseId)).all()
    if (already.length > 0) continue
    const tc = db.select().from(testCasesT).where(eq(testCasesT.id, rec.caseId)).all()[0]
    const [task] = db
      .insert(tasksT)
      .values({
        title: `Flaky SLA overdue: ${tc?.title ?? rec.caseId}`,
        description: `Quarantined flaky test exceeded its SLA (score ${rec.score.toFixed(2)}). Fix the root cause or remove.`,
        status: 'todo',
        priority: 1,
        caseId: rec.caseId,
      })
      .returning()
      .all()
    created.push(task!.id)
  }
  return { createdTaskIds: created }
}
