/**
 * @proba/locator — stable-locator discipline.
 *
 * Enforces Playwright's priority order by construction:
 *   role → text/label/placeholder/alt/title → data-testid → (forbidden) positional css/xpath.
 *
 * Positional selectors (nth-child, deep descendant chains, absolute xpath, bare indexes) are the
 * #1 reason recorded tests rot — ~70% break on dynamic pages. We reject them at emit time.
 */

export type LocatorStrategy =
  | 'role'
  | 'label'
  | 'placeholder'
  | 'text'
  | 'altText'
  | 'title'
  | 'testId'
  | 'css'

/** Priority: lower index = more stable / preferred. */
export const STRATEGY_PRIORITY: LocatorStrategy[] = [
  'role',
  'label',
  'placeholder',
  'text',
  'altText',
  'title',
  'testId',
  'css',
]

export interface Locator {
  strategy: LocatorStrategy
  value: string
  /** accessible name (role) or matcher text */
  name?: string
  exact?: boolean
}

/** Raw signals observed for a single element while recording. */
export interface ElementSignals {
  role?: string
  accessibleName?: string
  label?: string
  placeholder?: string
  text?: string
  altText?: string
  title?: string
  testId?: string
  /** last-resort css; only used if nothing else and not positional */
  css?: string
}

// ── positional / brittle detection ───────────────────────────────────────────
const POSITIONAL_CSS = [
  /:nth-child\(/i,
  /:nth-of-type\(/i,
  /:first-child/i,
  /:last-child/i,
  />\s*\w+\s*>\s*\w+\s*>/, // deep descendant chains (3+ combinators)
]

/** True if a css/xpath selector is positional/structural and therefore brittle. */
export function isPositional(selector: string): boolean {
  const s = selector.trim()
  if (s.startsWith('/') || s.startsWith('(/') || s.toLowerCase().startsWith('xpath=')) return true
  if (/\[\d+\]/.test(s)) return true // bare index, e.g. div[2]
  return POSITIONAL_CSS.some((re) => re.test(s))
}

export class BrittleLocatorError extends Error {
  constructor(public readonly locator: Locator) {
    super(
      `Refusing brittle locator (${locator.strategy}: "${locator.value}"). ` +
        'Positional css/xpath breaks on DOM change — prefer role → text/label → data-testid.',
    )
    this.name = 'BrittleLocatorError'
  }
}

/** Throws BrittleLocatorError if the locator is positional/forbidden. */
export function assertStable(locator: Locator): void {
  if (locator.strategy === 'css' && isPositional(locator.value)) {
    throw new BrittleLocatorError(locator)
  }
}

/**
 * Pick the most stable locator from observed signals, following the priority order.
 * Returns null only when nothing usable (and css is positional) exists.
 */
export function fromSignals(signals: ElementSignals): Locator | null {
  if (signals.role && signals.accessibleName) {
    return { strategy: 'role', value: signals.role, name: signals.accessibleName }
  }
  if (signals.label) return { strategy: 'label', value: signals.label }
  if (signals.placeholder) return { strategy: 'placeholder', value: signals.placeholder }
  if (signals.text) return { strategy: 'text', value: signals.text }
  if (signals.altText) return { strategy: 'altText', value: signals.altText }
  if (signals.title) return { strategy: 'title', value: signals.title }
  if (signals.testId) return { strategy: 'testId', value: signals.testId }
  if (signals.role) return { strategy: 'role', value: signals.role } // role w/o name, still stable-ish
  if (signals.css && !isPositional(signals.css)) return { strategy: 'css', value: signals.css }
  return null
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** Render a canonical locator to a Playwright expression on `page`. */
export function toPlaywright(locator: Locator, root = 'page'): string {
  assertStable(locator)
  const exact = locator.exact ? ', exact: true' : ''
  switch (locator.strategy) {
    case 'role':
      return locator.name
        ? `${root}.getByRole(${q(locator.value)}, { name: ${q(locator.name)}${exact} })`
        : `${root}.getByRole(${q(locator.value)})`
    case 'label':
      return `${root}.getByLabel(${q(locator.value)}${locator.exact ? ', { exact: true }' : ''})`
    case 'placeholder':
      return `${root}.getByPlaceholder(${q(locator.value)})`
    case 'text':
      return `${root}.getByText(${q(locator.value)}${locator.exact ? ', { exact: true }' : ''})`
    case 'altText':
      return `${root}.getByAltText(${q(locator.value)})`
    case 'title':
      return `${root}.getByTitle(${q(locator.value)})`
    case 'testId':
      return `${root}.getByTestId(${q(locator.value)})`
    case 'css':
      return `${root}.locator(${q(locator.value)})`
  }
}

/** Stability score 0..1 (1 = most stable). Useful for ranking / healing transparency. */
export function stabilityScore(locator: Locator): number {
  const idx = STRATEGY_PRIORITY.indexOf(locator.strategy)
  if (locator.strategy === 'css' && isPositional(locator.value)) return 0
  return 1 - idx / STRATEGY_PRIORITY.length
}
