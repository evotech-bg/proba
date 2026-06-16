import { defineConfig } from 'drizzle-kit'

// Proba's own store is always SQLite (the default, local-first task/artifact DB).
// The *dialect-honest DB adapter* for testing target apps lives in @proba/engine, not here.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: { url: process.env.PROBA_DB ?? '.proba/proba.db' },
})
