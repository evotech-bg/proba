/**
 * Visual diffing. Pixel-diff today (Pixelmatch in YIQ space); DOM-aware geometry checks live in
 * geometry.ts; perceptual-AI diff is a later layer. Tolerance is tunable per the research:
 * maxDiffPixels (absolute) / maxDiffPixelRatio (fraction) / threshold (per-pixel YIQ sensitivity).
 */
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface DiffOptions {
  /** per-pixel color sensitivity 0..1 (Pixelmatch default 0.1; we default 0.2 like Playwright) */
  threshold?: number
  maxDiffPixels?: number
  maxDiffPixelRatio?: number
  /** ignore antialiasing differences (default true) */
  includeAA?: boolean
}

export interface DiffResult {
  width: number
  height: number
  diffPixels: number
  ratio: number
  pass: boolean
  /** PNG buffer highlighting the differing pixels (for the dashboard diff viewer) */
  diffImage: Buffer
}

export class DimensionMismatchError extends Error {}

/** Compare two PNG buffers. Throws if dimensions differ (resize/layout regression, not a pixel diff). */
export function pixelDiff(baseline: Buffer, actual: Buffer, opts: DiffOptions = {}): DiffResult {
  const a = PNG.sync.read(baseline)
  const b = PNG.sync.read(actual)
  if (a.width !== b.width || a.height !== b.height) {
    throw new DimensionMismatchError(
      `dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    )
  }
  const { width, height } = a
  const diff = new PNG({ width, height })
  const diffPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: opts.threshold ?? 0.2,
    includeAA: opts.includeAA ?? false,
  })
  const ratio = diffPixels / (width * height)
  const pass =
    (opts.maxDiffPixels == null || diffPixels <= opts.maxDiffPixels) &&
    (opts.maxDiffPixelRatio == null || ratio <= opts.maxDiffPixelRatio) &&
    (opts.maxDiffPixels == null && opts.maxDiffPixelRatio == null ? diffPixels === 0 : true)
  return { width, height, diffPixels, ratio, pass, diffImage: PNG.sync.write(diff) }
}

// ── perceptual (structural) diff ──────────────────────────────────────────────
// Mean SSIM over 8×8 windows on luma. This is *structural* similarity (not a vendor AI model):
// it tolerates uniform brightness/noise shifts that pixel-diff over-reports, while still catching
// real structural change. Score 1.0 = identical.
const luma = (d: Buffer | Uint8Array, i: number) =>
  0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!

export interface SsimResult {
  ssim: number
  pass: boolean
}

export function perceptualDiff(
  baseline: Buffer,
  actual: Buffer,
  opts: { minSsim?: number } = {},
): SsimResult {
  const a = PNG.sync.read(baseline)
  const b = PNG.sync.read(actual)
  if (a.width !== b.width || a.height !== b.height) {
    throw new DimensionMismatchError(
      `dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    )
  }
  const { width, height } = a
  const C1 = (0.01 * 255) ** 2
  const C2 = (0.03 * 255) ** 2
  const win = 8
  let total = 0
  let blocks = 0
  for (let by = 0; by + win <= height; by += win) {
    for (let bx = 0; bx + win <= width; bx += win) {
      let sumX = 0,
        sumY = 0,
        sumXX = 0,
        sumYY = 0,
        sumXY = 0
      for (let y = 0; y < win; y++) {
        for (let x = 0; x < win; x++) {
          const idx = ((by + y) * width + (bx + x)) * 4
          const vx = luma(a.data, idx)
          const vy = luma(b.data, idx)
          sumX += vx
          sumY += vy
          sumXX += vx * vx
          sumYY += vy * vy
          sumXY += vx * vy
        }
      }
      const n = win * win
      const muX = sumX / n,
        muY = sumY / n
      const varX = sumXX / n - muX * muX
      const varY = sumYY / n - muY * muY
      const cov = sumXY / n - muX * muY
      const s =
        ((2 * muX * muY + C1) * (2 * cov + C2)) /
        ((muX * muX + muY * muY + C1) * (varX + varY + C2))
      total += s
      blocks++
    }
  }
  const ssim = blocks === 0 ? 1 : total / blocks
  return { ssim, pass: ssim >= (opts.minSsim ?? 0.99) }
}
