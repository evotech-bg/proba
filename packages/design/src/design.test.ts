import { describe, expect, it } from 'vitest'
import {
  type Parameter,
  boundaryValues,
  decisionTable,
  equivalencePartitions,
  pairwise,
  stateTransitions,
} from './index'

describe('boundaryValues', () => {
  it('produces below/edge/inside/above with correct polarity', () => {
    const cases = boundaryValues({ field: 'age', min: 18, max: 65 })
    const vals = cases.map((c) => [c.inputs.age, c.polarity])
    expect(vals).toEqual([
      [17, 'negative'],
      [18, 'positive'],
      [19, 'positive'],
      [64, 'positive'],
      [65, 'positive'],
      [66, 'negative'],
    ])
  })
  it('treats exclusive bounds as negative at the edge', () => {
    const cases = boundaryValues({ field: 'x', min: 0, max: 10, minInclusive: false })
    expect(cases.find((c) => c.inputs.x === 0)?.polarity).toBe('negative')
  })
})

describe('equivalencePartitions', () => {
  it('maps valid→positive, invalid→negative', () => {
    const cases = equivalencePartitions('email', [
      { label: 'valid address', sample: 'a@b.c', valid: true },
      { label: 'missing @', sample: 'ab.c', valid: false },
    ])
    expect(cases.map((c) => c.polarity)).toEqual(['positive', 'negative'])
  })
})

describe('decisionTable', () => {
  it('emits one case per rule, marking error outcomes negative', () => {
    const cases = decisionTable([
      { conditions: { member: true, inStock: true }, outcome: 'purchase' },
      { conditions: { member: true, inStock: false }, outcome: 'backorder denied', negative: true },
    ])
    expect(cases).toHaveLength(2)
    expect(cases[1]!.polarity).toBe('negative')
  })
})

describe('pairwise', () => {
  it('covers every value-pair across parameters', () => {
    const params: Parameter[] = [
      { name: 'browser', values: ['chrome', 'firefox', 'safari'] },
      { name: 'os', values: ['mac', 'win'] },
      { name: 'plan', values: ['free', 'pro'] },
    ]
    const cases = pairwise(params)
    // verify the coverage guarantee: every pair appears in at least one row
    for (let i = 0; i < params.length; i++) {
      for (let j = i + 1; j < params.length; j++) {
        for (const vi of params[i]!.values) {
          for (const vj of params[j]!.values) {
            const covered = cases.some(
              (c) => c.inputs[params[i]!.name] === vi && c.inputs[params[j]!.name] === vj,
            )
            expect(covered, `pair ${params[i]!.name}=${vi} & ${params[j]!.name}=${vj}`).toBe(true)
          }
        }
      }
    }
    // and it's smaller than the full cartesian product (3*2*2 = 12)
    expect(cases.length).toBeLessThan(12)
  })
})

describe('stateTransitions', () => {
  it('emits positive for defined and negative for undefined transitions', () => {
    const cases = stateTransitions({
      states: ['draft', 'active'],
      events: ['publish', 'retire'],
      transitions: [
        { from: 'draft', event: 'publish', to: 'active' },
        { from: 'active', event: 'retire', to: 'draft' },
      ],
    })
    expect(cases.find((c) => c.title.includes('draft --publish--> active'))?.polarity).toBe(
      'positive',
    )
    // draft --retire--> is undefined → negative
    expect(
      cases.find((c) => c.inputs.from === 'draft' && c.inputs.event === 'retire')?.polarity,
    ).toBe('negative')
  })
})
