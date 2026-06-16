import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { assertStable, type Locator as ProbaLocator } from '@proba/locator'
import { pixelDiff } from '@proba/overlay'
import { type Browser, type Locator as PwLocator, type Page, chromium } from 'playwright'
import type { StepResult, StepSpec } from './types'

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'snapshot'

/** index of the first differing character between two strings (for a readable drift message) */
function firstDiffIndex(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return n
}

/** Map a canonical Proba locator to a live Playwright locator (priority-honest, brittle-rejecting). */
export function resolveLocator(page: Page, loc: ProbaLocator): PwLocator {
  assertStable(loc)
  switch (loc.strategy) {
    case 'role':
      return loc.name
        ? page.getByRole(loc.value as Parameters<Page['getByRole']>[0], {
            name: loc.name,
            exact: loc.exact,
          })
        : page.getByRole(loc.value as Parameters<Page['getByRole']>[0])
    case 'label':
      return page.getByLabel(loc.value, { exact: loc.exact })
    case 'placeholder':
      return page.getByPlaceholder(loc.value)
    case 'text':
      return page.getByText(loc.value, { exact: loc.exact })
    case 'altText':
      return page.getByAltText(loc.value)
    case 'title':
      return page.getByTitle(loc.value)
    case 'testId':
      return page.getByTestId(loc.value)
    case 'css':
      return page.locator(loc.value)
  }
}

export interface WebSessionOptions {
  headless?: boolean
  baseURL?: string
  /** where visual/text snapshot baselines are stored (default '.proba/snapshots') */
  snapshotDir?: string
  /** if set, record a video of the session into this dir (kept by the caller only on failure) */
  recordVideoDir?: string
}

export interface ConsoleEntry {
  type: string
  text: string
}
export interface NetworkEntry {
  method: string
  url: string
  status: number
  ok: boolean
}

/** A live browser session. Each MCP `act` runs through `execute`. */
export class WebSession {
  /** Captured during the session for evidence (console errors + failed requests). */
  readonly consoleLog: ConsoleEntry[] = []
  readonly networkLog: NetworkEntry[] = []

  private constructor(
    private readonly browser: Browser,
    readonly page: Page,
    private readonly snapshotDir: string = '.proba/snapshots',
  ) {}

  static async launch(opts: WebSessionOptions = {}): Promise<WebSession> {
    const browser = await chromium.launch({ headless: opts.headless ?? true })
    const context = await browser.newContext({
      baseURL: opts.baseURL,
      ...(opts.recordVideoDir ? { recordVideo: { dir: opts.recordVideoDir } } : {}),
    })
    const page = await context.newPage()
    const session = new WebSession(browser, page, opts.snapshotDir)
    page.on('console', (m) => {
      const type = m.type()
      if (type === 'error' || type === 'warning')
        session.consoleLog.push({ type, text: m.text().slice(0, 500) })
    })
    page.on('pageerror', (e) =>
      session.consoleLog.push({ type: 'error', text: String(e).slice(0, 500) }),
    )
    page.on('response', (r) => {
      const status = r.status()
      // record only failures (>=400) to keep the evidence log focused
      if (status >= 400)
        session.networkLog.push({
          method: r.request().method(),
          url: r.url().slice(0, 300),
          status,
          ok: false,
        })
    })
    return session
  }

  async execute(step: StepSpec): Promise<StepResult> {
    const started = performance.now()
    try {
      const p = step.params ?? {}
      switch (step.action) {
        case 'navigate':
          await this.page.goto(String(p.url))
          break
        case 'click':
          await resolveLocator(this.page, step.target!).click()
          break
        case 'fill':
          await resolveLocator(this.page, step.target!).fill(String(p.text ?? ''))
          break
        case 'select':
          await resolveLocator(this.page, step.target!).selectOption(String(p.value))
          break
        case 'check':
          await resolveLocator(this.page, step.target!).check()
          break
        case 'wait':
          await this.page.waitForLoadState('networkidle')
          break
        case 'expect':
          return await this.checkDom(step, started)
        default:
          return {
            verdict: 'blocked',
            durationMs: 0,
            message: `unknown web action: ${step.action}`,
          }
      }
      return { verdict: 'passed', durationMs: performance.now() - started }
    } catch (e) {
      return { verdict: 'failed', durationMs: performance.now() - started, message: String(e) }
    }
  }

  private async checkDom(step: StepSpec, started: number): Promise<StepResult> {
    const fails: string[] = []
    for (const a of step.assertions ?? []) {
      if (a.type === 'dom') {
        const loc = resolveLocator(this.page, step.target!)
        if (a.visible === true && !(await loc.isVisible())) fails.push('not visible')
        if (a.toContainText) {
          const txt = (await loc.textContent()) ?? ''
          if (!txt.includes(a.toContainText)) fails.push(`text lacks "${a.toContainText}"`)
        }
      } else if (a.type === 'snapshot') {
        const fail = await this.checkTextSnapshot(step, a)
        if (fail) fails.push(fail)
      } else if (a.type === 'visual') {
        const fail = await this.checkVisualSnapshot(step, a)
        if (fail) fails.push(fail)
      }
    }
    return {
      verdict: fails.length ? 'failed' : 'passed',
      durationMs: performance.now() - started,
      message: fails.length ? fails.join('; ') : undefined,
    }
  }

  /** name → baseline file path under the snapshot dir */
  private snapPath(name: string, ext: string): string {
    return join(this.snapshotDir, `${slug(name)}.${ext}`)
  }

  /** DOM/text snapshot: serialize the target's text, store on first run, compare after. */
  private async checkTextSnapshot(
    step: StepSpec,
    a: { name?: string; ignoreWhitespace?: boolean },
  ): Promise<string | undefined> {
    const name =
      a.name ?? step.description ?? (step.target ? String(step.target.value) : 'snapshot')
    const raw = step.target
      ? ((await resolveLocator(this.page, step.target).textContent()) ?? '')
      : ((await this.page.textContent('body')) ?? '')
    const norm = a.ignoreWhitespace === false ? raw : raw.replace(/\s+/g, ' ').trim()
    const file = this.snapPath(name, 'snap.txt')
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, norm)
      return undefined // first run establishes the baseline
    }
    const baseline = readFileSync(file, 'utf8')
    if (baseline !== norm) {
      const at = firstDiffIndex(baseline, norm)
      return `snapshot "${name}" drifted near "…${norm.slice(Math.max(0, at - 15), at + 15)}…"`
    }
    return undefined
  }

  /** Visual snapshot: screenshot the target (or page), store on first run, pixel-diff after. */
  private async checkVisualSnapshot(
    step: StepSpec,
    a: { name?: string; maxDiffPixelRatio?: number },
  ): Promise<string | undefined> {
    const name = a.name ?? step.description ?? (step.target ? String(step.target.value) : 'visual')
    const shot = step.target
      ? await resolveLocator(this.page, step.target).screenshot()
      : await this.page.screenshot({ fullPage: true })
    const file = this.snapPath(name, 'png')
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, shot)
      return undefined // first run establishes the baseline
    }
    try {
      const r = pixelDiff(readFileSync(file), shot, {
        maxDiffPixelRatio: a.maxDiffPixelRatio ?? 0.01,
      })
      if (!r.pass)
        return `visual "${name}" differs: ${r.diffPixels} px (${(r.ratio * 100).toFixed(2)}%)`
    } catch {
      return `visual "${name}" dimensions changed since the baseline`
    }
    return undefined
  }

  async screenshot(path: string): Promise<string> {
    await this.page.screenshot({ path, fullPage: true })
    return path
  }

  async setContent(html: string): Promise<void> {
    await this.page.setContent(html)
  }

  /**
   * Close the session. If video was being recorded, returns the finalized video file path
   * (the file is only written once the context closes), else undefined.
   */
  async close(): Promise<string | undefined> {
    const video = this.page.video()
    await this.browser.close()
    if (!video) return undefined
    try {
      return await video.path()
    } catch {
      return undefined
    }
  }
}
