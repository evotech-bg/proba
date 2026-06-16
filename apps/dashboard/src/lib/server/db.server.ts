// Server-only data layer: maps the real @proba/store (SQLite) to the dashboard's view types,
// and applies mutations. The .server.ts suffix keeps better-sqlite3 out of the client bundle.
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asc, eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import {
  type AppConfigView,
  type ProbaDb,
  apps as appsT,
  artifacts as artifactsT,
  assertions as assertionsT,
  baselines as baselinesT,
  clearAuthState,
  deleteAppConfig,
  deriveCaseVerdict,
  ensureApp,
  ensureProject,
  ensureProjectsBootstrap,
  listAppConfig,
  listAuthNames,
  setAccount,
  setVar,
  slugify,
  flakyRecords as flakyT,
  projects as projectsT,
  knowledge as knowledgeT,
  openStore,
  requirements as requirementsT,
  results as resultsT,
  sessions as sessionsT,
  settings as settingsT,
  steps as stepsT,
  suiteCases as suiteCasesT,
  suites as suitesT,
  tasks as tasksT,
  testCases as testCasesT,
  testRuns as runsT,
  traceLinks as traceLinksT,
} from '@proba/store'

const here = dirname(fileURLToPath(import.meta.url))

// Concrete (serializable) shape of a run's visual-diff meta — mirrors Run['visualDiff'] in the view types.
interface VisualDiffMeta {
  actual?: string; baseline?: string; diff?: string
  diffPixels?: number; ratio?: number; ssim?: number; firstBaseline?: boolean; diffError?: string
  console?: { type: string; text: string }[]
  network?: { method: string; url: string; status: number; ok: boolean }[]
  video?: string
}
// Default to the repo-root .proba/proba.db (same store the MCP server writes to).
const defaultDb = join(here, '../../../../../.proba/proba.db')
const migrationsFolder = join(here, '../../../../../packages/store/migrations')
let _db: ProbaDb | undefined
const db = (): ProbaDb => {
  if (!_db) {
    _db = openStore(process.env.PROBA_DB ?? defaultDb)
    try {
      migrate(_db, { migrationsFolder })
      ensureProjectsBootstrap(_db) // seed default project/app + backfill on first run
    } catch (e) {
      console.error('[proba] migration skipped:', e)
    }
  }
  return _db
}
/** Shared store handle for other server-only modules (e.g. replay). */
export const getDb = db

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : undefined)
const priorityLabel = (p: number | null): string | undefined =>
  p == null ? undefined : p <= 1 ? 'urgent' : p === 2 ? 'high' : p === 3 ? 'med' : 'low'

// ── read: full snapshot mapped to the dashboard's types ───────────────────────
export function getSnapshot() {
  const d = db()
  const allResults = d.select().from(resultsT).all()
  const allSteps = d.select().from(stepsT).all()
  const allAsserts = d.select().from(assertionsT).all()
  const allShots = d.select().from(artifactsT).all().filter((a) => a.type === 'screenshot' && a.resultId)
  const shotByResult = new Map<string, string>(allShots.map((a) => [a.resultId as string, a.path]))
  // latest screenshot per case (by result time)
  const latestShotByCase = new Map<string, string>()
  for (const r of [...allResults].sort((a, b) => +new Date(a.executedAt) - +new Date(b.executedAt))) {
    const shot = shotByResult.get(r.id)
    if (shot) latestShotByCase.set(r.caseId, shot)
  }

  const tests = d.select().from(testCasesT).all().map((tc) => {
    const steps = allSteps
      .filter((s) => s.caseId === tc.id)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((s) => ({
        id: s.id,
        ordinal: s.ordinal,
        kind: s.kind,
        action: s.action,
        description: s.description ?? undefined,
        target: (s.target ?? undefined) as { strategy: string; value: string; name?: string } | undefined,
        params: (s.params ?? undefined) as Record<string, string> | undefined,
        assertions: allAsserts
          .filter((a) => a.stepId === s.id)
          .map((a) => ({ id: a.id, type: a.type, spec: JSON.stringify(a.spec) })),
      }))
    // verdict reflects the LATEST run only (not all-time history, else an old failure sticks forever)
    const caseResults = allResults.filter((r) => r.caseId === tc.id)
    const latestRunId = caseResults.length
      ? caseResults.reduce((a, b) => (+new Date(a.executedAt) >= +new Date(b.executedAt) ? a : b)).runId
      : undefined
    const verdict = deriveCaseVerdict(caseResults.filter((r) => r.runId === latestRunId).map((r) => r.verdict))
    return {
      id: tc.id,
      title: tc.title,
      intent: tc.intent ?? undefined,
      polarity: tc.polarity,
      technique: tc.technique,
      lifecycle: tc.lifecycle,
      steps,
      verdict,
      tags: (tc.tags ?? []) as string[],
      appKey: tc.appKey ?? undefined,
      updatedAt: iso(tc.updatedAt) ?? new Date().toISOString(),
      latestScreenshot: latestShotByCase.get(tc.id),
    }
  })

  const links = d.select().from(traceLinksT).all()
  const requirements = d.select().from(requirementsT).all().map((r) => ({
    id: r.id,
    key: r.key,
    title: r.title,
    appKey: r.appKey ?? undefined,
    linkedCaseIds: links.filter((l) => l.requirementId === r.id).map((l) => l.caseId as string),
  }))

  const tasks = d.select().from(tasksT).all().map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    status: t.status,
    priority: priorityLabel(t.priority),
    assignee: t.assignee ?? undefined,
    caseId: t.caseId ?? undefined,
    requirementId: t.requirementId ?? undefined,
    runId: t.runId ?? undefined,
    evidence: t.evidence ?? undefined,
    appKey: t.appKey ?? (t.caseId ? tests.find((x) => x.id === t.caseId)?.appKey : undefined) ?? undefined,
    createdAt: iso(t.createdAt) ?? new Date().toISOString(),
  }))

  const appKeyOfCase = (caseId: string) => tests.find((t) => t.id === caseId)?.appKey
  const titleOf = (caseId: string) => tests.find((t) => t.id === caseId)?.title ?? caseId
  const runs = d.select().from(runsT).all()
    .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
    .map((run) => {
      const rs = allResults.filter((r) => r.runId === run.id)
      const byCase = new Map<string, typeof rs>()
      for (const r of rs) byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r])
      return {
        id: run.id,
        environment: run.environment ?? 'local',
        buildRef: run.buildRef ?? undefined,
        startedAt: iso(run.startedAt)!,
        durationMs: run.finishedAt ? +new Date(run.finishedAt) - +new Date(run.startedAt) : rs.reduce((n, r) => n + (r.durationMs ?? 0), 0),
        passed: rs.filter((r) => r.verdict === 'passed').length,
        failed: rs.filter((r) => r.verdict === 'failed').length,
        blocked: rs.filter((r) => r.verdict === 'blocked').length,
        caseResults: [...byCase.entries()].map(([caseId, crs]) => ({
          caseId,
          verdict: deriveCaseVerdict(crs.map((r) => r.verdict)),
          durationMs: crs.reduce((n, r) => n + (r.durationMs ?? 0), 0),
          steps: crs.filter((r) => r.stepId).map((r) => ({
            stepId: r.stepId as string, verdict: r.verdict, durationMs: r.durationMs ?? 0,
            evidence: shotByResult.get(r.id) ? { screenshot: shotByResult.get(r.id) } : undefined,
          })),
        })),
        visualDiff: (run.meta ?? undefined) as VisualDiffMeta | undefined,
        caseId: [...byCase.keys()][0],
        appKey: [...byCase.keys()].map(appKeyOfCase).find(Boolean) ?? undefined,
      }
    })

  const flaky = d.select().from(flakyT).all().map((f) => ({
    caseId: f.caseId,
    title: titleOf(f.caseId),
    score: f.score,
    rootCause: f.rootCause,
    quarantined: f.quarantined,
    slaDueAt: iso(f.slaDueAt) ?? '',
    appKey: appKeyOfCase(f.caseId),
  }))

  const knowledge = d.select().from(knowledgeT).all()
  const allTasks = d.select().from(tasksT).all()
  const sessions = d.select().from(sessionsT).all().map((s) => {
    // knowledge LEARNED IN THIS session (honest attribution via sessionId) vs known for the whole app
    const learned = knowledge.filter((x) => x.sessionId === s.id)
    const appKnowledge = knowledge.filter((x) => x.appKey === s.appKey)
    const metrics = (s.metrics as Record<string, number> | null) ?? undefined
    const linkedTasks = allTasks.filter((t) => t.sessionId === s.id)
    return {
      id: s.id,
      appKey: s.appKey,
      charter: s.charter ?? undefined,
      status: (s.status === 'open' ? 'active' : 'complete') as 'active' | 'complete' | 'aborted',
      startedAt: iso(s.startedAt)!,
      endedAt: iso(s.endedAt),
      timeboxMins: s.timeboxMins ?? undefined,
      stepCount: metrics?.steps ?? 0,
      metrics,
      notes: (s.notes as string[] | null) ?? undefined,
      appKnowledgeCount: appKnowledge.length,
      knownSelectors: learned.filter((x) => x.kind === 'selector').map((x) => ({
        name: x.key, selector: JSON.stringify(x.value), kind: 'web' as const, confidence: x.confidence,
      })),
      knowledge: learned.map((x) => ({
        kind: x.kind, name: x.key, value: JSON.stringify(x.value), confidence: x.confidence, observedAt: iso(x.observedAt)!,
      })),
      quirks: learned.filter((x) => x.kind === 'quirk').map((x) => x.key),
      linkedTasks: linkedTasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
      // a real timeline: each piece of knowledge in the order the agent observed it
      timeline: learned
        .slice()
        .sort((a, b) => +new Date(a.observedAt) - +new Date(b.observedAt))
        .map((x) => ({ ts: iso(x.observedAt)!, kind: x.kind, action: x.key })),
    }
  })

  const memberships = d.select().from(suiteCasesT).all()
  const suites = d.select().from(suitesT).all().map((s) => {
    const caseIds = memberships.filter((m) => m.suiteId === s.id).sort((a, b) => a.ordinal - b.ordinal).map((m) => m.caseId)
    const cases = caseIds.map((cid) => tests.find((t) => t.id === cid)).filter(Boolean) as typeof tests
    const verdicts = cases.map((c) => c.verdict)
    return {
      id: s.id, name: s.name, kind: s.kind ?? 'custom', description: s.description ?? undefined,
      caseIds,
      appKey: s.appKey ?? cases.map((c) => c.appKey).find(Boolean) ?? undefined,
      passed: verdicts.filter((v) => v === 'passed').length,
      failed: verdicts.filter((v) => v === 'failed').length,
    }
  })

  const projects = d.select().from(projectsT).all().map((p) => ({ key: p.key, name: p.name, description: p.description ?? undefined }))
  const appsList = d.select().from(appsT).all().map((a) => ({ key: a.key, projectKey: a.projectKey, name: a.name, platform: a.platform ?? undefined }))

  // recent activity, derived from the latest runs (no separate event log to fake)
  const activity = runs.slice(0, 8).map((r) => ({
    id: r.id,
    ts: r.startedAt,
    actor: r.environment,
    action: r.failed > 0 ? `ran with ${r.failed} failing` : 'ran clean',
    target: `${r.caseResults.length} case${r.caseResults.length === 1 ? '' : 's'} · ${r.passed} passed`,
  }))

  return { tests, requirements, tasks, runs, flaky, sessions, suites, activity, projects, apps: appsList }
}

export type Snapshot = ReturnType<typeof getSnapshot>

// ── write: one dispatcher mirroring the store actions ─────────────────────────
type Json = Record<string, unknown>
const priorityNum = (p?: string): number | null =>
  p === 'urgent' ? 1 : p === 'high' ? 2 : p === 'med' ? 3 : p === 'low' ? 4 : null

export function applyMutation(op: string, a: Json): void {
  const d = db()
  switch (op) {
    case 'createTask':
      d.insert(tasksT).values({ title: String(a.title), description: a.description as string | undefined, status: (a.status as never) ?? 'todo', priority: priorityNum(a.priority as string), appKey: (a.appKey as string) ?? undefined }).run()
      break
    case 'patchTask':
      d.update(tasksT).set({ ...(a.patch as Json), priority: priorityNum((a.patch as Json)?.priority as string) ?? undefined, updatedAt: new Date() } as never).where(eq(tasksT.id, String(a.id))).run()
      break
    case 'moveTask':
      d.update(tasksT).set({ status: a.status as never, updatedAt: new Date() }).where(eq(tasksT.id, String(a.id))).run()
      break
    case 'deleteTask':
      d.delete(tasksT).where(eq(tasksT.id, String(a.id))).run()
      break
    case 'createTest':
      d.insert(testCasesT).values({ title: String(a.title ?? 'Untitled test'), polarity: 'positive', lifecycle: 'draft', appKey: (a.appKey as string) ?? undefined }).run()
      break
    case 'patchTest': {
      const p = a.patch as Json
      const set: Json = { updatedAt: new Date() }
      for (const k of ['title', 'intent', 'polarity', 'technique', 'lifecycle'] as const) if (p[k] !== undefined) set[k] = p[k]
      d.update(testCasesT).set(set as never).where(eq(testCasesT.id, String(a.id))).run()
      break
    }
    case 'deleteTest': {
      const id = String(a.id)
      const stepIds = d.select().from(stepsT).where(eq(stepsT.caseId, id)).all().map((s) => s.id)
      for (const sid of stepIds) d.delete(assertionsT).where(eq(assertionsT.stepId, sid)).run()
      d.delete(stepsT).where(eq(stepsT.caseId, id)).run()
      d.delete(resultsT).where(eq(resultsT.caseId, id)).run()
      d.delete(traceLinksT).where(eq(traceLinksT.caseId, id)).run()
      d.delete(testCasesT).where(eq(testCasesT.id, id)).run()
      break
    }
    case 'patchStep': {
      const p = a.patch as Json
      const set: Json = {}
      if (p.action !== undefined) set.action = p.action
      if (p.description !== undefined) set.description = p.description
      if (p.target !== undefined) set.target = p.target
      if (p.params !== undefined) set.params = p.params
      d.update(stepsT).set(set as never).where(eq(stepsT.id, String(a.stepId))).run()
      break
    }
    case 'addStep': {
      const s = a.step as Json
      const count = d.select().from(stepsT).where(eq(stepsT.caseId, String(a.testId))).all().length
      d.insert(stepsT).values({ caseId: String(a.testId), ordinal: count + 1, kind: (s.kind as never) ?? 'web', action: String(s.action ?? 'click'), target: s.target as never, params: s.params as never, description: s.description as string | undefined }).run()
      break
    }
    case 'removeStep':
      d.delete(assertionsT).where(eq(assertionsT.stepId, String(a.stepId))).run()
      d.delete(stepsT).where(eq(stepsT.id, String(a.stepId))).run()
      break
    case 'reorderSteps': {
      const ids = a.ids as string[]
      ids.forEach((id, i) => d.update(stepsT).set({ ordinal: i + 1 }).where(eq(stepsT.id, id)).run())
      break
    }
    case 'addRequirement':
      d.insert(requirementsT).values({ key: String(a.key), title: String(a.title), appKey: (a.appKey as string) ?? undefined }).run()
      break
    case 'linkRequirement':
      d.insert(traceLinksT).values({ requirementId: String(a.reqId), caseId: String(a.caseId), linkType: 'covers' }).run()
      break
    case 'unlinkRequirement': {
      const existing = d.select().from(traceLinksT).all().find((l) => l.requirementId === a.reqId && l.caseId === a.caseId)
      if (existing) d.delete(traceLinksT).where(eq(traceLinksT.id, existing.id)).run()
      break
    }
    case 'createSuite':
      d.insert(suitesT).values({ name: String(a.name ?? 'New suite'), kind: (a.kind as string) ?? 'custom', description: a.description as string | undefined, appKey: (a.appKey as string) ?? undefined }).run()
      break
    case 'updateSuite': {
      const p = a.patch as Json
      d.update(suitesT).set({ ...(p.name !== undefined && { name: p.name }), ...(p.kind !== undefined && { kind: p.kind }), ...(p.description !== undefined && { description: p.description }) } as never).where(eq(suitesT.id, String(a.id))).run()
      break
    }
    case 'deleteSuite':
      d.delete(suiteCasesT).where(eq(suiteCasesT.suiteId, String(a.id))).run()
      d.delete(suitesT).where(eq(suitesT.id, String(a.id))).run()
      break
    case 'addCaseToSuite': {
      const exists = d.select().from(suiteCasesT).all().some((m) => m.suiteId === a.suiteId && m.caseId === a.caseId)
      if (!exists) {
        const count = d.select().from(suiteCasesT).all().filter((m) => m.suiteId === a.suiteId).length
        d.insert(suiteCasesT).values({ suiteId: String(a.suiteId), caseId: String(a.caseId), ordinal: count }).run()
      }
      break
    }
    case 'removeCaseFromSuite': {
      const m = d.select().from(suiteCasesT).all().find((x) => x.suiteId === a.suiteId && x.caseId === a.caseId)
      if (m) d.delete(suiteCasesT).where(eq(suiteCasesT.id, m.id)).run()
      break
    }
    case 'toggleQuarantine': {
      const rec = d.select().from(flakyT).where(eq(flakyT.caseId, String(a.caseId))).all()[0]
      if (rec) d.update(flakyT).set({ quarantined: !rec.quarantined }).where(eq(flakyT.caseId, String(a.caseId))).run()
      break
    }
    case 'resetBaseline': {
      // drop the stored baseline so the next replay re-captures a fresh one
      const caseId = String(a.caseId)
      const rows = d.select().from(baselinesT).where(eq(baselinesT.name, caseId)).all()
      for (const r of rows) {
        try { rmSync(join(SHOTS_DIR, basename(r.path))) } catch { /* file may be gone */ }
      }
      d.delete(baselinesT).where(eq(baselinesT.name, caseId)).run()
      break
    }
    case 'approveBaseline': {
      // promote a given run's actual screenshot to the case's baseline
      const caseId = String(a.caseId)
      const actualUrl = String(a.actualUrl) // e.g. /shots/<runId>-<n>.png
      const src = join(SHOTS_DIR, basename(actualUrl))
      if (!existsSync(src)) break
      const baseFile = `baseline-${caseId}.png`
      copyFileSync(src, join(SHOTS_DIR, baseFile))
      const existing = d.select().from(baselinesT).where(eq(baselinesT.name, caseId)).all()[0]
      if (existing) {
        d.update(baselinesT).set({ path: `/shots/${baseFile}`, approvedAt: new Date() }).where(eq(baselinesT.name, caseId)).run()
      } else {
        d.insert(baselinesT).values({ name: caseId, branch: 'main', path: `/shots/${baseFile}`, approvedAt: new Date() }).run()
      }
      break
    }
    case 'setSetting': {
      const key = String(a.key)
      const value = (a.value ?? null) as unknown
      const existing = d.select().from(settingsT).where(eq(settingsT.key, key)).all()[0]
      if (existing) d.update(settingsT).set({ value, updatedAt: new Date() }).where(eq(settingsT.key, key)).run()
      else d.insert(settingsT).values({ key, value }).run()
      break
    }
    case 'createProject':
      ensureProject(d, slugify(String(a.key ?? a.name)), String(a.name ?? a.key), a.description as string | undefined)
      break
    case 'createApp':
      ensureApp(d, slugify(String(a.key ?? a.name)), String(a.projectKey), String(a.name ?? a.key), a.platform as string | undefined)
      break
    case 'assignAppKey': {
      // move an entity into an app/project scope
      const appKey = (a.appKey as string) ?? null
      const id = String(a.id)
      switch (String(a.entity)) {
        case 'test': d.update(testCasesT).set({ appKey }).where(eq(testCasesT.id, id)).run(); break
        case 'suite': d.update(suitesT).set({ appKey }).where(eq(suitesT.id, id)).run(); break
        case 'requirement': d.update(requirementsT).set({ appKey }).where(eq(requirementsT.id, id)).run(); break
        case 'task': d.update(tasksT).set({ appKey }).where(eq(tasksT.id, id)).run(); break
      }
      break
    }
    case 'setAccount':
      setAccount(d, String(a.appKey), String(a.name), (a.fields as Record<string, string>) ?? {}, a.secret !== false)
      break
    case 'setVar':
      setVar(d, String(a.appKey), String(a.name), String(a.value ?? ''), a.secret === true)
      break
    case 'deleteConfig':
      deleteAppConfig(d, String(a.appKey), a.type === 'var' ? 'var' : 'account', String(a.name))
      break
    case 'clearAuth':
      clearAuthState(d, String(a.appKey), String(a.name ?? 'default'))
      break
  }
}

/** Per-app test accounts + variables (secret values masked for the UI) + captured-auth names. */
export function getAppConfig(appKey: string): AppConfigView & { authNames: string[] } {
  if (!appKey) return { accounts: [], vars: [], authNames: [] }
  const { accounts, vars } = listAppConfig(getDb(), appKey)
  return {
    accounts: accounts.map((ac) => ({
      ...ac,
      fields: ac.secret
        ? Object.fromEntries(Object.keys(ac.fields).map((k) => [k, '••••••']))
        : ac.fields,
    })),
    vars: vars.map((v) => ({ ...v, value: v.secret ? '••••••' : v.value })),
    authNames: listAuthNames(getDb(), appKey),
  }
}

const SHOTS_DIR = join(here, '../../../public/shots')

// ── workbench settings (persisted preferences) ────────────────────────────────
export interface WorkbenchSettings {
  /** visual-diff pixel tolerance as a percentage of total pixels (0–20) */
  pixelThresholdPct: number
  /** ignore antialiasing noise in the pixel diff */
  ignoreAntialias: boolean
  /** require a login to use the workbench (gate handled in __root) */
  requireLogin: boolean
  /** auto-file a board bug ticket (title + screenshot + description) when a replay fails */
  autoBugTask: boolean
  /** folder holding a project's existing test files, surfaced read-only as "imported" */
  importDir: string
}

export const DEFAULT_SETTINGS: WorkbenchSettings = {
  pixelThresholdPct: 1,
  ignoreAntialias: true,
  requireLogin: false,
  autoBugTask: true,
  importDir: '',
}

// ── imported tests: read-only listing of a project's existing test files ──────
export interface ImportedTest { title: string }
export interface ImportedFile { path: string; kind: 'playwright' | 'gherkin'; tests: ImportedTest[]; code: string }

const TEST_TITLE = /(?:^|[^.\w])(?:test|it)(?:\.\w+)?\s*\(\s*[`'"](.+?)[`'"]/g
const SCENARIO = /^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/gm

function walkTestFiles(root: string, acc: string[] = [], depth = 0): string[] {
  if (depth > 6 || acc.length >= 200) return acc
  let entries: string[] = []
  try { entries = readdirSync(root) } catch { return acc }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name.startsWith('.')) continue
    const full = join(root, name)
    let st: ReturnType<typeof statSync>
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walkTestFiles(full, acc, depth + 1)
    else if (/\.(spec|test)\.[jt]sx?$/.test(name) || name.endsWith('.feature')) acc.push(full)
    if (acc.length >= 200) break
  }
  return acc
}

/** Scan the configured importDir for existing test files and extract their test titles (read-only). */
export function getImportedTests(): { dir: string; files: ImportedFile[] } {
  const dir = getSettings().importDir
  if (!dir || !existsSync(dir)) return { dir, files: [] }
  const files: ImportedFile[] = []
  for (const full of walkTestFiles(dir)) {
    let code = ''
    try { code = readFileSync(full, 'utf8') } catch { continue }
    const gherkin = full.endsWith('.feature')
    const re = gherkin ? SCENARIO : TEST_TITLE
    const titles: ImportedTest[] = []
    for (const m of code.matchAll(re)) { if (m[1]) titles.push({ title: m[1] }); if (titles.length >= 100) break }
    files.push({ path: relative(dir, full), kind: gherkin ? 'gherkin' : 'playwright', tests: titles, code: code.slice(0, 8000) })
  }
  return { dir, files }
}

/** Read all persisted settings, merged over defaults. */
export function getSettings(): WorkbenchSettings {
  const d = getDb()
  const rows = d.select().from(settingsT).all()
  const merged = { ...DEFAULT_SETTINGS }
  for (const r of rows) {
    if (r.key in merged) (merged as Record<string, unknown>)[r.key] = r.value
  }
  return merged
}

/** Real, non-faked status of the workbench — surfaced read-only in Settings. */
export function getSystemInfo() {
  const d = getDb()
  const count = (rows: { length: number }) => rows.length
  return {
    dbPath: defaultDb,
    nodeVersion: process.version,
    counts: {
      tests: count(d.select().from(testCasesT).all()),
      runs: count(d.select().from(runsT).all()),
      sessions: count(d.select().from(sessionsT).all()),
      suites: count(d.select().from(suitesT).all()),
      requirements: count(d.select().from(requirementsT).all()),
      baselines: count(d.select().from(baselinesT).all()),
      tasks: count(d.select().from(tasksT).all()),
    },
  }
}

// keep asc import used (ordering helper available for future queries)
void asc
