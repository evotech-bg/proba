import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { applyMutation, getAppConfig, getImportedTests, getSettings, getSnapshot, getSystemInfo } from '../server/db.server'

/** Full dashboard snapshot from the real SQLite store. */
export const fetchSnapshot = createServerFn({ method: 'GET' }).handler(async () => getSnapshot())

/** Real workbench status (db path, counts, node version). */
export const fetchSystemInfo = createServerFn({ method: 'GET' }).handler(async () => getSystemInfo())

/** Persisted workbench preferences, merged over defaults. */
export const fetchSettings = createServerFn({ method: 'GET' }).handler(async () => getSettings())

/** Read-only listing of existing test files from the configured importDir. */
export const fetchImportedTests = createServerFn({ method: 'GET' }).handler(async () => getImportedTests())

/** Per-app test accounts + variables (secret values masked). */
export const fetchAppConfig = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ appKey: z.string() }))
  .handler(async ({ data }) => getAppConfig(data.appKey))

/** One dispatcher for every write (mirrors the store actions). */
export const mutate = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ op: z.string(), args: z.record(z.any()).default({}) }))
  .handler(async ({ data }) => {
    applyMutation(data.op, data.args)
    return { ok: true }
  })
