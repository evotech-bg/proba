import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { openStore } from '@proba/store'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { expect, test } from 'vitest'
import { createServer } from './server'

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'store',
  'migrations',
)

async function connected() {
  const db = openStore(':memory:')
  migrate(db, { migrationsFolder })
  const server = createServer(db, mkdtempSync(join(tmpdir(), 'proba-mcp-')))
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  await server.connect(serverT)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(clientT)
  return { client }
}

test('MCP server exposes the QA tool surface', async () => {
  const { client } = await connected()
  const names = (await client.listTools()).tools.map((t) => t.name)
  expect(names).toEqual(
    expect.arrayContaining([
      'proba_session_open',
      'proba_start_case',
      'proba_act',
      'proba_request',
      'proba_snapshot',
      'proba_remember',
      'proba_finalize_test',
      'proba_close_session',
      'proba_task_list',
      'proba_task_create',
      'proba_task_claim',
      'proba_task_update',
      'proba_layout_audit',
      'proba_a11y_scan',
      'proba_diff',
      'proba_design_cases',
      'proba_replay',
      'proba_diagnose',
      'proba_patch_step',
      'proba_project_list',
      'proba_project_create',
      'proba_app_create',
      'proba_open_dashboard',
    ]),
  )
})

test('proba_patch_step fixes a recorded step locator through the tool', async () => {
  const { client } = await connected()
  await client.callTool({
    name: 'proba_session_open',
    arguments: { appKey: 'demo', headless: true },
  })
  const started = await client.callTool({
    name: 'proba_start_case',
    arguments: { title: 'heal me' },
  })
  const caseId = JSON.parse((started.content as { text: string }[])[0]!.text).caseId
  // record one web step with a (soon to be wrong) locator
  await client.callTool({
    name: 'proba_act',
    arguments: { action: 'click', target: { strategy: 'role', value: 'button', name: 'Old name' } },
  })
  // fix the locator + record healing
  const res = await client.callTool({
    name: 'proba_patch_step',
    arguments: {
      caseId,
      ordinal: 1,
      target: { strategy: 'role', value: 'button', name: 'New name' },
      recordHealing: true,
      reason: 'button label changed',
    },
  })
  const payload = JSON.parse((res.content as { text: string }[])[0]!.text)
  expect(payload.ok).toBe(true)
  expect(payload.healed).toBe(true)
  await client.callTool({ name: 'proba_close_session', arguments: {} })
}, 60_000)

test('project → app scope is creatable + listable through MCP tools', async () => {
  const { client } = await connected()
  const proj = JSON.parse(
    (
      (
        await client.callTool({
          name: 'proba_project_create',
          arguments: { name: 'Acme Shop' },
        })
      ).content as { text: string }[]
    )[0]!.text,
  )
  expect(proj.key).toBe('acme-shop')

  const app = JSON.parse(
    (
      (
        await client.callTool({
          name: 'proba_app_create',
          arguments: { projectKey: 'acme-shop', name: 'Web', platform: 'web' },
        })
      ).content as { text: string }[]
    )[0]!.text,
  )
  expect(app.key).toBe('web')

  const listed = JSON.parse(
    (
      (
        await client.callTool({
          name: 'proba_project_list',
          arguments: {},
        })
      ).content as { text: string }[]
    )[0]!.text,
  )
  expect(listed.projects.map((p: { key: string }) => p.key)).toContain('acme-shop')
  expect(listed.apps.find((a: { key: string }) => a.key === 'web')?.projectKey).toBe('acme-shop')
})

test('proba_design_cases generates BVA cases through the tool', async () => {
  const { client } = await connected()
  const res = await client.callTool({
    name: 'proba_design_cases',
    arguments: { technique: 'bva', spec: { field: 'age', min: 18, max: 65 } },
  })
  const payload = JSON.parse((res.content as { text: string }[])[0]!.text)
  expect(payload.count).toBe(6)
  expect(payload.cases.some((c: { polarity: string }) => c.polarity === 'negative')).toBe(true)
})

test('task board loop: create → claim → done through MCP tools', async () => {
  const { client } = await connected()
  const created = await client.callTool({
    name: 'proba_task_create',
    arguments: { title: 'verify checkout' },
  })
  const task = JSON.parse((created.content as { text: string }[])[0]!.text)
  expect(task.status).toBe('todo')

  await client.callTool({ name: 'proba_task_claim', arguments: { taskId: task.id } })
  await client.callTool({
    name: 'proba_task_update',
    arguments: { taskId: task.id, status: 'done', comment: 'passed' },
  })

  const listed = await client.callTool({ name: 'proba_task_list', arguments: { status: 'done' } })
  const done = JSON.parse((listed.content as { text: string }[])[0]!.text)
  expect(done.map((t: { id: string }) => t.id)).toContain(task.id)
})

test('MCP session_open → remember → close round-trips through tools', async () => {
  const { client } = await connected()
  const opened = await client.callTool({
    name: 'proba_session_open',
    arguments: { appKey: 'demo', headless: true },
  })
  const payload = JSON.parse((opened.content as { text: string }[])[0]!.text)
  expect(payload.sessionId).toBeTypeOf('string')
  expect(payload.knownSelectors).toBe(0)

  await client.callTool({
    name: 'proba_remember',
    arguments: {
      kind: 'selector',
      key: 'home.cta',
      value: { strategy: 'role', value: 'button', name: 'Get started' },
    },
  })
  const closed = await client.callTool({ name: 'proba_close_session', arguments: {} })
  expect(JSON.parse((closed.content as { text: string }[])[0]!.text).closed).toBe(true)
}, 60_000)
