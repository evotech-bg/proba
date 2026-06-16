/**
 * Pure layout geometry analysis — "the screenshot lies".
 *
 * Pixel diffs pass on UIs that are functionally broken (overlapping click targets, collapsed
 * elements, truncated text). These checks operate on getBoundingClientRect + scroll/client sizes
 * and computed visibility, catching what pixels can't. All pure → fully unit-testable.
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ElementBox {
  name: string
  rect: Rect
  scrollWidth?: number
  clientWidth?: number
  visible?: boolean
  opacity?: number
}

export const right = (r: Rect) => r.x + r.width
export const bottom = (r: Rect) => r.y + r.height

/** Do two rects overlap (beyond an allowed tolerance in px)? */
export function overlaps(a: Rect, b: Rect, tol = 0): boolean {
  return !(
    right(a) - tol <= b.x ||
    right(b) - tol <= a.x ||
    bottom(a) - tol <= b.y ||
    bottom(b) - tol <= a.y
  )
}

export interface OverlapFinding {
  a: string
  b: string
}

/** Elements that visually overlap (e.g. an invisible layer covering a button). */
export function findOverlaps(boxes: ElementBox[], tol = 1): OverlapFinding[] {
  const out: OverlapFinding[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      if (overlaps(a.rect, b.rect, tol)) out.push({ a: a.name, b: b.name })
    }
  }
  return out
}

/** Collapsed / zero-area "ghost" elements. */
export function findZeroDimension(boxes: ElementBox[]): string[] {
  return boxes.filter((b) => b.rect.width <= 0 || b.rect.height <= 0).map((b) => b.name)
}

/** Text/content truncation (content wider than its box). */
export function findTruncated(boxes: ElementBox[]): string[] {
  return boxes
    .filter(
      (b) => b.scrollWidth != null && b.clientWidth != null && b.scrollWidth > b.clientWidth + 1,
    )
    .map((b) => b.name)
}

/** Elements that are present but not clickable (zero opacity / not visible). */
export function findNonClickable(boxes: ElementBox[]): string[] {
  return boxes
    .filter((b) => b.visible === false || (b.opacity != null && b.opacity === 0))
    .map((b) => b.name)
}

export type Edge = 'left' | 'top' | 'right' | 'bottom'

const edgeValue = (r: Rect, e: Edge) =>
  e === 'left' ? r.x : e === 'top' ? r.y : e === 'right' ? right(r) : bottom(r)

/**
 * Group boxes that *should* share an edge. Returns the dominant aligned group and the outliers
 * (within tolerance) — outliers are likely misalignment bugs.
 */
export function alignmentReport(boxes: ElementBox[], edge: Edge, tol = 1) {
  const values = boxes.map((b) => ({ name: b.name, v: edgeValue(b.rect, edge) }))
  const clusters: { v: number; names: string[] }[] = []
  for (const { name, v } of values) {
    const c = clusters.find((c) => Math.abs(c.v - v) <= tol)
    if (c) c.names.push(name)
    else clusters.push({ v, names: [name] })
  }
  clusters.sort((a, b) => b.names.length - a.names.length)
  const aligned = clusters[0]?.names ?? []
  const outliers = clusters.slice(1).flatMap((c) => c.names)
  return { edge, aligned, outliers }
}

/** Gaps between vertically-stacked boxes; flags inconsistent spacing. */
export function spacingReport(boxes: ElementBox[], tol = 1) {
  const sorted = [...boxes].sort((a, b) => a.rect.y - b.rect.y)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(Math.round(sorted[i]!.rect.y - bottom(sorted[i - 1]!.rect)))
  }
  const consistent = gaps.every((g) => Math.abs(g - (gaps[0] ?? 0)) <= tol)
  return { gaps, consistent }
}
