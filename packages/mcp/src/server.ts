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
  deleteAppConfig,
  ensureApp,
  ensureProject,
  listAppConfig,
  projects as projectsT,
  setAccount,
  setVar,
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

/** mask secret account values but keep the field names visible */
const maskFields = (f: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.keys(f).map((k) => [k, '••••••']))

/** Build the Proba MCP server. One Recorder per server process (the durable session). */
export function createServer(db: ProbaDb, outDir = '.proba'): McpServer {
  const server = new McpServer(
    { name: 'proba', version: '0.0.0' },
    {
      instructions: [
        'Proba is a QA workbench: you drive a web app/API/DB through these tools and walk away with owned, editable tests (Gherkin + JSON + Playwright) plus durable memory that makes the next run smarter.',
        '',
        'Recommended loop:',
        '1. proba_project_list — see projects and their apps (surfaces). Create with proba_project_create / proba_app_create if needed.',
        '2. proba_session_open({ appKey }) — open/resume a session. It returns what is ALREADY known (selectors, accounts) for that app, so resume instead of re-exploring. This is the moat: do not rediscover what a prior session learned.',
        '3. proba_start_case({ title }) — begin recording a test.',
        '4. proba_act / proba_request — drive the app. Each call executes AND records a step.',
        '5. proba_finalize_test — emit the Gherkin + JSON + Playwright artifacts.',
        '6. proba_replay — re-run a finalized case; a failure auto-files a board bug, which you can proba_diagnose (live candidate locators) then proba_patch_step to fix; a clean replay auto-resolves it.',
        '',
        'Locator discipline (enforced at emit time): use role / text / label / testid. Positional CSS (nth-child, deep chains) is REJECTED. getByRole that matches multiple elements throws (strict mode) — make locators unique (add name, exact:true, or scope).',
        '',
        'Assertions auto-wait (web-first), so you rarely need an explicit wait step. A `wait` step settles the page (bounded network-idle) and is useful right after a login/redirect on apps with persistent connections (Firebase, websockets).',
        '',
        'Accounts & config: store per-app test accounts and variables with proba_account_set / proba_config_set instead of hardcoding credentials in steps. Reference them in any step value as {{account.<name>.<field>}} or {{var.<name>}} (e.g. {{account.client.email}}); they resolve at run time. proba_config_list shows what an app has. This keeps secrets out of the test artifacts and lets one flow run against different accounts.',
        '',
        'Memory: proba_remember persists a discovered fact (selector / quirk / exploration / healing / auth) scoped to the app so future sessions reuse it.',
      ].join('\n'),
    },
  )
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

  // ── per-app config: test accounts + variables (referenced in steps as {{…}}) ──
  server.tool(
    'proba_account_set',
    'Store a named test account for an app (idempotent on name). Reference its fields in any step value as {{account.<name>.<field>}} — e.g. {{account.client.email}} / {{account.client.password}}. Keeps credentials out of the test artifacts and lets one flow run against different accounts/roles.',
    {
      appKey: z.string(),
      name: z.string().describe("logical name, e.g. 'client' / 'admin' / 'pro'"),
      fields: z.record(z.string()).describe('arbitrary key→value, e.g. { email, password, role }'),
      secret: z.boolean().optional().describe('mask in UI/exports (default true)'),
    },
    async (a) => {
      setAccount(db, a.appKey, a.name, a.fields, a.secret ?? true)
      return ok({ ok: true, ref: `{{account.${a.name}.<field>}}` })
    },
  )

  server.tool(
    'proba_config_set',
    'Store a named variable for an app (idempotent on name). Reference it in any step value as {{var.<name>}} — e.g. a base URL, a coupon code, an environment value.',
    {
      appKey: z.string(),
      name: z.string(),
      value: z.string(),
      secret: z.boolean().optional(),
    },
    async (a) => {
      setVar(db, a.appKey, a.name, a.value, a.secret ?? false)
      return ok({ ok: true, ref: `{{var.${a.name}}}` })
    },
  )

  server.tool(
    'proba_config_list',
    "List an app's test accounts and variables (secret values are masked). Use to see what {{account.*}} / {{var.*}} references are available before writing steps.",
    { appKey: z.string() },
    async (a) => {
      const { accounts, vars } = listAppConfig(db, a.appKey)
      return ok({
        accounts: accounts.map((ac) => ({
          name: ac.name,
          fields: ac.secret ? maskFields(ac.fields) : ac.fields,
          ref: `{{account.${ac.name}.<field>}}`,
        })),
        vars: vars.map((v) => ({
          name: v.name,
          value: v.secret ? '••••••' : v.value,
          ref: `{{var.${v.name}}}`,
        })),
      })
    },
  )

  server.tool(
    'proba_config_delete',
    'Remove a test account or variable from an app.',
    { appKey: z.string(), type: z.enum(['account', 'var']), name: z.string() },
    async (a) => {
      deleteAppConfig(db, a.appKey, a.type, a.name)
      return ok({ ok: true })
    },
  )

  server.tool(
    'proba_save_auth',
    "Capture the open session's auth (cookies + localStorage, i.e. Playwright storageState) and store it for the app. After this, replays and new sessions for the app start ALREADY logged in — gated routes work without re-login steps. Log in once (manually or via an account), then call this. Optional `name` to keep more than one (e.g. per role).",
    { name: z.string().optional().describe("e.g. 'client' / 'admin' (default 'default')") },
    async (a) => ok(await recorder.saveAuth(a.name)),
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
    'Persist a discovered fact (selector/quirk/exploration/healing/auth) so future sessions resume.',
    {
      kind: z.enum(['selector', 'quirk', 'exploration', 'healing', 'auth']),
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
    'proba_replay_suite',
    'Replay every case in a suite and aggregate. Pass `accounts` to run the whole suite once PER account (a variation matrix): each pass binds the generic {{account.<field>}} to that account and injects its saved auth, so one flow validates several roles.',
    { suiteId: z.string(), accounts: z.array(z.string()).optional() },
    async (a) => ok(await recorder.replaySuite(a.suiteId, a.accounts ?? [])),
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
