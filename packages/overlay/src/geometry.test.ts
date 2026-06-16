import { describe, expect, it } from 'vitest'
import {
  type ElementBox,
  alignmentReport,
  findNonClickable,
  findOverlaps,
  findTruncated,
  findZeroDimension,
  overlaps,
  spacingReport,
} from './geometry'

const box = (
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<ElementBox> = {},
): ElementBox => ({
  name,
  rect: { x, y, width: w, height: h },
  ...extra,
})

describe('overlaps', () => {
  it('detects overlap and separation', () => {
    expect(
      overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }),
    ).toBe(true)
    expect(
      overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 10, height: 10 }),
    ).toBe(false)
  })
})

describe('findOverlaps', () => {
  it('flags an invisible layer covering a button', () => {
    const found = findOverlaps([box('button', 0, 0, 100, 40), box('overlay', 10, 10, 50, 20)])
    expect(found).toEqual([{ a: 'button', b: 'overlay' }])
  })
})

describe('findZeroDimension / findTruncated / findNonClickable', () => {
  it('catches collapsed, truncated and uninteractable elements', () => {
    expect(findZeroDimension([box('ghost', 0, 0, 0, 20)])).toEqual(['ghost'])
    expect(
      findTruncated([box('label', 0, 0, 50, 20, { scrollWidth: 120, clientWidth: 50 })]),
    ).toEqual(['label'])
    expect(findNonClickable([box('hidden', 0, 0, 10, 10, { opacity: 0 })])).toEqual(['hidden'])
  })
})

describe('alignmentReport', () => {
  it('finds the aligned group and the misaligned outlier', () => {
    const r = alignmentReport(
      [box('a', 10, 0, 5, 5), box('b', 10, 20, 5, 5), box('c', 37, 40, 5, 5)],
      'left',
    )
    expect(r.aligned).toEqual(['a', 'b'])
    expect(r.outliers).toEqual(['c'])
  })
})

describe('spacingReport', () => {
  it('flags inconsistent vertical gaps', () => {
    const even = spacingReport([
      box('a', 0, 0, 10, 10),
      box('b', 0, 20, 10, 10),
      box('c', 0, 40, 10, 10),
    ])
    expect(even.consistent).toBe(true)
    const uneven = spacingReport([
      box('a', 0, 0, 10, 10),
      box('b', 0, 20, 10, 10),
      box('c', 0, 55, 10, 10),
    ])
    expect(uneven.consistent).toBe(false)
  })
})
