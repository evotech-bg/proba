import type { Locator } from '@proba/locator'

export type Verdict = 'passed' | 'failed' | 'blocked'

/** Canonical in-memory step the executors consume (DB rows in @proba/store mirror this). */
export interface StepSpec {
  kind: 'web' | 'api' | 'db'
  action: string
  target?: Locator
  params?: Record<string, unknown>
  assertions?: AssertionSpec[]
  description?: string
}

export type AssertionSpec =
  | { type: 'http'; status?: number; statusClass?: '2xx' | '3xx' | '4xx' | '5xx' }
  | { type: 'schema'; schema: Record<string, unknown> }
  | { type: 'sla'; maxMs: number }
  | { type: 'body'; path: string; equals?: unknown; contains?: string }
  | { type: 'dom'; toContainText?: string; visible?: boolean }
  | { type: 'db_row'; minRows?: number; maxRows?: number; equals?: Record<string, unknown> }
  // snapshot assertions: first run establishes a baseline (passes), later runs compare against it
  | { type: 'visual'; name?: string; maxDiffPixelRatio?: number }
  | { type: 'snapshot'; name?: string; ignoreWhitespace?: boolean }

export interface StepResult {
  verdict: Verdict
  durationMs: number
  message?: string
  data?: unknown
}
