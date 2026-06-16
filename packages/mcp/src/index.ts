#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ensureProjectsBootstrap, openStore } from '@proba/store'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createServer } from './server'

const db = openStore(process.env.PROBA_DB ?? '.proba/proba.db')

// best-effort: ensure schema exists (migrations ship with @proba/store)
const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'store',
  'migrations',
)
try {
  migrate(db, { migrationsFolder })
  ensureProjectsBootstrap(db) // seed default project/app + backfill so scope works everywhere
} catch (e) {
  console.error('[proba] migration skipped:', e)
}

// CLI: `proba dashboard` launches the dashboard instead of the stdio MCP server
if (process.argv[2] === 'dashboard') {
  const { openDashboard } = await import('./dashboard')
  const res = await openDashboard({ openBrowser: true, dbPath: process.env.PROBA_DB })
  console.error(`[proba] dashboard: ${res.url}${res.note ? ` — ${res.note}` : ''}`)
  process.exit(0)
}

const server = createServer(db, process.env.PROBA_OUT ?? '.proba')
await server.connect(new StdioServerTransport())
console.error('[proba] MCP server ready on stdio')
