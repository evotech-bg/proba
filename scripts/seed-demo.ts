/**
 * Build a curated demo store for Proba.
 *
 *   tsx scripts/seed-demo.ts <db-path>
 *
 * Produces a rich, self-contained SQLite database: two projects across four surfaces, web/API/DB
 * tests (positive + negative, with BDD intent and stable locators), suites, requirements with
 * coverage, a run history (incl. flaky), recorded sessions with learned selectors of every kind,
 * and an auto-filed bug ticket. Every web test navigates a `data:` URL, so Run / Replay works
 * offline and produces real screenshots. Deterministic and re-runnable — overwrites the target.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import {
  apps as appsT,
  assertions as assertionsT,
  ensureApp,
  ensureProject,
  setAccount,
  setVar,
  flakyRecords as flakyT,
  knowledge as knowledgeT,
  openStore,
  projects as projectsT,
  requirements as requirementsT,
  results as resultsT,
  sessions as sessionsT,
  steps as stepsT,
  suiteCases as suiteCasesT,
  suites as suitesT,
  tasks as tasksT,
  testCases as testCasesT,
  testRuns as runsT,
  traceLinks as traceLinksT,
} from '@proba/store'

const target = resolve(process.argv[2] ?? 'demo/proba.db')
const here = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = join(here, '..', 'packages', 'store', 'migrations')

if (existsSync(target)) rmSync(target)
for (const ext of ['-wal', '-shm']) if (existsSync(target + ext)) rmSync(target + ext)
mkdirSync(dirname(target), { recursive: true })

const db = openStore(target)
migrate(db, { migrationsFolder })

const NOW = Date.now()
const ago = (mins: number) => new Date(NOW - mins * 60_000)
const days = (d: number) => ago(d * 24 * 60)

// a small self-contained page so Run/Replay works offline
const page = (html: string) => `data:text/html,${encodeURIComponent(html)}`
const SIGNIN_OK = page(
  '<form onsubmit="return false"><label>Email <input type="email"></label><label>Password <input type="password"></label><button type="button">Sign in</button></form><div role="alert">Welcome back, Ada</div>',
)
const SIGNIN_BAD = page(
  '<form onsubmit="return false"><label>Password <input type="password"></label><button type="button">Sign in</button></form><div role="alert">Invalid credentials</div>',
)
const CART = page(
  '<h1>Your cart</h1><ul><li>Keyboard — €79</li><li>Mouse — €39</li></ul><div role="status">2 items</div><button type="button">Checkout</button>',
)
const CONFIRM = page(
  '<h1>Order confirmed</h1><div role="alert">Thank you! Your order #1042 is on its way.</div>',
)
const DASH = page('<header><h1>Dashboard</h1><div role="status">Signed in as Ada</div></header>')
const ONBOARD = page(
  '<h1>Welcome to Acme</h1><div role="status">Step 3 of 3 — you are all set</div>',
)
const ADMIN = page(
  '<h1>Team</h1><table><tr><td>Ada</td><td>Editor</td></tr></table><div role="alert">Role updated</div>',
)
const ADMIN_DENIED = page('<div role="alert">403 — Admins only</div>')

// ── projects → apps ───────────────────────────────────────────────────────────
ensureProject(db, 'demo-shop', 'Demo Shop', 'A sample e-commerce storefront')
ensureApp(db, 'demo-shop-web', 'demo-shop', 'Web', 'web')
ensureApp(db, 'demo-shop-api', 'demo-shop', 'API', 'api')
ensureProject(db, 'acme', 'Acme SaaS', 'A B2B SaaS product')
ensureApp(db, 'acme-web', 'acme', 'Web', 'web')
ensureApp(db, 'acme-admin', 'acme', 'Admin', 'web')

// per-app test accounts + variables (referenced in steps as {{account.*}} / {{var.*}})
setAccount(db, 'demo-shop-web', 'shopper', {
  email: 'shopper@example.com',
  password: 'demo-pass-1',
  role: 'customer',
})
setAccount(db, 'acme-admin', 'admin', {
  email: 'admin@example.com',
  password: 'demo-pass-2',
  role: 'admin',
})
setVar(db, 'demo-shop-web', 'baseURL', 'https://demo.shop.example')

// ── requirements (RTM) ────────────────────────────────────────────────────────
const req = (appKey: string, key: string, title: string, iWant?: string) =>
  db.insert(requirementsT).values({ appKey, key, title, asA: 'user', iWant }).returning().all()[0]!
const SHOP1 = req('demo-shop-web', 'SHOP-1', 'A visitor can sign in', 'to access my account')
const SHOP2 = req('demo-shop-web', 'SHOP-2', 'The cart shows added items')
req('demo-shop-web', 'SHOP-3', 'Checkout completes end to end')
req('demo-shop-api', 'API-1', 'The auth endpoint rejects bad credentials')
const SAAS1 = req('acme-web', 'SAAS-1', 'A new user can complete onboarding')
req('acme-web', 'SAAS-2', 'The dashboard greets the signed-in user')
const ADM1 = req('acme-admin', 'ADM-1', 'An admin can change a user role')

// ── tests (with steps + assertions) ───────────────────────────────────────────
type StepDef = {
  kind: 'web' | 'api' | 'db'
  action: string
  target?: unknown
  params?: unknown
  description?: string
  assertion?: unknown
}
function test(opts: {
  appKey: string
  title: string
  intent?: string
  polarity?: 'positive' | 'negative'
  technique?: string
  lifecycle?: string
  tags?: string[]
  steps: StepDef[]
}) {
  const tc = db
    .insert(testCasesT)
    .values({
      appKey: opts.appKey,
      title: opts.title,
      intent: opts.intent,
      polarity: (opts.polarity ?? 'positive') as never,
      technique: (opts.technique ?? 'manual') as never,
      lifecycle: 'active',
      tags: (opts.tags ?? []) as never,
    })
    .returning()
    .all()[0]!
  opts.steps.forEach((s, i) => {
    const step = db
      .insert(stepsT)
      .values({
        caseId: tc.id,
        ordinal: i + 1,
        kind: s.kind as never,
        action: s.action,
        target: (s.target ?? null) as never,
        params: (s.params ?? null) as never,
        description: s.description,
      })
      .returning()
      .all()[0]!
    if (s.assertion)
      db.insert(assertionsT)
        .values({ stepId: step.id, type: 'dom' as never, spec: s.assertion as never })
        .run()
  })
  return tc
}

const nav = (url: string, description: string): StepDef => ({
  kind: 'web',
  action: 'navigate',
  params: { url },
  description,
})
const fill = (label: string, text: string, description: string): StepDef => ({
  kind: 'web',
  action: 'fill',
  target: { strategy: 'label', value: label },
  params: { text },
  description,
})
const click = (name: string, description: string): StepDef => ({
  kind: 'web',
  action: 'click',
  target: { strategy: 'role', value: 'button', name },
  description,
})
const expectRole = (role: string, text: string, description: string): StepDef => ({
  kind: 'web',
  action: 'expect',
  target: { strategy: 'role', value: role },
  description,
  assertion: { type: 'dom', toContainText: text, visible: true },
})

const tSignin = test({
  appKey: 'demo-shop-web',
  title: 'sign in shows a confirmation',
  intent: 'A returning customer signs in and sees a welcome message',
  polarity: 'positive',
  technique: 'ep',
  tags: ['smoke', 'auth'],
  steps: [
    nav(SIGNIN_OK, 'open the sign-in page'),
    fill('Email', 'ada@demo.shop', 'enter the email'),
    fill('Password', 'correct horse', 'enter the password'),
    click('Sign in', 'submit'),
    expectRole('alert', 'Welcome back', 'a welcome banner is shown'),
  ],
})
const tReject = test({
  appKey: 'demo-shop-web',
  title: 'login rejects an invalid password',
  intent: 'A wrong password is refused with a clear error',
  polarity: 'negative',
  technique: 'bva',
  tags: ['smoke', 'auth', 'negative'],
  steps: [
    nav(SIGNIN_BAD, 'open the sign-in page'),
    fill('Password', 'wrong-pass', 'enter a wrong password'),
    click('Sign in', 'submit'),
    expectRole('alert', 'Invalid credentials', 'an error is shown'),
  ],
})
const tCart = test({
  appKey: 'demo-shop-web',
  title: 'cart shows the added items',
  intent: 'Items added to the cart are listed with a count',
  polarity: 'positive',
  tags: ['cart'],
  steps: [nav(CART, 'open the cart'), expectRole('status', '2 items', 'the item count is shown')],
})
const tCheckout = test({
  appKey: 'demo-shop-web',
  title: 'checkout completes from cart to confirmation',
  intent: 'A full checkout ends on the confirmation page',
  polarity: 'positive',
  technique: 'pairwise',
  tags: ['checkout', 'regression'],
  steps: [
    nav(CART, 'open the cart'),
    click('Checkout', 'start checkout'),
    nav(CONFIRM, 'land on confirmation'),
    expectRole('alert', 'Order confirmed', 'the order is confirmed'),
  ],
})
const tApi = test({
  appKey: 'demo-shop-api',
  title: 'GitHub API root returns 200',
  intent: 'A smoke check that the API executor works against a live endpoint',
  polarity: 'positive',
  tags: ['api', 'smoke'],
  steps: [
    {
      kind: 'api',
      action: 'request',
      params: { method: 'GET', url: 'https://api.github.com' },
      description: 'GET the API root',
      assertion: { type: 'http', status: 200 },
    },
  ],
})
const tOnboard = test({
  appKey: 'acme-web',
  title: 'new user completes onboarding',
  intent: 'A new user reaches the end of the onboarding flow',
  polarity: 'positive',
  tags: ['onboarding'],
  steps: [
    nav(ONBOARD, 'open onboarding'),
    expectRole('status', 'all set', 'the final step confirms completion'),
  ],
})
const tGreet = test({
  appKey: 'acme-web',
  title: 'dashboard greets the signed-in user',
  intent: 'The dashboard shows the signed-in user name',
  polarity: 'positive',
  tags: ['dashboard'],
  steps: [
    nav(DASH, 'open the dashboard'),
    expectRole('status', 'Signed in as Ada', 'the user is greeted'),
  ],
})
const tPromote = test({
  appKey: 'acme-admin',
  title: 'admin promotes a user to editor',
  intent: 'An admin changes a member role and sees confirmation',
  polarity: 'positive',
  tags: ['admin', 'roles'],
  steps: [
    nav(ADMIN, 'open the team page'),
    expectRole('alert', 'Role updated', 'the change is confirmed'),
  ],
})
const tDenied = test({
  appKey: 'acme-admin',
  title: 'non-admin cannot open settings',
  intent: 'A non-admin is blocked from admin settings',
  polarity: 'negative',
  tags: ['admin', 'access-control', 'negative'],
  steps: [
    nav(ADMIN_DENIED, 'attempt to open settings'),
    expectRole('alert', '403', 'access is denied'),
  ],
})

// ── coverage (trace links) ────────────────────────────────────────────────────
const cover = (reqId: string, caseId: string) =>
  db
    .insert(traceLinksT)
    .values({ requirementId: reqId, caseId, linkType: 'covers' as never })
    .run()
cover(SHOP1.id, tSignin.id)
cover(SHOP1.id, tReject.id)
cover(SHOP2.id, tCart.id)
cover(SAAS1.id, tOnboard.id)
cover(ADM1.id, tPromote.id)

// ── suites ────────────────────────────────────────────────────────────────────
function suite(appKey: string, name: string, kind: string, members: { id: string }[]) {
  const s = db
    .insert(suitesT)
    .values({ appKey, name, kind, description: `${name} for ${appKey}` })
    .returning()
    .all()[0]!
  members.forEach((m, i) =>
    db.insert(suiteCasesT).values({ suiteId: s.id, caseId: m.id, ordinal: i }).run(),
  )
  return s
}
suite('demo-shop-web', 'Smoke', 'smoke', [tSignin, tReject])
suite('demo-shop-web', 'Checkout regression', 'regression', [tCart, tCheckout])
suite('acme-web', 'Onboarding', 'acceptance', [tOnboard, tGreet])
suite('acme-admin', 'Access control', 'sanity', [tPromote, tDenied])

// ── run history (drives trend, verdicts, flaky) ───────────────────────────────
function run(caseId: string, verdict: 'passed' | 'failed', whenMins: number, env = 'replay') {
  const r = db
    .insert(runsT)
    .values({ environment: env, startedAt: ago(whenMins), finishedAt: ago(whenMins) })
    .returning()
    .all()[0]!
  db.insert(resultsT)
    .values({
      runId: r.id,
      caseId,
      verdict: verdict as never,
      durationMs: verdict === 'passed' ? 90 : 120,
      executedAt: ago(whenMins),
      message: verdict === 'failed' ? 'assertion failed' : undefined,
    })
    .run()
  return r
}
// a healthy history for most, an alternating (flaky) history for checkout
run(tSignin.id, 'passed', 12)
run(tSignin.id, 'passed', 60 * 24)
run(tSignin.id, 'passed', 60 * 48)
run(tReject.id, 'passed', 18)
run(tReject.id, 'passed', 60 * 25)
run(tCart.id, 'passed', 30)
run(tGreet.id, 'passed', 90)
run(tOnboard.id, 'passed', 120)
run(tPromote.id, 'passed', 200)
run(tCheckout.id, 'passed', 60 * 5)
run(tCheckout.id, 'failed', 60 * 8)
run(tCheckout.id, 'passed', 60 * 30)
run(tCheckout.id, 'failed', 60 * 50)
const failedRun = run(tDenied.id, 'failed', 7) // the run that will back the auto-bug

// ── flaky records ─────────────────────────────────────────────────────────────
db.insert(flakyT)
  .values({
    caseId: tCheckout.id,
    score: 0.5,
    rootCause: 'timing' as never,
    quarantined: true,
    slaDueAt: days(-3),
    lastSeenAt: ago(60 * 8),
  })
  .run()

// ── sessions + knowledge (the memory moat) ────────────────────────────────────
const sess1 = db
  .insert(sessionsT)
  .values({
    appKey: 'demo-shop-web',
    charter: 'Verify the sign-in confirmation flow',
    status: 'closed',
    timeboxMins: 30,
    metrics: { steps: 6, designMs: 120_000, execMs: 340_000, bugMs: 90_000, setupMs: 45_000 },
    notes: [
      'Sign-in confirmation appears as a role=alert banner, not a toast.',
      'Wrong-password path reuses the same alert region.',
    ],
    startedAt: days(0.4),
    endedAt: ago(60 * 9),
  })
  .returning()
  .all()[0]!
const learn = (
  sessionId: string,
  appKey: string,
  kind: string,
  key: string,
  value: unknown,
  confidence: number,
  whenMins: number,
) =>
  db
    .insert(knowledgeT)
    .values({
      sessionId,
      appKey,
      kind: kind as never,
      key,
      value: value as never,
      confidence,
      observedAt: ago(whenMins),
    })
    .run()
learn(
  sess1.id,
  'demo-shop-web',
  'selector',
  'signin.button',
  { strategy: 'role', value: 'button', name: 'Sign in' },
  0.9,
  60 * 9 + 30,
)
learn(
  sess1.id,
  'demo-shop-web',
  'selector',
  'signin.email',
  { strategy: 'label', value: 'Email' },
  0.95,
  60 * 9 + 25,
)
learn(
  sess1.id,
  'demo-shop-web',
  'auth',
  'demo-shop.session',
  { storageState: '.proba/auth/demo-shop.json', user: 'ada@demo.shop' },
  0.85,
  60 * 9 + 18,
)
learn(
  sess1.id,
  'demo-shop-web',
  'healing',
  'signin.button',
  {
    from: '#login-btn',
    to: { strategy: 'role', value: 'button', name: 'Sign in' },
    reason: 'id changed after a redesign',
  },
  0.7,
  60 * 9 + 8,
)
learn(
  sess1.id,
  'demo-shop-web',
  'exploration',
  'confirmation.banner',
  { note: 'success shows as role=alert and stays until navigation' },
  0.6,
  60 * 9 + 4,
)
learn(
  sess1.id,
  'demo-shop-web',
  'quirk',
  'toast.timing',
  { note: 'error alert auto-dismisses ~3s; assert fast or it flakes' },
  0.5,
  60 * 9 + 1,
)

const sess2 = db
  .insert(sessionsT)
  .values({
    appKey: 'acme-admin',
    charter: 'Explore role management',
    status: 'closed',
    metrics: { steps: 3 },
    startedAt: days(1.2),
    endedAt: days(1.1),
  })
  .returning()
  .all()[0]!
learn(
  sess2.id,
  'acme-admin',
  'selector',
  'team.roleCell',
  { strategy: 'role', value: 'cell', name: 'Editor' },
  0.8,
  60 * 26,
)
learn(
  sess2.id,
  'acme-admin',
  'quirk',
  'role.update.lag',
  { note: 'role change is written by a deferred trigger; can lag ~800ms' },
  0.55,
  60 * 26 - 5,
)

// ── board: manual tasks + one auto-filed bug ──────────────────────────────────
const task = (
  appKey: string,
  title: string,
  status: string,
  priority: number,
  order: number,
  assignee?: string,
) =>
  db
    .insert(tasksT)
    .values({ appKey, title, status: status as never, priority, boardOrder: order, assignee })
    .run()
task('demo-shop-web', 'Audit checkout page layout on mobile', 'todo', 3, 0)
task('demo-shop-web', 'Add a visual baseline for the cart', 'todo', 4, 1)
task('acme-web', 'Cross-browser smoke on staging', 'in_progress', 2, 0, 'qa')
task('acme-admin', 'Review negative-path coverage', 'review', 3, 0)
task('demo-shop-web', 'Verify sign-in confirmation flow', 'done', 3, 0, 'agent')

// auto-filed bug for the failing access-control test (mirrors the real replay loop)
db.insert(tasksT)
  .values({
    appKey: 'acme-admin',
    title: 'non-admin cannot open settings — failed at step 1 (expect)',
    description:
      'Automated replay of "non-admin cannot open settings" failed on replay.\n\n1 step did not pass:\n- step 1 · web expect (access is denied) → text lacks "403"\n\nCaught during replay run ' +
      failedRun.id +
      '.',
    status: 'todo' as never,
    priority: 3,
    assignee: 'agent',
    caseId: tDenied.id,
    runId: failedRun.id,
    evidence: {
      source: 'replay',
      failingStep: { ordinal: 1, kind: 'web', action: 'expect', message: 'text lacks "403"' },
      failureCount: 1,
    } as never,
  })
  .run()

const counts = {
  projects: db.select().from(projectsT).all().length,
  apps: db.select().from(appsT).all().length,
  tests: db.select().from(testCasesT).all().length,
  suites: db.select().from(suitesT).all().length,
  requirements: db.select().from(requirementsT).all().length,
  runs: db.select().from(runsT).all().length,
  sessions: db.select().from(sessionsT).all().length,
  knowledge: db.select().from(knowledgeT).all().length,
  tasks: db.select().from(tasksT).all().length,
}
console.log(`[proba] demo store written → ${target}`)
console.log(JSON.stringify(counts, null, 2))
