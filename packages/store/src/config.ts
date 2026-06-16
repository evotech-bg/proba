/**
 * Per-app config: named test accounts + variables.
 *
 * So credentials are not hardcoded into steps and one flow can run against
 * different accounts. A step value may contain placeholders:
 *   {{account.<name>.<field>}}   e.g. {{account.client.email}}
 *   {{var.<name>}}               e.g. {{var.baseURL}}
 * The engine layer resolves these at run time against the session's appKey,
 * while the stored step keeps the placeholder (so artifacts stay secret-free
 * and re-runnable against a different account).
 *
 * Pure helpers (take a db) so the dashboard and the MCP server share them.
 */
import { and, desc, eq } from 'drizzle-orm'
import type { ProbaDb } from './client'
import { appConfig as appConfigT, knowledge as knowledgeT } from './schema'

export interface AccountEntry {
  name: string
  fields: Record<string, string>
  secret: boolean
}
export interface VarEntry {
  name: string
  value: string
  secret: boolean
}
export interface AppConfigView {
  accounts: AccountEntry[]
  vars: VarEntry[]
}

/** Upsert a test account (name unique per app). `fields` is arbitrary (email, password, role…). */
export function setAccount(
  db: ProbaDb,
  appKey: string,
  name: string,
  fields: Record<string, string>,
  secret = true,
): void {
  upsert(db, appKey, 'account', name, { fields }, secret)
}

/** Upsert a named variable (e.g. baseURL, a coupon code). */
export function setVar(
  db: ProbaDb,
  appKey: string,
  name: string,
  value: string,
  secret = false,
): void {
  upsert(db, appKey, 'var', name, { value }, secret)
}

function upsert(
  db: ProbaDb,
  appKey: string,
  type: 'account' | 'var',
  name: string,
  data: Record<string, unknown>,
  secret: boolean,
): void {
  db.insert(appConfigT)
    .values({ appKey, type, name, data, secret })
    .onConflictDoUpdate({
      target: [appConfigT.appKey, appConfigT.type, appConfigT.name],
      set: { data, secret, updatedAt: new Date() },
    })
    .run()
}

/** Remove a config entry. */
export function deleteAppConfig(
  db: ProbaDb,
  appKey: string,
  type: 'account' | 'var',
  name: string,
): void {
  db.delete(appConfigT)
    .where(and(eq(appConfigT.appKey, appKey), eq(appConfigT.type, type), eq(appConfigT.name, name)))
    .run()
}

/** All accounts + vars for an app. */
export function listAppConfig(db: ProbaDb, appKey: string): AppConfigView {
  const rows = db.select().from(appConfigT).where(eq(appConfigT.appKey, appKey)).all()
  const accounts: AccountEntry[] = []
  const vars: VarEntry[] = []
  for (const r of rows) {
    if (r.type === 'account') {
      accounts.push({
        name: r.name,
        fields: (r.data.fields as Record<string, string>) ?? {},
        secret: r.secret,
      })
    } else {
      vars.push({ name: r.name, value: String(r.data.value ?? ''), secret: r.secret })
    }
  }
  accounts.sort((a, b) => a.name.localeCompare(b.name))
  vars.sort((a, b) => a.name.localeCompare(b.name))
  return { accounts, vars }
}

/**
 * Flat lookup map: `account.client.email` / `var.baseURL` → value.
 *
 * When `activeAccount` is given (a variation run), that account's fields are also
 * exposed UNqualified as `account.<field>` — so a flow written with the generic
 * `{{account.email}}` runs against whichever account the matrix currently binds.
 */
export function buildResolver(
  db: ProbaDb,
  appKey: string,
  activeAccount?: string,
): Record<string, string> {
  const { accounts, vars } = listAppConfig(db, appKey)
  const map: Record<string, string> = {}
  for (const a of accounts)
    for (const [k, v] of Object.entries(a.fields)) map[`account.${a.name}.${k}`] = v
  for (const v of vars) map[`var.${v.name}`] = v.value
  if (activeAccount) {
    const active = accounts.find((a) => a.name === activeAccount)
    if (active) for (const [k, v] of Object.entries(active.fields)) map[`account.${k}`] = v
  }
  return map
}

// ── captured auth (Playwright storageState) — the moat: log in once, reuse ────
// Stored as a knowledge entry (kind 'auth') scoped to the app, keyed by a name
// (default 'default', or an account name). Replay/sessions inject it so gated
// routes work without re-login steps.

/** Save the current session's storageState for an app (one per name; upserts). */
export function saveAuthState(
  db: ProbaDb,
  appKey: string,
  storageState: unknown,
  name = 'default',
): void {
  db.delete(knowledgeT)
    .where(
      and(eq(knowledgeT.appKey, appKey), eq(knowledgeT.kind, 'auth'), eq(knowledgeT.key, name)),
    )
    .run()
  db.insert(knowledgeT)
    .values({ appKey, kind: 'auth', key: name, value: { storageState }, confidence: 1 })
    .run()
}

/** The most recent saved storageState for an app (optionally a specific name), or undefined. */
export function getAuthState(db: ProbaDb, appKey: string, name?: string): unknown | undefined {
  const where = name
    ? and(eq(knowledgeT.appKey, appKey), eq(knowledgeT.kind, 'auth'), eq(knowledgeT.key, name))
    : and(eq(knowledgeT.appKey, appKey), eq(knowledgeT.kind, 'auth'))
  const row = db
    .select()
    .from(knowledgeT)
    .where(where)
    .orderBy(desc(knowledgeT.observedAt))
    .limit(1)
    .all()[0]
  const ss = (row?.value as { storageState?: unknown } | undefined)?.storageState
  return ss ?? undefined
}

/** Names of saved auth states for an app (for UI). */
export function listAuthNames(db: ProbaDb, appKey: string): string[] {
  return db
    .select()
    .from(knowledgeT)
    .where(and(eq(knowledgeT.appKey, appKey), eq(knowledgeT.kind, 'auth')))
    .all()
    .map((r) => r.key)
}

/** Forget a saved auth state. */
export function clearAuthState(db: ProbaDb, appKey: string, name = 'default'): void {
  db.delete(knowledgeT)
    .where(
      and(eq(knowledgeT.appKey, appKey), eq(knowledgeT.kind, 'auth'), eq(knowledgeT.key, name)),
    )
    .run()
}

const TEMPLATE = /\{\{\s*([\w.-]+)\s*\}\}/g

/** Replace {{…}} placeholders in a string against the resolver map (unknown keys are left as-is). */
export function resolveTemplate(s: string, vars: Record<string, string>): string {
  return s.replace(TEMPLATE, (m, key) => vars[key] ?? m)
}

/** Does a value contain any {{…}} placeholder? */
export function hasTemplate(s: string | undefined | null): boolean {
  return typeof s === 'string' && TEMPLATE.test(s)
}

/**
 * Resolve all {{…}} placeholders inside a step's target value and string params,
 * returning a NEW step for execution (the original, with placeholders, is what gets stored).
 */
export function resolveStepValues<
  T extends { target?: { value?: string } | null; params?: Record<string, unknown> | null },
>(step: T, vars: Record<string, string>): T {
  if (Object.keys(vars).length === 0) return step
  const next: T = { ...step }
  if (step.target?.value && hasTemplate(step.target.value)) {
    next.target = { ...step.target, value: resolveTemplate(step.target.value, vars) }
  }
  if (step.params) {
    let touched = false
    const p: Record<string, unknown> = { ...step.params }
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'string' && hasTemplate(v)) {
        p[k] = resolveTemplate(v, vars)
        touched = true
      }
    }
    if (touched) next.params = p
  }
  return next
}
