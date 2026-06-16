/**
 * @proba/design — test-design technique generators.
 *
 * Turns a small spec into covering cases, each tagged positive (valid) or negative
 * (invalid / boundary-violating / error). This is the substance behind "auto-generate a test plan":
 * equivalence partitioning, boundary value analysis, decision tables, pairwise, state transition.
 */
export type Polarity = 'positive' | 'negative'
export type Technique = 'ep' | 'bva' | 'decision' | 'pairwise' | 'state'

export interface DesignedCase {
  title: string
  technique: Technique
  polarity: Polarity
  inputs: Record<string, unknown>
}

// ── Boundary Value Analysis ───────────────────────────────────────────────────
export interface BvaSpec {
  field: string
  min: number
  max: number
  minInclusive?: boolean
  maxInclusive?: boolean
}

export function boundaryValues(spec: BvaSpec): DesignedCase[] {
  const minIn = spec.minInclusive ?? true
  const maxIn = spec.maxInclusive ?? true
  const mk = (value: number, polarity: Polarity, label: string): DesignedCase => ({
    title: `${spec.field} = ${value} (${label})`,
    technique: 'bva',
    polarity,
    inputs: { [spec.field]: value },
  })
  return [
    mk(spec.min - 1, 'negative', 'below min'),
    mk(spec.min, minIn ? 'positive' : 'negative', minIn ? 'min edge' : 'min excluded'),
    mk(spec.min + 1, 'positive', 'just inside min'),
    mk(spec.max - 1, 'positive', 'just inside max'),
    mk(spec.max, maxIn ? 'positive' : 'negative', maxIn ? 'max edge' : 'max excluded'),
    mk(spec.max + 1, 'negative', 'above max'),
  ]
}

// ── Equivalence Partitioning ──────────────────────────────────────────────────
export interface Partition {
  label: string
  sample: unknown
  valid: boolean
}

export function equivalencePartitions(field: string, partitions: Partition[]): DesignedCase[] {
  return partitions.map((p) => ({
    title: `${field}: ${p.label}`,
    technique: 'ep',
    polarity: p.valid ? 'positive' : 'negative',
    inputs: { [field]: p.sample },
  }))
}

// ── Decision Table ────────────────────────────────────────────────────────────
export interface DecisionRule {
  conditions: Record<string, boolean>
  outcome: string
  /** mark error/denial outcomes as negative tests */
  negative?: boolean
}

export function decisionTable(rules: DecisionRule[]): DesignedCase[] {
  return rules.map((r, i) => ({
    title: `rule ${i + 1}: ${Object.entries(r.conditions)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')} → ${r.outcome}`,
    technique: 'decision',
    polarity: r.negative ? 'negative' : 'positive',
    inputs: { ...r.conditions, expected: r.outcome },
  }))
}

// ── Pairwise (all-pairs greedy; covers every value-pair) ─────────────────────
export interface Parameter {
  name: string
  values: unknown[]
}

function allPairs(params: Parameter[]): Set<string> {
  const pairs = new Set<string>()
  for (let i = 0; i < params.length; i++) {
    for (let j = i + 1; j < params.length; j++) {
      for (const vi of params[i]!.values) {
        for (const vj of params[j]!.values) {
          pairs.add(`${i}:${JSON.stringify(vi)}|${j}:${JSON.stringify(vj)}`)
        }
      }
    }
  }
  return pairs
}

export function pairwise(params: Parameter[]): DesignedCase[] {
  if (params.length < 2) {
    return (params[0]?.values ?? []).map((v) => ({
      title: `${params[0]!.name}=${JSON.stringify(v)}`,
      technique: 'pairwise' as const,
      polarity: 'positive' as const,
      inputs: { [params[0]!.name]: v },
    }))
  }
  const uncovered = allPairs(params)
  const rows: Record<string, unknown>[] = []

  // pairs covered by choosing `val` at `idx` given earlier choices in this row
  const newlyCovered = (idx: number, val: unknown, chosen: (unknown | undefined)[]) => {
    let n = 0
    for (let k = 0; k < idx; k++) {
      if (chosen[k] === undefined) continue
      if (uncovered.has(`${k}:${JSON.stringify(chosen[k])}|${idx}:${JSON.stringify(val)}`)) n++
    }
    return n
  }
  // how many uncovered pairs still involve this (idx,val) token at all — breaks the idx=0 tie
  const potential = (idx: number, val: unknown) => {
    const lhs = `${idx}:${JSON.stringify(val)}|`
    const rhs = `|${idx}:${JSON.stringify(val)}`
    let n = 0
    for (const key of uncovered) if (key.startsWith(lhs) || key.endsWith(rhs)) n++
    return n
  }

  const cap = params.reduce((acc, p) => acc * p.values.length, 1) // cartesian product = hard upper bound
  while (uncovered.size > 0 && rows.length < cap) {
    const chosen: (unknown | undefined)[] = new Array(params.length).fill(undefined)
    for (let idx = 0; idx < params.length; idx++) {
      let best = params[idx]!.values[0]
      let bestScore = -1
      for (const val of params[idx]!.values) {
        // prioritize immediate coverage; tie-break toward values with remaining potential
        const score = newlyCovered(idx, val, chosen) * 1000 + potential(idx, val)
        if (score > bestScore) {
          bestScore = score
          best = val
        }
      }
      chosen[idx] = best
    }
    // remove the pairs this row covers
    for (let i = 0; i < params.length; i++) {
      for (let j = i + 1; j < params.length; j++) {
        uncovered.delete(`${i}:${JSON.stringify(chosen[i])}|${j}:${JSON.stringify(chosen[j])}`)
      }
    }
    const inputs: Record<string, unknown> = {}
    params.forEach((p, i) => {
      inputs[p.name] = chosen[i]
    })
    rows.push(inputs)
  }

  return rows.map((inputs, i) => ({
    title: `pairwise row ${i + 1}`,
    technique: 'pairwise',
    polarity: 'positive',
    inputs,
  }))
}

// ── State Transition ──────────────────────────────────────────────────────────
export interface Transition {
  from: string
  event: string
  to: string
}

export interface StateMachine {
  states: string[]
  events: string[]
  transitions: Transition[]
}

export function stateTransitions(machine: StateMachine): DesignedCase[] {
  const cases: DesignedCase[] = []
  // valid transitions → positive
  for (const t of machine.transitions) {
    cases.push({
      title: `${t.from} --${t.event}--> ${t.to}`,
      technique: 'state',
      polarity: 'positive',
      inputs: { from: t.from, event: t.event, expected: t.to },
    })
  }
  // undefined (state, event) combos → negative (must be rejected)
  for (const state of machine.states) {
    for (const event of machine.events) {
      const defined = machine.transitions.some((t) => t.from === state && t.event === event)
      if (!defined) {
        cases.push({
          title: `${state} --${event}--> (rejected)`,
          technique: 'state',
          polarity: 'negative',
          inputs: { from: state, event, expected: 'rejected' },
        })
      }
    }
  }
  return cases
}
