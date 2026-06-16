import { describe, expect, it } from 'vitest'
import { openStore } from './client'
import {
  buildResolver,
  clearAuthState,
  deleteAppConfig,
  getAuthState,
  listAppConfig,
  listAuthNames,
  resolveStepValues,
  resolveTemplate,
  saveAuthState,
  setAccount,
  setVar,
} from './config'

function db() {
  return openStore(':memory:')
}

// the in-memory store has no migrations applied; create the table the helpers use
function withTable(d: ReturnType<typeof openStore>) {
  // @ts-expect-error reach the underlying better-sqlite3 handle for a one-off DDL
  const sqlite = d.session.client as { exec: (s: string) => void }
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS app_config (
      id text PRIMARY KEY NOT NULL, app_key text NOT NULL, type text NOT NULL,
      name text NOT NULL, data text NOT NULL, secret integer DEFAULT false NOT NULL,
      created_at integer NOT NULL, updated_at integer NOT NULL,
      UNIQUE(app_key, type, name)
    );
    CREATE TABLE IF NOT EXISTS knowledge (
      id text PRIMARY KEY NOT NULL, app_key text NOT NULL, session_id text,
      kind text NOT NULL, key text NOT NULL, value text NOT NULL,
      confidence real DEFAULT 0.5 NOT NULL, observed_at integer NOT NULL
    );`,
  )
  return d
}

describe('app config: accounts + variables', () => {
  it('stores and lists an account, masking nothing in the raw view', () => {
    const d = withTable(db())
    setAccount(d, 'shop-web', 'client', { email: 'a@b.test', password: 'p1', role: 'client' })
    const { accounts } = listAppConfig(d, 'shop-web')
    expect(accounts).toHaveLength(1)
    expect(accounts[0]!.name).toBe('client')
    expect(accounts[0]!.fields.email).toBe('a@b.test')
  })

  it('is idempotent on (app, type, name)', () => {
    const d = withTable(db())
    setAccount(d, 'shop-web', 'client', { email: 'a@b.test', password: 'p1' })
    setAccount(d, 'shop-web', 'client', { email: 'c@d.test', password: 'p2' })
    const { accounts } = listAppConfig(d, 'shop-web')
    expect(accounts).toHaveLength(1)
    expect(accounts[0]!.fields.email).toBe('c@d.test')
  })

  it('resolves {{account.*}} and {{var.*}} in step values', () => {
    const d = withTable(db())
    setAccount(d, 'shop-web', 'client', { email: 'a@b.test', password: 's3cret' })
    setVar(d, 'shop-web', 'baseURL', 'https://shop.test')
    const vars = buildResolver(d, 'shop-web')

    const step = {
      target: { strategy: 'css', value: 'input[type=email]' },
      params: { url: '{{var.baseURL}}/login', text: '{{account.client.email}}' },
    }
    const resolved = resolveStepValues(step, vars)
    expect(resolved.params.url).toBe('https://shop.test/login')
    expect(resolved.params.text).toBe('a@b.test')
    // original is untouched (templates stay in storage)
    expect(step.params.text).toBe('{{account.client.email}}')
  })

  it('leaves unknown placeholders intact', () => {
    expect(resolveTemplate('{{account.ghost.email}}', {})).toBe('{{account.ghost.email}}')
  })

  it('binds the generic {{account.<field>}} to the active variation account', () => {
    const d = withTable(db())
    setAccount(d, 'shop-web', 'client', { email: 'c@b.test', password: 'p1' })
    setAccount(d, 'shop-web', 'admin', { email: 'a@b.test', password: 'p2' })
    // no active account: only the qualified form resolves
    expect(buildResolver(d, 'shop-web')['account.email']).toBeUndefined()
    // active = admin: generic alias points at admin, qualified still works for both
    const m = buildResolver(d, 'shop-web', 'admin')
    expect(m['account.email']).toBe('a@b.test')
    expect(m['account.client.email']).toBe('c@b.test')
  })

  it('deletes an entry', () => {
    const d = withTable(db())
    setVar(d, 'shop-web', 'coupon', 'SAVE10')
    deleteAppConfig(d, 'shop-web', 'var', 'coupon')
    expect(listAppConfig(d, 'shop-web').vars).toHaveLength(0)
  })
})

describe('captured auth (storageState reuse)', () => {
  const state = {
    cookies: [{ name: 's', value: 'x' }],
    origins: [{ origin: 'https://shop.test', localStorage: [] }],
  }

  it('saves, round-trips, lists and clears an auth state', () => {
    const d = withTable(db())
    expect(getAuthState(d, 'shop-web')).toBeUndefined()
    saveAuthState(d, 'shop-web', state)
    expect(getAuthState(d, 'shop-web')).toEqual(state)
    expect(listAuthNames(d, 'shop-web')).toEqual(['default'])
    clearAuthState(d, 'shop-web')
    expect(getAuthState(d, 'shop-web')).toBeUndefined()
  })

  it('keeps one state per name (upsert)', () => {
    const d = withTable(db())
    saveAuthState(d, 'shop-web', { cookies: [], origins: [] }, 'admin')
    saveAuthState(d, 'shop-web', state, 'admin')
    expect(listAuthNames(d, 'shop-web')).toEqual(['admin'])
    expect(getAuthState(d, 'shop-web', 'admin')).toEqual(state)
  })
})
