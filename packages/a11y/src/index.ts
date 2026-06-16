/**
 * @proba/a11y — accessibility scanning via axe-core (the engine inside Lighthouse/DevTools).
 *
 * Honest about limits: automation reliably catches ~30% of WCAG 2.2 (contrast, names/roles,
 * labels, alt text). Judgment calls — focus/tab order, meaningful sequence — axe won't flag;
 * we surface them as `needsManualReview` so they aren't mistaken for "all clear".
 */
import { createRequire } from 'node:module'
import type { Page } from 'playwright'

const require = createRequire(import.meta.url)
const AXE_PATH = require.resolve('axe-core/axe.min.js')

/** WCAG tag sets axe understands. */
export type WcagTag = 'wcag2a' | 'wcag2aa' | 'wcag21a' | 'wcag21aa' | 'wcag22aa' | 'best-practice'

export interface A11yOptions {
  tags?: WcagTag[]
  include?: string[]
  exclude?: string[]
}

export interface A11yViolation {
  id: string
  impact: string | null
  help: string
  nodes: number
  targets: string[]
}

export interface A11yReport {
  violations: A11yViolation[]
  passes: number
  needsManualReview: string[]
}

/** What automated a11y cannot decide — must be checked by a human. */
export const MANUAL_REVIEW_NOTES = [
  'Logical focus / tab order (axe will not flag illogical sequence)',
  'Meaningful reading order of content',
  'Appropriateness of alt text (presence is checked, meaning is not)',
  'Keyboard operability of custom widgets end-to-end',
]

export async function runAxe(page: Page, opts: A11yOptions = {}): Promise<A11yReport> {
  await page.addScriptTag({ path: AXE_PATH })
  const tags = opts.tags ?? ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
  const raw = await page.evaluate(
    async ({ tags, include, exclude }) => {
      const ctx =
        include || exclude
          ? { include: include?.map((s) => [s]), exclude: exclude?.map((s) => [s]) }
          : undefined
      // axe is injected on window by addScriptTag
      // biome-ignore lint/suspicious/noExplicitAny: injected global
      const axe = (window as any).axe
      const res = await axe.run(ctx ?? document, { runOnly: { type: 'tag', values: tags } })
      return {
        passes: res.passes.length,
        violations: res.violations.map((v: Record<string, unknown>) => ({
          id: v.id,
          impact: v.impact ?? null,
          help: v.help,
          nodes: (v.nodes as unknown[]).length,
          targets: (v.nodes as { target: string[] }[]).flatMap((n) => n.target),
        })),
      }
    },
    { tags, include: opts.include, exclude: opts.exclude },
  )
  return { ...raw, needsManualReview: MANUAL_REVIEW_NOTES }
}
