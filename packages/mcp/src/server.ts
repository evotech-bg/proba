import type { AssertionSpec, StepSpec } from '@proba/engine'
import type { Locator } from '@proba/locator'
import {
  boundaryValues,
  decisionTable,
  equivalencePartitions,
  pairwise,
  stateTransitions,
} from '@proba/design'
import type { ProbaDb } from '@proba/store'
import {
  apps as appsT,
  ensureApp,
  ensureProject,
  projects as projectsT,
  slugify,
} from '@proba/store'
import { EmbeddedTracker } from '@proba/tracker'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Recorder } from './recorder'
import { openDashboard } from './dashboard'

const locatorShape = {
  strategy: z.enum(['role', 'label', 'placeholder', 'text', 'altText', 'title', 'testId', 'css']),
  value: z.string(),
  name: z.string().optional(),
  exact: z.boolean().optional(),
}
const locatorSchema = z.object(locatorShape)
const assertionsSchema = z.array(z.record(z.any())).optional()

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] })

/** Build the Proba MCP server. One Recorder per server process (the durable session). */
export function createServer(db: ProbaDb, outDir = '.proba'): McpServer {
  const server = new McpServer({ name: 'proba', version: '0.0.0' })
  const recorder = new Recorder(db, outDir)
  const board = new EmbeddedTracker(db)

  // ── projects → apps (two-level scope; appKey on a session = the app/surface) ──
  server.tool(
    'proba_project_list',
    'List projects and their apps (surfaces). Use an app key as the `appKey` when opening a session.',
    {},
    async () =>
      ok({
        projects: db
          .select()
          .from(projectsT)
          .all()
          .map((p) => ({ key: p.key, name: p.name, description: p.description ?? undefined })),
        apps: db
          .select()
          .from(appsT)
          .all()
          .map((a) => ({
            key: a.key,
            projectKey: a.projectKey,
            name: a.name,
            platform: a.platform ?? undefined,
          })),
      }),
  )

  server.tool(
    'proba_project_create',
    'Create a project (a client/workspace). Returns its key. Idempotent on the derived key.',
    { name: z.string(), key: z.string().optional(), description: z.string().optional() },
    async (a) => ok({ key: ensureProject(db, slugify(a.key ?? a.name), a.name, a.description) }),
  )

  server.tool(
    'proba_app_create',
    'Create an app (surface: web/mobile/admin…) under a project. Its key becomes the appKey for sessions and scope.',
    {
      projectKey: z.string(),
      name: z.string(),
      key: z.string().optional(),
      platform: z.string().optional(),
    },
    async (a) =>
      ok({ key: ensureApp(db, slugify(a.key ?? a.name), a.projectKey, a.name, a.platform) }),
  )

  server.tool(
    'proba_session_open',
    'Open/resume a QA session for an app. `appKey` is the app/surface key (see proba_project_list / proba_app_create). Returns how much is already known (selectors) so you resume instead of re-exploring.',
    {
      appKey: z.string(),
      charter: z.string().optional(),
      baseURL: z.string().optional(),
      headless: z.boolean().optional(),
    },
    async (a) => ok(await recorder.openSession(a)),
  )

  server.tool(
    'proba_start_case',
    'Begin recording a new test case.',
    { title: z.string(), polarity: z.enum(['positive', 'negative']).optional() },
    async (a) => ok({ caseId: recorder.startCase(a.title, a.polarity) }),
  )

  server.tool(
    'proba_act',
    'Execute and record a web action (navigate/click/fill/select/check/wait/expect). Locators must be role/text/testid — positional css is rejected.',
    {
      action: z.enum(['navigate', 'click', 'fill', 'select', 'check', 'wait', 'expect']),
      target: locatorSchema.optional(),
      params: z.record(z.any()).optional(),
      assertions: assertionsSchema,
      description: z.string().optional(),
    },
    async (a) =>
      ok(
        await recorder.act({
          kind: 'web',
          action: a.action,
          target: a.target as Locator | undefined,
          params: a.params,
          assertions: a.assertions as AssertionSpec[] | undefined,
          description: a.description,
        } satisfies StepSpec),
      ),
  )

  server.tool(
    'proba_request',
    'Execute and record an API request with layered assertions (status → schema → body → sla).',
    {
      method: z.string().optional(),
      url: z.string(),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
      assertions: assertionsSchema,
      description: z.string().optional(),
    },
    async (a) =>
      ok(
        await recorder.request({
          kind: 'api',
          action: 'request',
          params: { method: a.method, url: a.url, headers: a.headers, body: a.body },
          assertions: a.assertions as AssertionSpec[] | undefined,
          description: a.description,
        } satisfies StepSpec),
      ),
  )

  server.tool(
    'proba_snapshot',
    'Capture a screenshot as an artifact, optionally attached to a board task/ticket.',
    { name: z.string(), taskId: z.string().optional() },
    async (a) => ok({ path: await recorder.snapshot(a.name, a.taskId) }),
  )

  server.tool(
    'proba_remember',
    'Persist a discovered fact (selector/quirk/exploration/healing) so future sessions resume.',
    {
      kind: z.enum(['selector', 'quirk', 'exploration', 'healing']),
      key: z.string(),
      value: z.record(z.any()),
      confidence: z.number().optional(),
    },
    async (a) => {
      recorder.remember(a.kind, a.key, a.value, a.confidence)
      return ok({ remembered: a.key })
    },
  )

  server.tool(
    'proba_finalize_test',
    'Render the recorded case to the artifact trinity: Playwright TS (executable) + Gherkin (intent).',
    { title: z.string().optional() },
    async (a) => {
      const { tsPath, featurePath, canonical } = recorder.finalizeCase(a.title)
      return ok({ tsPath, featurePath, steps: canonical.steps.length })
    },
  )

  server.tool(
    'proba_replay',
    'Re-run a recorded case from the store (prefer over re-exploring once a flow is known). Defaults to the current case. A clean replay auto-resolves the case open bug ticket.',
    { caseId: z.string().optional() },
    async (a) => ok(await recorder.replay(a.caseId)),
  )

  server.tool(
    'proba_diagnose',
    'Diagnose the first failing web step of a recorded case: re-runs it live and returns the broken step plus candidate locators present on the page now — so you can fix the test. Pair with proba_patch_step.',
    { caseId: z.string().optional(), baseURL: z.string().optional() },
    async (a) => ok(await recorder.diagnose(a.caseId, { baseURL: a.baseURL })),
  )

  server.tool(
    'proba_patch_step',
    'Fix a recorded step in place — update its locator (target), params, or assertions. Set recordHealing to remember the locator change (from → to) for future sessions. Then proba_replay to confirm and auto-resolve the bug.',
    {
      caseId: z.string(),
      ordinal: z.number(),
      target: locatorSchema.optional(),
      params: z.record(z.any()).optional(),
      assertions: assertionsSchema,
      recordHealing: z.boolean().optional(),
      reason: z.string().optional(),
    },
    async (a) =>
      ok(
        recorder.patchStep(a.caseId, a.ordinal, {
          target: a.target as Record<string, unknown> | undefined,
          params: a.params,
          assertions: a.assertions as Record<string, unknown>[] | undefined,
          recordHealing: a.recordHealing,
          reason: a.reason,
        }),
      ),
  )

  server.tool(
    'proba_layout_audit',
    'Geometry audit on the live page: overlap / truncation / zero-dimension / non-clickable (catches what screenshots miss).',
    { selectors: z.array(z.string()) },
    async (a) => ok(await recorder.layoutAudit(a.selectors)),
  )

  server.tool(
    'proba_a11y_scan',
    'Accessibility scan (axe-core) on the live page by WCAG tags; also returns what needs manual review.',
    {
      tags: z.array(z.string()).optional(),
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    },
    async (a) => ok(await recorder.a11yScan(a)),
  )

  server.tool(
    'proba_diff',
    'Visual diff of the current page vs a named baseline (first run establishes the baseline).',
    { name: z.string(), maxDiffPixelRatio: z.number().optional() },
    async (a) => ok(await recorder.diff(a.name, a.maxDiffPixelRatio)),
  )

  server.tool(
    'proba_design_cases',
    'Generate covering test cases by technique (ep/bva/decision/pairwise/state), each tagged positive/negative.',
    { technique: z.enum(['bva', 'ep', 'decision', 'pairwise', 'state']), spec: z.record(z.any()) },
    async (a) => {
      // biome-ignore lint/suspicious/noExplicitAny: spec shape varies by technique
      const s = a.spec as any
      const cases =
        a.technique === 'bva'
          ? boundaryValues(s)
          : a.technique === 'ep'
            ? equivalencePartitions(s.field, s.partitions)
            : a.technique === 'decision'
              ? decisionTable(s.rules)
              : a.technique === 'pairwise'
                ? pairwise(s.parameters)
                : stateTransitions(s)
      return ok({ technique: a.technique, count: cases.length, cases })
    },
  )

  server.tool('proba_close_session', 'Close the session and release the browser.', {}, async () => {
    await recorder.closeSession()
    return ok({ closed: true })
  })

  // ── task board (loop closure: claim → record → snapshot → update) ──────────
  server.tool(
    'proba_task_list',
    'List board tasks (embedded, or synced from an external tracker).',
    { status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']).optional() },
    async (a) => ok(await board.list(a.status)),
  )

  server.tool(
    'proba_task_create',
    'Create a board task.',
    { title: z.string(), description: z.string().optional() },
    async (a) => ok(await board.create(a)),
  )

  server.tool(
    'proba_task_claim',
    'Claim a task: move it to in_progress so the agent can work it (then record + snapshot + update).',
    { taskId: z.string() },
    async (a) => ok(await board.transition(a.taskId, 'in_progress')),
  )

  server.tool(
    'proba_task_update',
    'Transition a task and/or post a comment. Outbound comments to external trackers are stripped of branding.',
    {
      taskId: z.string(),
      status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']).optional(),
      comment: z.string().optional(),
    },
    async (a) => {
      if (a.status) await board.transition(a.taskId, a.status)
      if (a.comment) await board.comment(a.taskId, a.comment)
      return ok({ updated: a.taskId })
    },
  )

  // ── open the dashboard (visualise everything this MCP server records) ──────────
  server.tool(
    'proba_open_dashboard',
    'Start the Proba dashboard (if not already running) on the same store and return its URL. Pass openBrowser to also open it.',
    { port: z.number().optional(), openBrowser: z.boolean().optional() },
    async (a) =>
      ok(
        await openDashboard({
          port: a.port,
          openBrowser: a.openBrowser,
          dbPath: process.env.PROBA_DB,
        }),
      ),
  )

  return server
}
