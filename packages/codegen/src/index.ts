/**
 * @proba/codegen — the artifact trinity renderers.
 *
 *   JSON canonical (CanonicalTest)  ──►  Playwright TS  (executable, QA edits)
 *                                   └─►  Gherkin .feature (intent, BDD)
 *
 * Canonical is the source of truth; both outputs are derived. The TS is what CI runs and the
 * QA refines; the Gherkin carries intent for humans/PMs.
 */
import { toPlaywright } from '@proba/locator'
import type { AssertionSpec, StepSpec } from '@proba/engine'

export interface CanonicalTest {
  title: string
  intent?: string
  /** "positive" (happy path) | "negative" (error/invalid) — surfaces in comments/tags */
  polarity?: 'positive' | 'negative'
  steps: StepSpec[]
}

const ESC = (s: string) => s.replace(/'/g, "\\'")
const SNAP_SLUG = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'snapshot'

// ── Playwright TS ─────────────────────────────────────────────────────────────
function webLine(step: StepSpec): string[] {
  const p = step.params ?? {}
  switch (step.action) {
    case 'navigate':
      return [`  await page.goto('${ESC(String(p.url))}')`]
    case 'click':
      return [`  await ${toPlaywright(step.target!)}.click()`]
    case 'fill':
      return [`  await ${toPlaywright(step.target!)}.fill('${ESC(String(p.text ?? ''))}')`]
    case 'select':
      return [`  await ${toPlaywright(step.target!)}.selectOption('${ESC(String(p.value))}')`]
    case 'check':
      return [`  await ${toPlaywright(step.target!)}.check()`]
    case 'wait':
      return [`  await page.waitForLoadState('networkidle')`]
    case 'expect':
      return (step.assertions ?? []).flatMap((a) => domExpect(step, a))
    default:
      return [`  // TODO: unsupported web action "${step.action}"`]
  }
}

function domExpect(step: StepSpec, a: AssertionSpec): string[] {
  // visual snapshot → Playwright's built-in screenshot comparison
  if (a.type === 'visual') {
    const name = SNAP_SLUG(
      a.name ?? step.description ?? (step.target ? step.target.value : 'visual'),
    )
    const subject = step.target ? toPlaywright(step.target) : 'page'
    return [`  await expect(${subject}).toHaveScreenshot('${name}.png')`]
  }
  // text/DOM snapshot → Playwright's toMatchSnapshot on the serialized content
  if (a.type === 'snapshot') {
    const name = SNAP_SLUG(
      a.name ?? step.description ?? (step.target ? step.target.value : 'snapshot'),
    )
    const subject = step.target
      ? `await ${toPlaywright(step.target)}.textContent()`
      : `await page.textContent('body')`
    return [`  expect(${subject}).toMatchSnapshot('${name}.txt')`]
  }
  if (a.type !== 'dom') return []
  const loc = toPlaywright(step.target!)
  const out: string[] = []
  if (a.visible) out.push(`  await expect(${loc}).toBeVisible()`)
  if (a.toContainText) out.push(`  await expect(${loc}).toContainText('${ESC(a.toContainText)}')`)
  return out
}

function apiLines(step: StepSpec): string[] {
  const r = step.params as { method?: string; url?: string; body?: unknown }
  const method = (r.method ?? 'GET').toLowerCase()
  const out = [`  const res = await request.${method}('${ESC(String(r.url))}')`]
  for (const a of step.assertions ?? []) {
    if (a.type === 'http' && a.status != null) out.push(`  expect(res.status()).toBe(${a.status})`)
    if (a.type === 'body' && a.equals !== undefined)
      out.push(`  expect((await res.json()).${a.path}).toEqual(${JSON.stringify(a.equals)})`)
  }
  return out
}

export function toPlaywrightTs(test: CanonicalTest): string {
  const body: string[] = []
  if (test.intent) body.push(`  // ${test.intent}`)
  if (test.polarity === 'negative') body.push('  // negative test (error / invalid path)')
  for (const step of test.steps) {
    if (step.description) body.push(`  // ${step.description}`)
    if (step.kind === 'web') body.push(...webLine(step))
    else if (step.kind === 'api') body.push(...apiLines(step))
    else body.push(`  // db step (${step.action}) — wire via a DB fixture/adapter`)
  }
  const fixtures = test.steps.some((s) => s.kind === 'api') ? '{ page, request }' : '{ page }'
  return `import { test, expect } from '@playwright/test'

test('${ESC(test.title)}', async (${fixtures}) => {
${body.join('\n')}
})
`
}

// ── Gherkin .feature ──────────────────────────────────────────────────────────
const SETUP = new Set(['navigate', 'seed'])
const VERIFY = new Set(['expect', 'assertRows'])

function gherkinClause(step: StepSpec): { kw: 'Given' | 'When' | 'Then'; text: string } {
  const kw = SETUP.has(step.action) ? 'Given' : VERIFY.has(step.action) ? 'Then' : 'When'
  const text = step.description ?? `${step.action} ${describeTarget(step)}`.trim()
  return { kw, text }
}

function describeTarget(step: StepSpec): string {
  if (step.target) return step.target.name ?? step.target.value
  if (step.kind === 'api') return String((step.params as { url?: string })?.url ?? '')
  return ''
}

export function toGherkin(test: CanonicalTest, feature = 'Proba scenarios'): string {
  const lines = [`Feature: ${feature}`, '', `  Scenario: ${test.title}`]
  let lastKw = ''
  for (const step of test.steps) {
    const { kw, text } = gherkinClause(step)
    const word = kw === lastKw ? 'And' : kw
    lines.push(`    ${word} ${text}`)
    lastKw = kw
  }
  return `${lines.join('\n')}\n`
}
