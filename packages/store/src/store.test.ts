import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { openStore } from './client'
import { assertions, knowledge, requirements, steps, testCases, traceLinks } from './schema'

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

test('canonical spine round-trips: requirement → case → step → assertion + RTM + knowledge', () => {
  const db = openStore(':memory:')
  migrate(db, { migrationsFolder })

  const [req] = db
    .insert(requirements)
    .values({
      key: 'AUTH-1',
      title: 'Login',
      asA: 'user',
      iWant: 'to log in',
      soThat: 'I access my data',
    })
    .returning()
    .all()

  const [tc] = db
    .insert(testCases)
    .values({
      title: 'rejects wrong password',
      polarity: 'negative',
      technique: 'bva',
      lifecycle: 'active',
    })
    .returning()
    .all()

  const [step] = db
    .insert(steps)
    .values({
      caseId: tc!.id,
      ordinal: 1,
      kind: 'web',
      action: 'fill',
      target: { strategy: 'role', value: 'textbox', name: 'Password' },
      params: { text: 'wrong' },
      description: 'When the user enters a wrong password',
    })
    .returning()
    .all()

  db.insert(assertions)
    .values({
      stepId: step!.id,
      type: 'dom',
      spec: {
        selector: { strategy: 'role', value: 'alert' },
        toContainText: 'Invalid credentials',
      },
      description: 'Then an error is shown',
    })
    .run()

  db.insert(traceLinks).values({ requirementId: req!.id, caseId: tc!.id, linkType: 'covers' }).run()

  // the moat: persist a discovered selector across sessions
  db.insert(knowledge)
    .values({
      appKey: 'demo-app',
      kind: 'selector',
      key: 'login.password',
      value: { strategy: 'role', value: 'textbox', name: 'Password' },
      confidence: 0.9,
    })
    .run()

  const cases = db.select().from(testCases).where(eq(testCases.id, tc!.id)).all()
  expect(cases).toHaveLength(1)
  expect(cases[0]!.polarity).toBe('negative')

  const known = db.select().from(knowledge).where(eq(knowledge.appKey, 'demo-app')).all()
  expect(known).toHaveLength(1)
  expect(known[0]!.kind).toBe('selector')

  const links = db.select().from(traceLinks).where(eq(traceLinks.caseId, tc!.id)).all()
  expect(links[0]!.requirementId).toBe(req!.id)
})
