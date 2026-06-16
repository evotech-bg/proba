/**
 * Projects → apps (two-level scope) helpers.
 *
 * A project is a client/workspace; an app is a surface within it (web, mobile, admin…).
 * Every scoped spine entity carries an `appKey` that points at an app; an app points at a project.
 * These helpers are pure (take a db) so both the dashboard and the MCP server share them.
 */
import { eq, isNull } from 'drizzle-orm'
import type { ProbaDb } from './client'
import {
  apps as appsT,
  knowledge as knowledgeT,
  projects as projectsT,
  requirements as requirementsT,
  sessions as sessionsT,
  suites as suitesT,
  tasks as tasksT,
  testCases as testCasesT,
} from './schema'

const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'app'

/** Create a project if its key is free; returns the key. Idempotent. */
export function ensureProject(
  db: ProbaDb,
  key: string,
  name?: string,
  description?: string,
): string {
  const existing = db.select().from(projectsT).where(eq(projectsT.key, key)).all()[0]
  if (existing) return existing.key
  db.insert(projectsT)
    .values({ key, name: name ?? key, description })
    .run()
  return key
}

/** Create an app under a project if its key is free; returns the key. Idempotent. */
export function ensureApp(
  db: ProbaDb,
  key: string,
  projectKey: string,
  name?: string,
  platform?: string,
): string {
  const existing = db.select().from(appsT).where(eq(appsT.key, key)).all()[0]
  if (existing) return existing.key
  db.insert(appsT)
    .values({ key, projectKey, name: name ?? key, platform })
    .run()
  return key
}

/**
 * One-time bootstrap: if no projects exist yet, derive them from whatever appKeys the data already
 * uses (sessions + knowledge), create a project+app for each, and backfill any unassigned spine rows
 * to the first app. Safe to call on every startup — it no-ops once projects exist.
 */
export function ensureProjectsBootstrap(db: ProbaDb): void {
  if (db.select().from(projectsT).all().length > 0) return

  const appKeys = new Set<string>()
  for (const s of db.select().from(sessionsT).all()) if (s.appKey) appKeys.add(s.appKey)
  for (const k of db.select().from(knowledgeT).all()) if (k.appKey) appKeys.add(k.appKey)
  if (appKeys.size === 0) appKeys.add('demo-shop')

  // group every discovered appKey under one starter project (clean default; renameable later)
  const projectKey = ensureProject(db, 'demo', 'Demo')
  let firstApp = ''
  for (const key of appKeys) {
    const name = key.replace(/^demo[-_]?/, '') || 'web'
    ensureApp(db, key, projectKey, name.charAt(0).toUpperCase() + name.slice(1))
    if (!firstApp) firstApp = key
  }

  // backfill unassigned spine rows to the first app so nothing is orphaned
  db.update(testCasesT).set({ appKey: firstApp }).where(isNull(testCasesT.appKey)).run()
  db.update(suitesT).set({ appKey: firstApp }).where(isNull(suitesT.appKey)).run()
  db.update(requirementsT).set({ appKey: firstApp }).where(isNull(requirementsT.appKey)).run()
  db.update(tasksT).set({ appKey: firstApp }).where(isNull(tasksT.appKey)).run()
}

export { slug as slugify }
