/// <reference path="./pixelmatch.d.ts" />
export * from './geometry'
export {
  pixelDiff,
  perceptualDiff,
  DimensionMismatchError,
  type DiffOptions,
  type DiffResult,
  type SsimResult,
} from './visual'
export { collectBoxes, layoutAudit, type LayoutAudit } from './page'
