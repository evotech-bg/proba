import { newDb } from 'pg-mem'
import { describe, expect, it } from 'vitest'
import { PostgresAdapter, assertRows, detectDialect, openDbAdapter } from './db'

describe('detectDialect', () => {
  it('reads protocol from url, defaults to sqlite', () => {
    expect(detectDialect('postgres://x')).toBe('postgres')
    expect(detectDialect('postgresql://x')).toBe('postgres')
    expect(detectDialect('mysql://x')).toBe('mysql')
    expect(detectDialect('./app.db')).toBe('sqlite')
  })
})

describe('sqlite adapter', () => {
  it('query + transaction-rollback isolation (async)', async () => {
    const db = await openDbAdapter(':memory:')
    await db.query('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    await db.query("INSERT INTO users (name) VALUES ('Ada')")

    await db.withRollback(async () => {
      await db.query("INSERT INTO users (name) VALUES ('Temp')")
      expect((await db.query('SELECT COUNT(*) AS n FROM users'))[0]!.n).toBe(2)
    })
    expect((await db.query('SELECT COUNT(*) AS n FROM users'))[0]!.n).toBe(1)
    await db.close()
  })
})

describe('postgres adapter (via pg-mem, no server)', () => {
  it('runs parameterized queries through the same interface', async () => {
    const mem = newDb()
    const { Client } = mem.adapters.createPg()
    const client = new Client()
    await client.connect()
    const db = new PostgresAdapter(client)

    await db.query('CREATE TABLE users (id serial PRIMARY KEY, name text)')
    await db.query('INSERT INTO users (name) VALUES ($1)', ['Ada'])
    const rows = await db.query('SELECT name FROM users WHERE name = $1', ['Ada'])
    expect(rows).toEqual([{ name: 'Ada' }])
    await db.close()
  })
})

describe('assertRows', () => {
  it('checks counts and first-row equality', () => {
    const rows = [{ id: 1, name: 'Ada' }]
    expect(assertRows(rows, { minRows: 1, equals: { name: 'Ada' } })).toEqual([])
    expect(assertRows(rows, { minRows: 2 })).toContain('rows 1 < min 2')
  })
})
