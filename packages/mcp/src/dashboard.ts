/**
 * Launch the Proba dashboard from the MCP server.
 *
 * Finds the workspace root, starts the dashboard dev server (detached) against the same store,
 * and returns its URL. If the port is already serving, it just returns the URL — no double-spawn.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PORT = 8080

/** Walk up from a starting dir until we find one that contains apps/dashboard. */
function findRepoRoot(start: string): string | undefined {
  let dir = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'apps', 'dashboard', 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

async function isUp(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 800)
    await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    return true
  } catch {
    return false
  }
}

export interface OpenDashboardResult {
  url: string
  started: boolean
  alreadyRunning: boolean
  note?: string
}

export async function openDashboard(
  opts: { port?: number; openBrowser?: boolean; dbPath?: string } = {},
): Promise<OpenDashboardResult> {
  const port = opts.port ?? DEFAULT_PORT
  const url = `http://localhost:${port}/`

  if (await isUp(url)) {
    if (opts.openBrowser) tryOpenBrowser(url)
    return { url, started: false, alreadyRunning: true }
  }

  const here = dirname(fileURLToPath(import.meta.url))
  const root = findRepoRoot(here) ?? findRepoRoot(process.cwd())
  if (!root) {
    return {
      url,
      started: false,
      alreadyRunning: false,
      note: 'Could not locate the workspace (apps/dashboard). Start it manually: pnpm --filter @proba/dashboard dev',
    }
  }

  const child = spawn('pnpm', ['--filter', '@proba/dashboard', 'dev'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ...(opts.dbPath ? { PROBA_DB: opts.dbPath } : {}) },
  })
  child.unref()

  if (opts.openBrowser) tryOpenBrowser(url)
  return {
    url,
    started: true,
    alreadyRunning: false,
    note: 'Dashboard starting — it may take a few seconds to come up.',
  }
}

function tryOpenBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    /* best-effort */
  }
}
