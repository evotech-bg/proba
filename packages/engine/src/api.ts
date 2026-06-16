import type { AssertionSpec, StepResult, StepSpec } from './types'

export interface ApiRequest {
  method?: string
  url: string
  headers?: Record<string, string>
  body?: unknown
}

/** Minimal but real JSON-schema subset: type, required, properties (recursive). */
export function validateSchema(value: unknown, schema: Record<string, unknown>): string[] {
  const errors: string[] = []
  const check = (val: unknown, sch: Record<string, unknown>, path: string) => {
    const t = sch.type as string | undefined
    if (t) {
      const actual = Array.isArray(val) ? 'array' : val === null ? 'null' : typeof val
      const ok = t === 'integer' ? Number.isInteger(val) : actual === t
      if (!ok) errors.push(`${path || '$'}: expected ${t}, got ${actual}`)
    }
    if (t === 'object' && val && typeof val === 'object') {
      const props = (sch.properties as Record<string, Record<string, unknown>>) ?? {}
      for (const req of (sch.required as string[]) ?? []) {
        if (!(req in (val as object))) errors.push(`${path || '$'}: missing required "${req}"`)
      }
      for (const [k, sub] of Object.entries(props)) {
        if (k in (val as Record<string, unknown>)) {
          check((val as Record<string, unknown>)[k], sub, `${path}.${k}`)
        }
      }
    }
    if (t === 'array' && Array.isArray(val) && sch.items) {
      val.forEach((item, i) => check(item, sch.items as Record<string, unknown>, `${path}[${i}]`))
    }
  }
  check(value, schema, '')
  return errors
}

function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]), obj)
}

/** Execute an API step: request + layered assertions (status → schema → body → sla). */
export async function executeApi(
  step: StepSpec,
  fetchImpl: typeof fetch = fetch,
): Promise<StepResult> {
  const req = step.params as unknown as ApiRequest
  const started = performance.now()
  let res: Response
  try {
    res = await fetchImpl(req.url, {
      method: req.method ?? 'GET',
      headers: req.headers,
      body: req.body == null ? undefined : JSON.stringify(req.body),
    })
  } catch (e) {
    return {
      verdict: 'blocked',
      durationMs: performance.now() - started,
      message: `request failed: ${e}`,
    }
  }
  const durationMs = performance.now() - started
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }

  const fails = checkAssertions(step.assertions ?? [], { res, json, durationMs })
  return {
    verdict: fails.length ? 'failed' : 'passed',
    durationMs,
    message: fails.length ? fails.join('; ') : undefined,
    data: { status: res.status, body: json },
  }
}

function checkAssertions(
  assertions: AssertionSpec[],
  ctx: { res: Response; json: unknown; durationMs: number },
): string[] {
  const fails: string[] = []
  for (const a of assertions) {
    switch (a.type) {
      case 'http':
        if (a.status != null && ctx.res.status !== a.status)
          fails.push(`status ${ctx.res.status} ≠ ${a.status}`)
        if (a.statusClass && `${Math.floor(ctx.res.status / 100)}xx` !== a.statusClass)
          fails.push(`status ${ctx.res.status} not ${a.statusClass}`)
        break
      case 'schema': {
        const errs = validateSchema(ctx.json, a.schema)
        if (errs.length) fails.push(...errs)
        break
      }
      case 'sla':
        if (ctx.durationMs > a.maxMs)
          fails.push(`sla ${ctx.durationMs.toFixed(0)}ms > ${a.maxMs}ms`)
        break
      case 'body': {
        const v = getPath(ctx.json, a.path)
        if (a.equals !== undefined && JSON.stringify(v) !== JSON.stringify(a.equals))
          fails.push(`body.${a.path} = ${JSON.stringify(v)} ≠ ${JSON.stringify(a.equals)}`)
        if (a.contains && !String(v).includes(a.contains))
          fails.push(`body.${a.path} lacks "${a.contains}"`)
        break
      }
    }
  }
  return fails
}
