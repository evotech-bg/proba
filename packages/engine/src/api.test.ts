import { type Server, createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { executeApi, validateSchema } from './api'
import type { StepSpec } from './types'

let server: Server
let base: string

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/user') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: 1, name: 'Ada', active: true }))
    } else {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    }
  })
  await new Promise<void>((r) => server.listen(0, r))
  const addr = server.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(() => server.close())

describe('validateSchema', () => {
  it('passes a matching object and reports type/required errors', () => {
    const schema = {
      type: 'object',
      required: ['id', 'name'],
      properties: { id: { type: 'integer' }, name: { type: 'string' } },
    }
    expect(validateSchema({ id: 1, name: 'x' }, schema)).toEqual([])
    expect(validateSchema({ id: 'nope' }, schema)).toContain('$: missing required "name"')
  })
})

describe('executeApi', () => {
  it('passes status + schema + body assertions', async () => {
    const step: StepSpec = {
      kind: 'api',
      action: 'request',
      params: { method: 'GET', url: `${base}/user` },
      assertions: [
        { type: 'http', status: 200 },
        { type: 'schema', schema: { type: 'object', required: ['id', 'name'] } },
        { type: 'body', path: 'name', equals: 'Ada' },
        { type: 'sla', maxMs: 5000 },
      ],
    }
    const r = await executeApi(step)
    expect(r.verdict).toBe('passed')
  })

  it('fails when status assertion is wrong', async () => {
    const step: StepSpec = {
      kind: 'api',
      action: 'request',
      params: { method: 'GET', url: `${base}/missing` },
      assertions: [{ type: 'http', status: 200 }],
    }
    const r = await executeApi(step)
    expect(r.verdict).toBe('failed')
    expect(r.message).toContain('404')
  })
})
