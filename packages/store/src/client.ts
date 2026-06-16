import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type ProbaDb = ReturnType<typeof openStore>

/**
 * Open Proba's local store. SQLite by default (local-first; the durable task/artifact DB).
 * @param path file path, defaults to `.proba/proba.db` (or $PROBA_DB).
 */
export function openStore(path: string = process.env.PROBA_DB ?? '.proba/proba.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export { schema }
