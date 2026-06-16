/**
 * Auto-filed bug tasks. When a replay fails, turn the failure into a well-formed board ticket:
 * a ready title, a structured description (what broke and where), and a captured screenshot —
 * idempotent per run so re-reading a run never spawns duplicates.
 */
import { eq } from 'drizzle-orm'
import type { ProbaDb } from './client'
import { tasks as tasksT } from './schema'
import type { TaskEvidence } from './schema'

export interface BugFailure {
  ordinal: number
  kind: string
  action: string
  message: string
  description?: string
}

export interface BugTaskInput {
  runId: string
  caseId?: string
  caseTitle: string
  environment?: string
  failures: BugFailure[]
  screenshot?: string
  appKey?: string
}

/** Compose the ticket title from the first failure — "<test> failed at step N (<action>)". */
export function bugTaskTitle(caseTitle: string, failures: BugFailure[]): string {
  const first = failures[0]
  if (!first) return `${caseTitle} failed`
  return `${caseTitle} — failed at step ${first.ordinal} (${first.action})`
}

/** Compose a human-readable, neutral description (no assistant branding — safe to mirror outbound). */
export function bugTaskDescription(input: BugTaskInput): string {
  const { caseTitle, environment, failures, runId } = input
  const lines = [
    `Automated replay of "${caseTitle}" failed${environment ? ` on ${environment}` : ''}.`,
    '',
    `${failures.length} step${failures.length === 1 ? '' : 's'} did not pass:`,
    ...failures.map(
      (f) =>
        `- step ${f.ordinal} · ${f.kind} ${f.action}${f.description ? ` (${f.description})` : ''} → ${f.message}`,
    ),
    '',
    `Caught during replay run ${runId}.`,
  ]
  return lines.join('\n')
}

/**
 * Create (or refresh) a bug task from a failed run.
 *
 * Deduplication is per TEST, not per run: a test that keeps failing across re-runs gets ONE live
 * ticket, refreshed to the latest run — not a new card every replay. A new ticket is filed only if
 * there's no open bug for the case yet (a resolved/`done` ticket doesn't block re-filing a regression).
 * Returns whether the ticket was newly created or an existing one was updated.
 */
export function createBugTaskFromRun(
  db: ProbaDb,
  input: BugTaskInput,
): { taskId?: string; created: boolean; updated?: boolean } {
  if (input.failures.length === 0) return { created: false }

  const first = input.failures[0]!
  const evidence: TaskEvidence = {
    source: 'replay',
    screenshot: input.screenshot,
    failingStep: {
      ordinal: first.ordinal,
      kind: first.kind,
      action: first.action,
      message: first.message,
    },
    failureCount: input.failures.length,
  }
  const fields = {
    title: bugTaskTitle(input.caseTitle, input.failures),
    description: bugTaskDescription(input),
    // more failing steps → higher priority (1 = urgent .. 3 = medium)
    priority: input.failures.length >= 3 ? 1 : input.failures.length === 2 ? 2 : 3,
    runId: input.runId,
    evidence,
  }

  // existing OPEN auto-filed bug for the same test? → refresh it instead of duplicating
  if (input.caseId) {
    const open = db
      .select()
      .from(tasksT)
      .where(eq(tasksT.caseId, input.caseId))
      .all()
      .find((t) => t.status !== 'done' && (t.evidence as TaskEvidence | null)?.source === 'replay')
    if (open) {
      db.update(tasksT)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(tasksT.id, open.id))
        .run()
      return { taskId: open.id, created: false, updated: true }
    }
  } else {
    // no case to dedup on → fall back to one-per-run
    const sameRun = db.select().from(tasksT).where(eq(tasksT.runId, input.runId)).all()[0]
    if (sameRun) return { taskId: sameRun.id, created: false }
  }

  const [task] = db
    .insert(tasksT)
    .values({
      ...fields,
      status: 'todo',
      assignee: 'agent',
      caseId: input.caseId,
      appKey: input.appKey,
    })
    .returning()
    .all()

  return { taskId: task!.id, created: true }
}

/**
 * Close the loop: when a case replays clean, auto-resolve its open auto-filed bug (mark done with a
 * note pointing at the passing run). Only touches replay-sourced tickets that are not already done.
 * Returns the resolved task id, or null if there was nothing to resolve.
 */
export function resolveBugTaskOnPass(db: ProbaDb, caseId: string, runId?: string): string | null {
  const open = db
    .select()
    .from(tasksT)
    .where(eq(tasksT.caseId, caseId))
    .all()
    .find((t) => t.status !== 'done' && (t.evidence as TaskEvidence | null)?.source === 'replay')
  if (!open) return null
  const note = `Auto-resolved: the test passed on a later replay${runId ? ` (run ${runId})` : ''}.`
  const description = open.description ? `${open.description}\n\n${note}` : note
  db.update(tasksT)
    .set({ status: 'done', description, updatedAt: new Date() })
    .where(eq(tasksT.id, open.id))
    .run()
  return open.id
}
