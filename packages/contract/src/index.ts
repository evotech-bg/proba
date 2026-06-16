/**
 * @proba/contract — lightweight consumer-driven contract testing (Pact-style, no external broker).
 *
 * The consumer records interactions (request → expected response). The contract uses *loose*
 * shape matching for responses (types/structure, not exact values) so a provider can change data
 * without breaking the contract, but breaks if it drops/retypes a field the consumer relies on.
 */
export interface Interaction {
  description: string
  request: { method?: string; path: string; headers?: Record<string, string>; body?: unknown }
  response: { status: number; body?: unknown }
}

export interface Contract {
  consumer: string
  provider: string
  interactions: Interaction[]
}

export function generateContract(
  consumer: string,
  provider: string,
  interactions: Interaction[],
): Contract {
  return { consumer, provider, interactions }
}

/** Loose shape match: structure + types of `expected` must be present in `actual` (extra keys ok). */
export function matchShape(expected: unknown, actual: unknown, path = '$'): string[] {
  const fails: string[] = []
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}: expected array, got ${typeof actual}`]
    if (expected.length > 0)
      actual.forEach((el, i) => fails.push(...matchShape(expected[0], el, `${path}[${i}]`)))
    return fails
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual))
      return [`${path}: expected object, got ${Array.isArray(actual) ? 'array' : typeof actual}`]
    for (const [k, v] of Object.entries(expected)) {
      if (!(k in (actual as Record<string, unknown>))) fails.push(`${path}.${k}: missing`)
      else fails.push(...matchShape(v, (actual as Record<string, unknown>)[k], `${path}.${k}`))
    }
    return fails
  }
  if (expected === null)
    return actual === null ? [] : [`${path}: expected null, got ${typeof actual}`]
  if (typeof expected !== typeof actual)
    fails.push(`${path}: expected ${typeof expected}, got ${typeof actual}`)
  return fails
}

export interface VerifyResult {
  description: string
  ok: boolean
  status: number
  mismatches: string[]
}

/** Verify a provider satisfies the contract by replaying each interaction. */
export async function verifyProvider(
  contract: Contract,
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; results: VerifyResult[] }> {
  const results: VerifyResult[] = []
  for (const ix of contract.interactions) {
    const res = await fetchImpl(`${baseUrl}${ix.request.path}`, {
      method: ix.request.method ?? 'GET',
      headers: ix.request.headers,
      body: ix.request.body == null ? undefined : JSON.stringify(ix.request.body),
    })
    const mismatches: string[] = []
    if (res.status !== ix.response.status)
      mismatches.push(`status ${res.status} ≠ ${ix.response.status}`)
    if (ix.response.body !== undefined) {
      let actual: unknown
      try {
        actual = await res.json()
      } catch {
        actual = await res.text()
      }
      mismatches.push(...matchShape(ix.response.body, actual))
    }
    results.push({
      description: ix.description,
      ok: mismatches.length === 0,
      status: res.status,
      mismatches,
    })
  }
  return { ok: results.every((r) => r.ok), results }
}
