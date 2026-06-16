import { type Server, createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateContract, matchShape, verifyProvider } from './index'

describe('matchShape', () => {
  it('passes loose type matches and flags missing/retyped fields', () => {
    expect(matchShape({ id: 1, name: 'x' }, { id: 99, name: 'y', extra: true })).toEqual([])
    expect(matchShape({ id: 1, name: 'x' }, { id: 99 })).toContain('$.name: missing')
    expect(matchShape({ id: 1 }, { id: 'str' })).toContain('$.id: expected number, got string')
    expect(matchShape([{ id: 1 }], [{ id: 2 }, { id: 3 }])).toEqual([])
  })
})

describe('verifyProvider', () => {
  let server: Server
  let base: string
  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(req.url === '/user/1' ? 200 : 404, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify(
          req.url === '/user/1' ? { id: 1, name: 'Ada', active: true } : { error: 'nf' },
        ),
      )
    })
    await new Promise<void>((r) => server.listen(0, r))
    const a = server.address()
    base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`
  })
  afterAll(() => server.close())

  it('passes when the provider satisfies the contract shape', async () => {
    const contract = generateContract('web', 'api', [
      {
        description: 'get user',
        request: { path: '/user/1' },
        response: { status: 200, body: { id: 0, name: '' } },
      },
    ])
    const { ok } = await verifyProvider(contract, base)
    expect(ok).toBe(true)
  })

  it('fails when a relied-on field is missing or status differs', async () => {
    const contract = generateContract('web', 'api', [
      {
        description: 'get user',
        request: { path: '/user/1' },
        response: { status: 200, body: { id: 0, email: '' } },
      },
      { description: 'missing route', request: { path: '/nope' }, response: { status: 200 } },
    ])
    const { ok, results } = await verifyProvider(contract, base)
    expect(ok).toBe(false)
    expect(results[0]!.mismatches).toContain('$.email: missing')
    expect(results[1]!.mismatches.some((m) => m.includes('status'))).toBe(true)
  })
})
