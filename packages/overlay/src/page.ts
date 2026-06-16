/**
 * Browser-side collectors: gather real geometry from a live page so the pure analyzers in
 * geometry.ts can run. Uses getBoundingClientRect + scroll/client sizes + computed visibility.
 */
import type { Page } from 'playwright'
import {
  type ElementBox,
  alignmentReport,
  findNonClickable,
  findOverlaps,
  findTruncated,
  findZeroDimension,
} from './geometry'

/** Collect boxes for a set of CSS selectors (named by the selector unless overridden). */
export async function collectBoxes(page: Page, selectors: string[]): Promise<ElementBox[]> {
  return page.evaluate((sels) => {
    const out: ElementBox[] = []
    for (const sel of sels) {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) continue
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      out.push({
        name: sel,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        visible: cs.visibility !== 'hidden' && cs.display !== 'none',
        opacity: Number.parseFloat(cs.opacity),
      })
    }
    return out
  }, selectors)
}

export interface LayoutAudit {
  overlaps: { a: string; b: string }[]
  zeroDimension: string[]
  truncated: string[]
  nonClickable: string[]
}

/** Run the full geometry audit against a live page. */
export async function layoutAudit(page: Page, selectors: string[]): Promise<LayoutAudit> {
  const boxes = await collectBoxes(page, selectors)
  return {
    overlaps: findOverlaps(boxes),
    zeroDimension: findZeroDimension(boxes),
    truncated: findTruncated(boxes),
    nonClickable: findNonClickable(boxes),
  }
}

export { alignmentReport }
