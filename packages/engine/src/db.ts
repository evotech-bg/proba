import Database from 'better-sqlite3'

/**
 * Dialect-honest DB adapter for *target apps under test* (not Proba's own store).
 *
 * SQLite, Postgres and MySQL are wired behind one async interface. The layer is honest about
 * dialect differences (it doesn't rewrite SQL); default users toward testing against the same
 * engine as production. Postgres/MySQL drivers are loaded lazily so sqlite-only use needs neither.
 */
export type Dialect = 'sqlite' | 'postgres' | 'mysql'

export interface DbAdapter {
  readonly dialect: Dialect
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  /** Run fn inside a transaction that is always rolled back — test isolation by default. */
  withRollback<T>(fn: () => T | Promise<T>): Promise<T>
  close(): Promise<void>
}

export function detectDialect(url: string): Dialect {
  if (/^postgres(ql)?:\/\//.test(url)) return 'postgres'
  if (/^mysql:\/\//.test(url)) return 'mysql'
  return 'sqlite'
}

// ── SQLite (better-sqlite3, sync under the hood) ──────────────────────────────
class SqliteAdapter implements DbAdapter {
  readonly dialect = 'sqlite' as const
  private db: Database.Database
  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('foreign_keys = ON')
  }
  async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const stmt = this.db.prepare(sql)
    if (stmt.reader) return stmt.all(...(params as never[])) as Record<string, unknown>[]
    stmt.run(...(params as never[]))
    return []
  }
  async withRollback<T>(fn: () => T | Promise<T>): Promise<T> {
    this.db.exec('BEGIN')
    try {
      return await fn()
    } finally {
      this.db.exec('ROLLBACK')
    }
  }
  async close(): Promise<void> {
    this.db.close()
  }
}

// ── Postgres (pg) — accepts an injected client (e.g. pg-mem for tests) ─────────
interface PgLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  end?(): Promise<void>
}

export class PostgresAdapter implements DbAdapter {
  readonly dialect = 'postgres' as const
  constructor(private readonly client: PgLike) {}
  static async connect(url: string): Promise<PostgresAdapter> {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: url })
    await client.connect()
    return new PostgresAdapter(client as unknown as PgLike)
  }
  async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    return (await this.client.query(sql, params)).rows
  }
  async withRollback<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.client.query('BEGIN')
    try {
      return await fn()
    } finally {
      await this.client.query('ROLLBACK')
    }
  }
  async close(): Promise<void> {
    await this.client.end?.()
  }
}

// ── MySQL (mysql2/promise) ────────────────────────────────────────────────────
interface MysqlLike {
  query(sql: string, params?: unknown[]): Promise<[unknown, unknown]>
  end?(): Promise<void>
}

export class MySqlAdapter implements DbAdapter {
  readonly dialect = 'mysql' as const
  constructor(private readonly conn: MysqlLike) {}
  static async connect(url: string): Promise<MySqlAdapter> {
    const mysql = await import('mysql2/promise')
    const conn = await mysql.createConnection(url)
    return new MySqlAdapter(conn as unknown as MysqlLike)
  }
  async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const [rows] = await this.conn.query(sql, params)
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
  }
  async withRollback<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.conn.query('START TRANSACTION')
    try {
      return await fn()
    } finally {
      await this.conn.query('ROLLBACK')
    }
  }
  async close(): Promise<void> {
    await this.conn.end?.()
  }
}

/** Open a DB adapter from a connection URL/path. Defaults to SQLite. */
export async function openDbAdapter(url: string): Promise<DbAdapter> {
  const dialect = detectDialect(url)
  if (dialect === 'postgres') return PostgresAdapter.connect(url)
  if (dialect === 'mysql') return MySqlAdapter.connect(url)
  const path = url.replace(/^sqlite:(\/\/)?/, '') || ':memory:'
  return new SqliteAdapter(path)
}

/** Assert a row count / shape against query results. Returns failure messages (empty = pass). */
export function assertRows(
  rows: Record<string, unknown>[],
  expect: { minRows?: number; maxRows?: number; equals?: Record<string, unknown> },
): string[] {
  const fails: string[] = []
  if (expect.minRows != null && rows.length < expect.minRows)
    fails.push(`rows ${rows.length} < min ${expect.minRows}`)
  if (expect.maxRows != null && rows.length > expect.maxRows)
    fails.push(`rows ${rows.length} > max ${expect.maxRows}`)
  if (expect.equals) {
    const first = rows[0] ?? {}
    for (const [k, v] of Object.entries(expect.equals)) {
      if (JSON.stringify(first[k]) !== JSON.stringify(v))
        fails.push(`row[0].${k} = ${JSON.stringify(first[k])} ≠ ${JSON.stringify(v)}`)
    }
  }
  return fails
}
