// Server-only: execute a recorded test through @proba/engine and persist a run with per-step
// results (+ failure messages), a screenshot per web step (evidence), and a real visual diff
// (pixelDiff vs a stored baseline) saved into the run's meta.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type StepResult, WebSession, executeApi } from '@proba/engine'
import { pixelDiff, perceptualDiff } from '@proba/overlay'
import { asc, eq } from 'drizzle-orm'
import {
  artifacts as artifactsT,
  assertions as assertionsT,
  baselines as baselinesT,
  buildResolver,
  createBugTaskFromRun,
  getAuthState,
  resolveBugTaskOnPass,
  resolveStepValues,
  results as resultsT,
  steps as stepsT,
  suiteCases as suiteCasesT,
  testCases as testCasesT,
  testRuns as runsT,
} from '@proba/store'
import { getDb, getSettings } from './db.server'

const SHOTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../public/shots')
// snapshot baselines live next to the store, not in the web-served shots dir
const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../../.proba/snapshots')
// scratch dir for recorded videos; kept only on failure (moved into the served shots dir)
const VIDEO_TMP = join(dirname(fileURLToPath(import.meta.url)), '../../../../../.proba/videos')

/** newest .webm in a dir (fallback when Playwright's video.path() doesn't resolve) */
function newestWebm(dir: string): string | undefined {
  try {
    const webms = readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => join(dir, f))
    if (!webms.length) return undefined
    return webms.reduce((a, b) => (statSync(a).mtimeMs >= statSync(b).mtimeMs ? a : b))
  } catch {
    return undefined
  }
}
const shotUrl = (file: string) => `/shots/${file}`

export interface ReplayFailure {
  ordinal: number; kind: string; action: string; description?: string; message: string
}
export interface ReplayResult {
  runId: string; total: number; passed: number; failed: number; blocked: number; failures: ReplayFailure[]
}

export async function replayCase(caseId: string, opts: { account?: string } = {}): Promise<ReplayResult> {
  const d = getDb()
  const stepRows = d.select().from(stepsT).where(eq(stepsT.caseId, caseId)).orderBy(asc(stepsT.ordinal)).all()
  const env = opts.account ? `replay · ${opts.account}` : 'replay'
  const [run] = d.insert(runsT).values({ environment: env }).returning().all()
  mkdirSync(SHOTS_DIR, { recursive: true })
  // resolve {{account.*}}/{{var.*}} against the case's app config (templates stay in storage).
  // a variation run also binds the generic {{account.<field>}} to opts.account.
  const caseApp = d.select().from(testCasesT).where(eq(testCasesT.id, caseId)).all()[0]?.appKey
  const vars = caseApp ? buildResolver(d, caseApp, opts.account) : {}
  // reuse captured auth so gated routes work without re-login steps (prefer the variation's account)
  const savedAuth = caseApp ? (getAuthState(d, caseApp, opts.account) ?? getAuthState(d, caseApp)) : undefined

  let web: WebSession | undefined
  const failures: ReplayFailure[] = []
  let passed = 0, failed = 0, blocked = 0
  let lastShotFile: string | undefined
  let lastShotUrl: string | undefined
  let meta: Record<string, unknown> | undefined
  const shotByOrdinal: Record<number, string> = {}

  try {
    for (const s of stepRows) {
      const asserts = d.select().from(assertionsT).where(eq(assertionsT.stepId, s.id)).all().map((a) => a.spec)
      const spec = resolveStepValues(
        { kind: s.kind, action: s.action, target: (s.target ?? undefined) as never, params: (s.params ?? undefined) as never, assertions: asserts as never },
        vars,
      )
      let res: StepResult
      if (s.kind === 'web') {
        web ??= await WebSession.launch({ headless: true, snapshotDir: SNAPSHOT_DIR, recordVideoDir: join(VIDEO_TMP, run!.id), ...(savedAuth ? { storageState: savedAuth as { cookies?: unknown[]; origins?: unknown[] } } : {}) })
        res = await web.execute(spec)
      } else if (s.kind === 'api') {
        res = await executeApi(spec)
      } else {
        res = { verdict: 'blocked', durationMs: 0, message: 'db steps need a fixture to replay' }
      }

      const [resultRow] = d.insert(resultsT).values({
        runId: run!.id, caseId, stepId: s.id, verdict: res.verdict, durationMs: Math.round(res.durationMs), message: res.message,
      }).returning().all()

      if (s.kind === 'web' && web) {
        try {
          const file = `${run!.id}-${s.ordinal}.png`
          const abs = join(SHOTS_DIR, file)
          await web.screenshot(abs)
          lastShotFile = abs; lastShotUrl = shotUrl(file)
          shotByOrdinal[s.ordinal] = shotUrl(file)
          d.insert(artifactsT).values({ resultId: resultRow!.id, stepId: s.id, type: 'screenshot', path: shotUrl(file), meta: { ordinal: s.ordinal } }).run()
        } catch { /* best-effort */ }
      }

      if (res.verdict === 'passed') passed++
      else {
        if (res.verdict === 'failed') failed++; else blocked++
        failures.push({ ordinal: s.ordinal, kind: s.kind, action: s.action, description: s.description ?? undefined, message: res.message ?? '(no message)' })
      }
    }

    // ── visual diff: compare the final screenshot against the stored baseline ──
    if (lastShotFile && lastShotUrl) {
      const baseRow = d.select().from(baselinesT).where(eq(baselinesT.name, caseId)).all()[0]
      if (!baseRow) {
        const baseFile = `baseline-${caseId}.png`
        copyFileSync(lastShotFile, join(SHOTS_DIR, baseFile))
        d.insert(baselinesT).values({ name: caseId, branch: 'main', path: shotUrl(baseFile), approvedAt: new Date() }).run()
        meta = { actual: lastShotUrl, baseline: shotUrl(baseFile), firstBaseline: true }
      } else {
        try {
          const baseBuf = readFileSync(join(SHOTS_DIR, basename(baseRow.path)))
          const actualBuf = readFileSync(lastShotFile)
          const cfg = getSettings()
          const r = pixelDiff(baseBuf, actualBuf, {
            maxDiffPixelRatio: cfg.pixelThresholdPct / 100,
            includeAA: !cfg.ignoreAntialias,
          })
          const diffFile = `${run!.id}-diff.png`
          writeFileSync(join(SHOTS_DIR, diffFile), r.diffImage)
          // perceptual (SSIM) — structural similarity, robust to anti-aliasing noise
          let ssim: number | undefined
          try { ssim = perceptualDiff(baseBuf, actualBuf).ssim } catch { /* dimension mismatch */ }
          meta = { actual: lastShotUrl, baseline: baseRow.path, diff: shotUrl(diffFile), diffPixels: r.diffPixels, ratio: r.ratio, ssim }
        } catch {
          meta = { actual: lastShotUrl, baseline: baseRow.path, diffError: 'dimensions changed since baseline' }
        }
      }
    }
  } finally {
    const consoleLog = web?.consoleLog ?? []
    const networkLog = web?.networkLog ?? []
    await web?.close() // browser.close() finalizes the recorded video in its per-run dir
    if (consoleLog.length || networkLog.length) {
      meta = { ...(meta ?? {}), console: consoleLog, network: networkLog }
    }
    // the per-run dir now holds exactly the finalized clip; keep it ONLY on failure
    const runVideoDir = join(VIDEO_TMP, run!.id)
    const videoPath = newestWebm(runVideoDir)
    if (videoPath && statSync(videoPath).size > 0 && failures.length > 0) {
      try {
        const dest = `${run!.id}.webm`
        copyFileSync(videoPath, join(SHOTS_DIR, dest))
        meta = { ...(meta ?? {}), video: shotUrl(dest) }
      } catch { /* best-effort */ }
    }
    try { rmSync(runVideoDir, { recursive: true, force: true }) } catch { /* temp cleanup */ }
    d.update(runsT).set({ finishedAt: new Date(), meta }).where(eq(runsT.id, run!.id)).run()
  }

  // auto-file a bug ticket on failure (well-formed title + screenshot + description), once per run
  if (failures.length > 0 && getSettings().autoBugTask) {
    const tc = d.select().from(testCasesT).where(eq(testCasesT.id, caseId)).all()[0]
    const firstFail = failures[0]!
    createBugTaskFromRun(d, {
      runId: run!.id,
      caseId,
      caseTitle: tc?.title ?? caseId,
      environment: 'replay',
      failures,
      screenshot: shotByOrdinal[firstFail.ordinal] ?? lastShotUrl,
      appKey: tc?.appKey ?? undefined,
    })
  } else {
    // clean replay → auto-resolve this case's open auto-filed bug (closes the loop)
    resolveBugTaskOnPass(d, caseId, run!.id)
  }

  return { runId: run!.id, total: stepRows.length, passed, failed, blocked, failures }
}

export interface SuiteReplayResult {
  cases: number
  casesPassed: number
  casesFailed: number
  results: { caseId: string; account?: string; passed: number; failed: number; blocked: number }[]
  /** present when run as a matrix: one entry per account variation */
  variations?: { account: string; casesPassed: number; casesFailed: number }[]
}

/**
 * Replay every case in a suite (sequentially) and aggregate.
 * Pass `accounts` to run the whole suite once PER account (a variation matrix):
 * each pass binds {{account.<field>}} to that account and injects its saved auth.
 */
export async function replaySuite(
  suiteId: string,
  opts: { accounts?: string[] } = {},
): Promise<SuiteReplayResult> {
  const d = getDb()
  const caseIds = d
    .select()
    .from(suiteCasesT)
    .where(eq(suiteCasesT.suiteId, suiteId))
    .all()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((m) => m.caseId)

  const accounts = opts.accounts?.filter(Boolean) ?? []
  const passes = accounts.length ? accounts : [undefined]
  const results: SuiteReplayResult['results'] = []
  const variations: NonNullable<SuiteReplayResult['variations']> = []
  let casesPassed = 0
  let casesFailed = 0

  for (const account of passes) {
    let vPassed = 0
    let vFailed = 0
    for (const caseId of caseIds) {
      const r = await replayCase(caseId, { account })
      results.push({ caseId, account, passed: r.passed, failed: r.failed, blocked: r.blocked })
      if (r.failed + r.blocked === 0) {
        casesPassed++
        vPassed++
      } else {
        casesFailed++
        vFailed++
      }
    }
    if (account) variations.push({ account, casesPassed: vPassed, casesFailed: vFailed })
  }

  return {
    cases: caseIds.length * passes.length,
    casesPassed,
    casesFailed,
    results,
    ...(variations.length ? { variations } : {}),
  }
}

/**
 * Replay every recorded case (optionally scoped to one app). Each case runs through
 * replayCase, so a failure auto-files its board bug and a clean pass auto-resolves it —
 * one button to re-validate the whole library and surface everything that broke.
 */
export async function replayAll(opts: { appKey?: string } = {}): Promise<SuiteReplayResult> {
  const d = getDb()
  const rows = d.select().from(testCasesT).all()
  const caseIds = rows
    .filter((c) => (opts.appKey ? c.appKey === opts.appKey : true))
    .map((c) => c.id)

  const results: SuiteReplayResult['results'] = []
  let casesPassed = 0
  let casesFailed = 0
  for (const caseId of caseIds) {
    const r = await replayCase(caseId)
    results.push({ caseId, account: undefined, passed: r.passed, failed: r.failed, blocked: r.blocked })
    if (r.failed + r.blocked === 0) casesPassed++
    else casesFailed++
  }
  return { cases: caseIds.length, casesPassed, casesFailed, results }
}
