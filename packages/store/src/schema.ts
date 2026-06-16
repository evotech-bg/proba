/**
 * Proba canonical schema — the single spine.
 *
 * Web / API / DB are *step kinds*, not separate engines.
 * BDD, user stories, journeys, positive/negative are *layers & attributes* on this spine.
 * Every layer of the full vision is encoded here from day 1 so nothing is precluded;
 * features render later.
 */
import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

// global Web Crypto — available in Node 22 and browsers; avoids importing 'node:crypto'
// (which vite externalizes and crashes the client bundle when schema is client-reachable).
const newId = () => globalThis.crypto.randomUUID()

// ── shared column helpers ───────────────────────────────────────────────────
const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => newId())
const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull()
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull()

// ── enums (as typed text) ────────────────────────────────────────────────────
export type StepKind = 'web' | 'api' | 'db'
export type Polarity = 'positive' | 'negative'
export type Technique = 'ep' | 'bva' | 'decision' | 'state' | 'pairwise' | 'exploratory' | 'manual'
export type LifecycleStatus = 'draft' | 'active' | 'modified' | 'retired'
export type Verdict = 'passed' | 'failed' | 'blocked' | 'skipped' | 'not_run' | 'retest'
export type AssertionType =
  | 'dom'
  | 'visual'
  | 'layout'
  | 'a11y'
  | 'http'
  | 'schema'
  | 'db_row'
  | 'sla'
export type ArtifactType = 'screenshot' | 'trace' | 'video' | 'har' | 'log' | 'snapshot' | 'dom'
export type KnowledgeKind = 'selector' | 'quirk' | 'exploration' | 'healing' | 'auth'
export type FlakyRootCause = 'timing' | 'state' | 'selector' | 'env' | 'unknown'
export type LinkType = 'covers' | 'verifies' | 'relates' | 'defect'
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'
export type TrackerKind = 'embedded' | 'jira' | 'trello' | 'plane' | 'github' | 'linear'

/** Evidence attached to an auto-filed bug task: where it broke + a captured screenshot. */
export interface TaskEvidence {
  /** how the task was created — distinguishes an auto-filed bug from a hand-written task */
  source?: 'replay' | 'manual'
  screenshot?: string // /shots/<runId>-<n>.png
  failingStep?: { ordinal: number; kind: string; action: string; message: string }
  failureCount?: number
}

// ── projects → apps (two-level scope) ─────────────────────────────────────────
// A project is a client/workspace; it contains one or more apps ("surfaces": web, mobile, admin…).
// Every scoped entity carries an `appKey`; an app belongs to a project via `projectKey`.
// Sessions & knowledge already key off `appKey`, so this layers cleanly on top.
export const projects = sqliteTable('projects', {
  id: id(),
  key: text('key').notNull().unique(), // slug, e.g. "prag"
  name: text('name').notNull(),
  description: text('description'),
  createdAt: createdAt(),
})

export const apps = sqliteTable(
  'apps',
  {
    id: id(),
    key: text('key').notNull().unique(), // the appKey used across sessions/knowledge/spine
    projectKey: text('project_key').notNull(), // → projects.key
    name: text('name').notNull(), // human label, e.g. "Web", "Mobile", "Admin"
    platform: text('platform'), // optional: web | mobile | api | desktop
    createdAt: createdAt(),
  },
  (t) => [index('apps_project_idx').on(t.projectKey)],
)

// ── requirements (user stories) — RTM root ───────────────────────────────────
export const requirements = sqliteTable('requirements', {
  id: id(),
  appKey: text('app_key'), // → apps.key (scope; null = unassigned)
  key: text('key').notNull(), // human ref, e.g. "AUTH-12"
  title: text('title').notNull(),
  // user-story form: "As <asA> I want <iWant> so that <soThat>"
  asA: text('as_a'),
  iWant: text('i_want'),
  soThat: text('so_that'),
  description: text('description'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// ── organizational hierarchy: strategy → plan → suite ─────────────────────────
export const strategies = sqliteTable('strategies', {
  id: id(),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: createdAt(),
})

export const plans = sqliteTable('plans', {
  id: id(),
  strategyId: text('strategy_id').references(() => strategies.id),
  title: text('title').notNull(),
  scope: text('scope'),
  environment: text('environment'),
  createdAt: createdAt(),
})

export const suites = sqliteTable('suites', {
  id: id(),
  appKey: text('app_key'), // → apps.key (scope; null = unassigned)
  planId: text('plan_id').references(() => plans.id),
  parentId: text('parent_id'), // self-ref for folder nesting
  name: text('name').notNull(),
  kind: text('kind'), // smoke | sanity | regression | acceptance | ...
  description: text('description'),
  createdAt: createdAt(),
})

// suite ↔ case membership (a case can belong to many suites; ordered)
export const suiteCases = sqliteTable(
  'suite_cases',
  {
    id: id(),
    suiteId: text('suite_id')
      .references(() => suites.id)
      .notNull(),
    caseId: text('case_id')
      .references(() => testCases.id)
      .notNull(),
    ordinal: integer('ordinal').default(0).notNull(),
  },
  (t) => [index('suite_cases_suite_idx').on(t.suiteId), index('suite_cases_case_idx').on(t.caseId)],
)

// ── test cases ────────────────────────────────────────────────────────────────
export const testCases = sqliteTable(
  'test_cases',
  {
    id: id(),
    appKey: text('app_key'), // → apps.key (scope; null = unassigned)
    suiteId: text('suite_id').references(() => suites.id),
    title: text('title').notNull(),
    intent: text('intent'), // human-readable "why" (BDD scenario name)
    polarity: text('polarity').$type<Polarity>().default('positive').notNull(),
    technique: text('technique').$type<Technique>().default('manual').notNull(),
    lifecycle: text('lifecycle').$type<LifecycleStatus>().default('draft').notNull(),
    priority: integer('priority'), // 1..5
    riskLikelihood: integer('risk_likelihood'), // risk-based testing
    riskImpact: integer('risk_impact'),
    preconditions: text('preconditions', { mode: 'json' }).$type<string[]>(),
    tags: text('tags', { mode: 'json' }).$type<string[]>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('test_cases_suite_idx').on(t.suiteId)],
)

// ── steps (the canonical unit; kind = web|api|db) ─────────────────────────────
export const steps = sqliteTable(
  'steps',
  {
    id: id(),
    caseId: text('case_id')
      .references(() => testCases.id)
      .notNull(),
    ordinal: integer('ordinal').notNull(),
    kind: text('kind').$type<StepKind>().notNull(),
    action: text('action').notNull(), // click|fill|navigate | request | query|seed|assert_rows
    // target locator (web): { strategy: 'role'|'text'|'label'|'testid'|'css', value, name? }
    // positional css/xpath is rejected at emit time by the locator engine
    target: text('target', { mode: 'json' }).$type<Record<string, unknown>>(),
    params: text('params', { mode: 'json' }).$type<Record<string, unknown>>(),
    description: text('description'), // Given/When/Then-ready intent
  },
  (t) => [index('steps_case_idx').on(t.caseId, t.ordinal)],
)

// ── assertions (attached to a step; expected result) ──────────────────────────
export const assertions = sqliteTable(
  'assertions',
  {
    id: id(),
    stepId: text('step_id')
      .references(() => steps.id)
      .notNull(),
    type: text('type').$type<AssertionType>().notNull(),
    // spec shape varies by type: dom matcher / visual baseline+tolerance / layout geometry /
    // a11y wcag tags / http status+schema / json-schema / db row matcher / sla threshold
    spec: text('spec', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    description: text('description'),
  },
  (t) => [index('assertions_step_idx').on(t.stepId)],
)

// ── runs & results (execution against a build + environment) ──────────────────
export const testRuns = sqliteTable('test_runs', {
  id: id(),
  buildRef: text('build_ref'), // commit / build id
  environment: text('environment'),
  startedAt: integer('started_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
})

export const results = sqliteTable(
  'results',
  {
    id: id(),
    runId: text('run_id')
      .references(() => testRuns.id)
      .notNull(),
    caseId: text('case_id')
      .references(() => testCases.id)
      .notNull(),
    stepId: text('step_id').references(() => steps.id), // null = case-level verdict
    verdict: text('verdict').$type<Verdict>().notNull(),
    durationMs: integer('duration_ms'),
    message: text('message'),
    executedAt: integer('executed_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index('results_run_idx').on(t.runId), index('results_case_idx').on(t.caseId)],
)

// ── artifacts (evidence: screenshots, traces, video, har, logs, snapshots) ────
export const artifacts = sqliteTable(
  'artifacts',
  {
    id: id(),
    resultId: text('result_id').references(() => results.id),
    stepId: text('step_id').references(() => steps.id),
    taskId: text('task_id'), // attach evidence to a board task / ticket
    type: text('type').$type<ArtifactType>().notNull(),
    path: text('path').notNull(), // relative to .proba/
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('artifacts_result_idx').on(t.resultId), index('artifacts_task_idx').on(t.taskId)],
)

// ── visual baselines (git-aware: per-branch, per-name) ────────────────────────
export const baselines = sqliteTable(
  'baselines',
  {
    id: id(),
    name: text('name').notNull(),
    branch: text('branch').notNull().default('main'),
    path: text('path').notNull(),
    // diff config: { mode: 'pixel'|'dom'|'perceptual', maxDiffPixels?, maxDiffPixelRatio?, threshold?, masks? }
    config: text('config', { mode: 'json' }).$type<Record<string, unknown>>(),
    approvedAt: integer('approved_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
  },
  (t) => [index('baselines_name_branch_idx').on(t.name, t.branch)],
)

// ── traceability matrix (RTM) + defects ───────────────────────────────────────
export const traceLinks = sqliteTable(
  'trace_links',
  {
    id: id(),
    requirementId: text('requirement_id').references(() => requirements.id),
    caseId: text('case_id').references(() => testCases.id),
    linkType: text('link_type').$type<LinkType>().default('covers').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('trace_req_idx').on(t.requirementId), index('trace_case_idx').on(t.caseId)],
)

export const defects = sqliteTable('defects', {
  id: id(),
  externalRef: text('external_ref'), // Jira/Linear key
  title: text('title').notNull(),
  resultId: text('result_id').references(() => results.id),
  requirementId: text('requirement_id').references(() => requirements.id),
  status: text('status'),
  createdAt: createdAt(),
})

// ── flaky tracking (auto-detect → quarantine → SLA) ───────────────────────────
export const flakyRecords = sqliteTable('flaky_records', {
  id: id(),
  caseId: text('case_id')
    .references(() => testCases.id)
    .notNull()
    .unique(),
  score: real('score').default(0).notNull(), // 0..1 from verdict history
  rootCause: text('root_cause').$type<FlakyRootCause>().default('unknown').notNull(),
  quarantined: integer('quarantined', { mode: 'boolean' }).default(false).notNull(),
  slaDueAt: integer('sla_due_at', { mode: 'timestamp' }),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
})

// ── SBTM sessions (exploratory charters; the MCP session is one of these) ─────
export const sessions = sqliteTable('sessions', {
  id: id(),
  appKey: text('app_key').notNull(), // groups knowledge per target app
  charter: text('charter'), // the mission, not scripted steps
  timeboxMins: integer('timebox_mins'),
  status: text('status').default('open'), // open | closed
  notes: text('notes', { mode: 'json' }).$type<string[]>(),
  metrics: text('metrics', { mode: 'json' }).$type<Record<string, number>>(), // design/exec/bug/setup time
  startedAt: integer('started_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
})

// ── tasks (embedded board; or mirror of an external tracker via adapter) ──────
// The agent can claim a task, run the corresponding MCP session, attach artifacts
// (screenshots/traces) as evidence, and transition status — all closing the loop.
// External posts (Jira/Trello comments) MUST stay neutral & un-branded — the tracker
// adapter strips any assistant branding before syncing out (per global comms rule).
export const tasks = sqliteTable(
  'tasks',
  {
    id: id(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').$type<TaskStatus>().default('todo').notNull(),
    boardOrder: real('board_order').default(0).notNull(), // ordering within a column
    priority: integer('priority'),
    assignee: text('assignee'), // e.g. 'agent' | a human
    evidence: text('evidence', { mode: 'json' }).$type<TaskEvidence>(), // auto-bug screenshot + failing step
    appKey: text('app_key'), // → apps.key (scope; null = unassigned)
    // linkage into the canonical spine
    sessionId: text('session_id').references(() => sessions.id),
    caseId: text('case_id').references(() => testCases.id),
    runId: text('run_id').references(() => testRuns.id),
    requirementId: text('requirement_id').references(() => requirements.id),
    // external tracker mirroring (embedded = local-only)
    tracker: text('tracker').$type<TrackerKind>().default('embedded').notNull(),
    externalRef: text('external_ref'), // e.g. PROJ-123 / card id
    externalUrl: text('external_url'),
    syncedAt: integer('synced_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tasks_status_idx').on(t.status),
    index('tasks_tracker_idx').on(t.tracker, t.externalRef),
  ],
)

// ── KNOWLEDGE LAYER — the moat: cross-session agent memory ────────────────────
// Persisted reasoning so the agent resumes instead of re-exploring from zero:
// discovered selectors, app quirks, exploration map, healing decisions.
export const knowledge = sqliteTable(
  'knowledge',
  {
    id: id(),
    appKey: text('app_key').notNull(),
    sessionId: text('session_id').references(() => sessions.id),
    kind: text('kind').$type<KnowledgeKind>().notNull(),
    key: text('key').notNull(), // e.g. a logical element name, a route, a flow id
    value: text('value', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    confidence: real('confidence').default(0.5).notNull(),
    observedAt: integer('observed_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    index('knowledge_app_idx').on(t.appKey, t.kind),
    index('knowledge_key_idx').on(t.appKey, t.key),
  ],
)

// ── workbench settings: a tiny key→json store for persisted preferences ───────
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: updatedAt(),
})

// ── per-app config: named test accounts + variables ──────────────────────────
// So credentials are not hardcoded into steps and one flow can run against
// different accounts. Reference in any step value as {{account.<name>.<field>}}
// or {{var.<name>}}; the engine resolves them at run time, scoped by appKey.
export type AppConfigType = 'account' | 'var'
/** account: data = { fields: { email, password, role, … } }; var: data = { value } */
export const appConfig = sqliteTable(
  'app_config',
  {
    id: id(),
    appKey: text('app_key').notNull(),
    type: text('type').$type<AppConfigType>().notNull(),
    name: text('name').notNull(), // e.g. 'client' / 'admin' (account) or 'baseURL' (var)
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    secret: integer('secret', { mode: 'boolean' }).default(false).notNull(), // mask in UI/exports
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('app_config_app_idx').on(t.appKey, t.type),
    unique('app_config_uq').on(t.appKey, t.type, t.name),
  ],
)

// ── inferred types (consumed across packages) ─────────────────────────────────
export type Setting = typeof settings.$inferSelect
export type Project = typeof projects.$inferSelect
export type App = typeof apps.$inferSelect
export type Requirement = typeof requirements.$inferSelect
export type TestCase = typeof testCases.$inferSelect
export type Step = typeof steps.$inferSelect
export type Assertion = typeof assertions.$inferSelect
export type TestRun = typeof testRuns.$inferSelect
export type Result = typeof results.$inferSelect
export type Artifact = typeof artifacts.$inferSelect
export type Baseline = typeof baselines.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Suite = typeof suites.$inferSelect
export type SuiteCase = typeof suiteCases.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Knowledge = typeof knowledge.$inferSelect
export type FlakyRecord = typeof flakyRecords.$inferSelect
