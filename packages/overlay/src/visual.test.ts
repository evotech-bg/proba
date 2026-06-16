import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { DimensionMismatchError, perceptualDiff, pixelDiff } from './visual'

function solid(w: number, h: number, rgba: [number, number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0]
    png.data[i + 1] = rgba[1]
    png.data[i + 2] = rgba[2]
    png.data[i + 3] = rgba[3]
  }
  return PNG.sync.write(png)
}

function withSpot(w: number, h: number): Buffer {
  const png = PNG.sync.read(solid(w, h, [255, 255, 255, 255]))
  // flip one pixel to black
  png.data[0] = 0
  png.data[1] = 0
  png.data[2] = 0
  return PNG.sync.write(png)
}

describe('pixelDiff', () => {
  it('reports zero diff for identical images', () => {
    const a = solid(10, 10, [255, 255, 255, 255])
    const r = pixelDiff(a, solid(10, 10, [255, 255, 255, 255]))
    expect(r.diffPixels).toBe(0)
    expect(r.pass).toBe(true)
  })

  it('counts changed pixels and respects tolerance', () => {
    const base = solid(10, 10, [255, 255, 255, 255])
    const changed = withSpot(10, 10)
    const strict = pixelDiff(base, changed)
    expect(strict.diffPixels).toBe(1)
    expect(strict.pass).toBe(false)
    const tolerant = pixelDiff(base, changed, { maxDiffPixels: 5 })
    expect(tolerant.pass).toBe(true)
  })

  it('throws on dimension mismatch (layout regression, not a pixel diff)', () => {
    expect(() => pixelDiff(solid(10, 10, [0, 0, 0, 255]), solid(12, 10, [0, 0, 0, 255]))).toThrow(
      DimensionMismatchError,
    )
  })
})

function halfBlack(w: number, h: number): Buffer {
  const png = PNG.sync.read(solid(w, h, [255, 255, 255, 255]))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w / 2; x++) {
      const i = (y * w + x) * 4
      png.data[i] = png.data[i + 1] = png.data[i + 2] = 0
    }
  }
  return PNG.sync.write(png)
}

describe('perceptualDiff (SSIM)', () => {
  it('scores identical images at 1.0 and passes', () => {
    const a = solid(16, 16, [200, 200, 200, 255])
    const r = perceptualDiff(a, solid(16, 16, [200, 200, 200, 255]))
    expect(r.ssim).toBeCloseTo(1, 5)
    expect(r.pass).toBe(true)
  })

  it('drops below 1 and fails for a structural change', () => {
    const r = perceptualDiff(solid(16, 16, [255, 255, 255, 255]), halfBlack(16, 16))
    expect(r.ssim).toBeLessThan(0.99)
    expect(r.pass).toBe(false)
  })
})
