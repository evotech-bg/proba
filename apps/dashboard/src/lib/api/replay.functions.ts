import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { replayCase, replaySuite } from '../server/replay.server'

// Isolated in its own module so the engine (playwright) is loaded ONLY when replay runs —
// never on the snapshot/mutation path.
export const replayTest = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ caseId: z.string() }))
  .handler(async ({ data }) => replayCase(data.caseId))

export const replaySuiteFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ suiteId: z.string() }))
  .handler(async ({ data }) => replaySuite(data.suiteId))
