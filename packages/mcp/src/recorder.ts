/**
 * Recorder — the durable session core behind the MCP tools.
 *
 * Every action is executed AND persisted immediately, so the session is never ephemeral:
 *   open session → act/request/db (each recorded) → snapshot → finalize → artifacts.
 * Discovered selectors/quirks/healing persist as `knowledge` (the moat) keyed by appKey,
 * so a later session resumes instead of re-exploring.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { runAxe } from '@proba/a11y'
import { type CanonicalTest, toGherkin, toPlaywrightTs } from '@proba/codegen'
import { type StepResult, type StepSpec, WebSession, executeApi } from '@proba/engine'
import type { Locator } from '@proba/locator'
import { type LayoutAudit, layoutAudit, pixelDiff } from '@proba/overlay'
import {
  type ProbaDb,
  artifacts as artifactsT,
  assertions as assertionsT,
  knowledge as knowledgeT,
  resolveBugTaskOnPass,
  results as resultsT,
  sessions as sessionsT,
  steps as stepsT,
  testCases as testCasesT,
  testRuns as testRunsT,
} from '@proba/store'
import { and, asc, eq } from 'drizzle-orm'

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'test'

/** Collect interactive elements on the live page as candidate locators (for heal diagnosis). */
async function collectCandidates(
  page: import('playwright').Page,
): Promise<Array<{ role?: string; name?: string; text?: string; testId?: string; tag: string }>> {
  return page.evaluate(() => {
    const out: Array<{
      role?: string
      name?: string
      text?: string
      testId?: string
      tag: string
    }> = []
    const els = document.querySelectorAll(
      'button, a, input, select, textarea, [role], [data-testid], [aria-label]',
    )
    for (const el of Array.from(els).slice(0, 40)) {
      const e = el as HTMLElement
      const name =
        e.getAttribute('aria-label') ||
        (e as HTMLInputElement).placeholder ||
        e.getAttribute('alt') ||
        (e.textContent ?? '').trim().slice(0, 60) ||
        undefined
      out.push({
        role: e.getAttribute('role') ?? undefined,
        name: name || undefined,
        text: (e.textContent ?? '').trim().slice(0, 60) || undefined,
        testId: e.getAttribute('data-testid') ?? undefined,
        tag: e.tagName.toLowerCase(),
      })
    }
    return out
  })
}

export interface OpenSessionInput {
  appKey: string
  charter?: string
  baseURL?: string
  headless?: boolean
}

export class Recorder {
  private web?: WebSession
  private sessionId?: string
  private runId?: string
  private caseId?: string
  private ordinal = 0
  private appKey = ''

  constructor(
    private readonly db: ProbaDb,
    private readonly outDir = '.proba',
  ) {}

  /** Open a session; returns the knowledge already known about this app (resume, don't re-explore). */
  async openSession(
    input: OpenSessionInput,
  ): Promise<{ sessionId: string; knownSelectors: number }> {
    this.appKey = input.appKey
    const [session] = this.db
      .insert(sessionsT)
      .values({ appKey: input.appKey, charter: input.charter, status: 'open' })
      .returning()
      .all()
    this.sessionId = session!.id
    const [run] = this.db.insert(testRunsT).values({ environment: input.baseURL }).returning().all()
    this.runId = run!.id
    this.web = await WebSession.launch({
      headless: input.headless ?? true,
      baseURL: input.baseURL,
      snapshotDir: join(this.outDir, 'snapshots'),
    })

    const known = this.db.select().from(knowledgeT).where(eq(knowledgeT.appKey, input.appKey)).all()
    return {
      sessionId: this.sessionId,
      knownSelectors: known.filter((k) => k.kind === 'selector').length,
    }
  }

  startCase(title: string, polarity: 'positive' | 'negative' = 'positive'): string {
    const [tc] = this.db
      .insert(testCasesT)
      // scope the case to the session's app so it shows under the right project in the dashboard
      .values({
        title,
        polarity,
        technique: 'exploratory',
        lifecycle: 'draft',
        appKey: this.appKey || undefined,
      })
      .returning()
      .all()
    this.caseId = tc!.id
    this.ordinal = 0
    return this.caseId
  }

  /** Execute + record a web step. */
  async act(step: StepSpec): Promise<StepResult> {
    if (!this.web) throw new Error('no open session')
    const result = await this.web.execute(step)
    this.persistStep(step, result)
    return result
  }

  /** Execute + record an API step. */
  async request(step: StepSpec): Promise<StepResult> {
    const result = await executeApi(step)
    this.persistStep(step, result)
    return result
  }

  private persistStep(step: StepSpec, result: StepResult): void {
    if (!this.caseId) this.startCase('Recorded session')
    const [row] = this.db
      .insert(stepsT)
      .values({
        caseId: this.caseId!,
        ordinal: ++this.ordinal,
        kind: step.kind,
        action: step.action,
        target: step.target as Record<string, unknown> | undefined,
        params: step.params,
        description: step.description,
      })
      .returning()
      .all()
    for (const a of step.assertions ?? []) {
      this.db
        .insert(assertionsT)
        .values({ stepId: row!.id, type: a.type as never, spec: a as Record<string, unknown> })
        .run()
    }
    this.db
      .insert(resultsT)
      .values({
        runId: this.runId!,
        caseId: this.caseId!,
        stepId: row!.id,
        verdict: result.verdict,
        durationMs: Math.round(result.durationMs),
        message: result.message,
      })
      .run()
  }

  /** Capture a screenshot and record it as an artifact (optionally attached to a task/ticket). */
  async snapshot(name: string, taskId?: string): Promise<string> {
    if (!this.web) throw new Error('no open session')
    const path = join(this.outDir, 'snapshots', `${slug(name)}.png`)
    mkdirSync(dirname(path), { recursive: true })
    await this.web.screenshot(path)
    this.db.insert(artifactsT).values({ type: 'screenshot', path, taskId, meta: { name } }).run()
    return path
  }

  /** Geometry/alignment audit on the live page — overlap/truncation/zero-dim/non-clickable. */
  async layoutAudit(selectors: string[]): Promise<LayoutAudit> {
    if (!this.web) throw new Error('no open session')
    return layoutAudit(this.web.page, selectors)
  }

  /** Accessibility scan (axe-core) on the live page. */
  async a11yScan(opts: { tags?: string[]; include?: string[]; exclude?: string[] } = {}) {
    if (!this.web) throw new Error('no open session')
    return runAxe(this.web.page, opts as Parameters<typeof runAxe>[1])
  }

  /** Visual diff vs a named baseline; first run establishes the baseline (passes). */
  async diff(name: string, maxDiffPixelRatio = 0.01) {
    if (!this.web) throw new Error('no open session')
    const baseline = join(this.outDir, 'baselines', `${slug(name)}.png`)
    const current = join(this.outDir, 'snapshots', `${slug(name)}-current.png`)
    mkdirSync(dirname(baseline), { recursive: true })
    mkdirSync(dirname(current), { recursive: true })
    await this.web.screenshot(current)
    if (!existsSync(baseline)) {
      copyFileSync(current, baseline)
      return { baseline: 'created', diffPixels: 0, ratio: 0, pass: true }
    }
    const r = pixelDiff(readFileSync(baseline), readFileSync(current), { maxDiffPixelRatio })
    return { baseline: 'compared', diffPixels: r.diffPixels, ratio: r.ratio, pass: r.pass }
  }

  /** Persist a discovered fact across sessions (the moat). */
  remember(
    kind: 'selector' | 'quirk' | 'exploration' | 'healing',
    key: string,
    value: Record<string, unknown>,
    confidence = 0.8,
  ): void {
    this.db
      .insert(knowledgeT)
      .values({ appKey: this.appKey, sessionId: this.sessionId, kind, key, value, confidence })
      .run()
  }

  /** Recall a selector learned in a prior session. */
  recallSelector(key: string): Locator | undefined {
    const rows = this.db.select().from(knowledgeT).where(eq(knowledgeT.appKey, this.appKey)).all()
    const hit = rows.find((r) => r.kind === 'selector' && r.key === key)
    return hit?.value as unknown as Locator | undefined
  }

  /** Load a recorded case's steps back into executable StepSpecs (used by finalize + replay). */
  private loadCaseSteps(caseId: string): StepSpec[] {
    const stepRows = this.db
      .select()
      .from(stepsT)
      .where(eq(stepsT.caseId, caseId))
      .orderBy(asc(stepsT.ordinal))
      .all()
    return stepRows.map((s) => ({
      kind: s.kind,
      action: s.action,
      target: (s.target ?? undefined) as unknown as Locator | undefined,
      params: s.params ?? undefined,
      description: s.description ?? undefined,
      assertions: this.db
        .select()
        .from(assertionsT)
        .where(eq(assertionsT.stepId, s.id))
        .all()
        .map((a) => a.spec as never),
    }))
  }

  /** Re-run a recorded case (prefer this over re-exploring once a flow is known). */
  async replay(caseId?: string): Promise<{
    runId: string
    passed: number
    failed: number
    blocked: number
    verdicts: string[]
  }> {
    const id = caseId ?? this.caseId
    if (!id) throw new Error('no case to replay')
    const [run] = this.db.insert(testRunsT).values({ environment: 'replay' }).returning().all()
    const verdicts: string[] = []
    for (const step of this.loadCaseSteps(id)) {
      let result: StepResult
      if (step.kind === 'api') result = await executeApi(step)
      else if (step.kind === 'web') {
        if (!this.web) result = { verdict: 'blocked', durationMs: 0, message: 'no open session' }
        else result = await this.web.execute(step)
      } else result = { verdict: 'blocked', durationMs: 0, message: 'db replay needs a fixture' }
      verdicts.push(result.verdict)
      this.db
        .insert(resultsT)
        .values({
          runId: run!.id,
          caseId: id,
          verdict: result.verdict,
          durationMs: Math.round(result.durationMs),
          message: result.message,
        })
        .run()
    }
    const failed = verdicts.filter((v) => v === 'failed').length
    const blocked = verdicts.filter((v) => v === 'blocked').length
    // close the loop: a clean replay auto-resolves this case's open auto-filed bug
    if (failed + blocked === 0) resolveBugTaskOnPass(this.db, id, run!.id)
    return {
      runId: run!.id,
      passed: verdicts.filter((v) => v === 'passed').length,
      failed,
      blocked,
      verdicts,
    }
  }

  /** Build the canonical test from recorded steps and render the artifact trinity to disk. */
  finalizeCase(title?: string): { canonical: CanonicalTest; tsPath: string; featurePath: string } {
    const caseId = this.caseId
    if (!caseId) throw new Error('no case to finalize')
    const tc = this.db.select().from(testCasesT).where(eq(testCasesT.id, caseId)).all()[0]!
    const steps = this.loadCaseSteps(caseId)

    const canonical: CanonicalTest = {
      title: title ?? tc.title,
      intent: tc.intent ?? undefined,
      polarity: tc.polarity,
      steps,
    }
    const base = slug(canonical.title)
    const tsPath = join(this.outDir, 'tests', `${base}.spec.ts`)
    const featurePath = join(this.outDir, 'features', `${base}.feature`)
    mkdirSync(dirname(tsPath), { recursive: true })
    mkdirSync(dirname(featurePath), { recursive: true })
    writeFileSync(tsPath, toPlaywrightTs(canonical))
    writeFileSync(featurePath, toGherkin(canonical))
    return { canonical, tsPath, featurePath }
  }

  /**
   * Diagnose the first failing web step of a recorded case: re-run it against a live page and, at
   * the failure, collect candidate locators present on the page now. Gives an agent exactly what it
   * needs to fix the test (the broken step + what the element looks like today).
   */
  async diagnose(
    caseId?: string,
    opts: { baseURL?: string } = {},
  ): Promise<{
    caseId: string
    failing: {
      ordinal: number
      kind: string
      action: string
      target?: unknown
      message?: string
    } | null
    candidates: Array<{ role?: string; name?: string; text?: string; testId?: string; tag: string }>
  }> {
    const id = caseId ?? this.caseId
    if (!id) throw new Error('no case to diagnose')
    const steps = this.loadCaseSteps(id)
    const web =
      this.web ??
      (await WebSession.launch({
        headless: true,
        baseURL: opts.baseURL,
        snapshotDir: join(this.outDir, 'snapshots'),
      }))
    let ordinal = 0
    try {
      for (const step of steps) {
        ordinal++
        if (step.kind !== 'web') {
          // only web steps are heal-diagnosable here; run api/db transparently
          if (step.kind === 'api') await executeApi(step)
          continue
        }
        const res = await web.execute(step)
        if (res.verdict !== 'passed') {
          const candidates = await collectCandidates(web.page)
          return {
            caseId: id,
            failing: {
              ordinal,
              kind: step.kind,
              action: step.action,
              target: step.target,
              message: res.message,
            },
            candidates,
          }
        }
      }
      return { caseId: id, failing: null, candidates: [] }
    } finally {
      if (!this.web) await web.close()
    }
  }

  /**
   * Patch a recorded step in place (fix a moved locator, a changed assertion, params). Optionally
   * records a `healing` knowledge entry (from → to) so the fix carries into future sessions.
   */
  patchStep(
    caseId: string,
    ordinal: number,
    patch: {
      target?: Record<string, unknown>
      params?: Record<string, unknown>
      description?: string
      assertions?: Record<string, unknown>[]
      recordHealing?: boolean
      reason?: string
    },
  ): { ok: boolean; healed: boolean } {
    const step = this.db
      .select()
      .from(stepsT)
      .where(and(eq(stepsT.caseId, caseId), eq(stepsT.ordinal, ordinal)))
      .all()[0]
    if (!step) throw new Error(`no step ${ordinal} in case ${caseId}`)

    const set: Record<string, unknown> = {}
    if (patch.target !== undefined) set.target = patch.target
    if (patch.params !== undefined) set.params = patch.params
    if (patch.description !== undefined) set.description = patch.description
    if (Object.keys(set).length)
      this.db
        .update(stepsT)
        .set(set as never)
        .where(eq(stepsT.id, step.id))
        .run()

    if (patch.assertions) {
      this.db.delete(assertionsT).where(eq(assertionsT.stepId, step.id)).run()
      for (const a of patch.assertions)
        this.db
          .insert(assertionsT)
          .values({ stepId: step.id, type: a.type as never, spec: a })
          .run()
    }

    let healed = false
    if (patch.recordHealing && patch.target) {
      // scope the healing fact to the case's app so it carries across sessions
      const tc = this.db.select().from(testCasesT).where(eq(testCasesT.id, caseId)).all()[0]
      const appKey = this.appKey || (tc?.appKey ?? '')
      this.db
        .insert(knowledgeT)
        .values({
          appKey,
          sessionId: this.sessionId,
          kind: 'healing',
          key: `${caseId}:${ordinal}`,
          value: { from: step.target, to: patch.target, reason: patch.reason },
          confidence: 0.7,
        })
        .run()
      healed = true
    }
    return { ok: true, healed }
  }

  async closeSession(): Promise<void> {
    await this.web?.close()
    if (this.sessionId) {
      this.db
        .update(sessionsT)
        .set({ status: 'closed', endedAt: new Date() })
        .where(eq(sessionsT.id, this.sessionId))
        .run()
    }
  }
}
