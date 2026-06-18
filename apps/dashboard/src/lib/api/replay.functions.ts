import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { replayAll, replayCase, replaySuite } from '../server/replay.server'

// Isolated in its own module so the engine (playwright) is loaded ONLY when replay runs —
// never on the snapshot/mutation path.
export const replayTest = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ caseId: z.string() }))
  .handler(async ({ data }) => replayCase(data.caseId))

export const replaySuiteFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ suiteId: z.string(), accounts: z.array(z.string()).optional() }))
  .handler(async ({ data }) => replaySuite(data.suiteId, { accounts: data.accounts }))

export const replayAllFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ appKey: z.string().optional() }))
  .handler(async ({ data }) => replayAll({ appKey: data.appKey }))
