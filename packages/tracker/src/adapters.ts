import type { ProbaDb, TaskStatus, TrackerKind } from '@proba/store'
import { stripBranding } from './branding'
import { EmbeddedTracker } from './embedded'
import type { CreateTaskInput, TaskDTO, Tracker } from './types'

export class TrackerNotConfiguredError extends Error {
  constructor(kind: TrackerKind) {
    super(
      `Tracker "${kind}" is not configured. Provide credentials/baseUrl and implement its post() ` +
        'transport. The embedded board works with no setup.',
    )
    this.name = 'TrackerNotConfiguredError'
  }
}

/**
 * Base for external trackers. The ONLY way out is `comment` → `post`, and comment() neutralizes
 * branding first, so no subclass can accidentally leak assistant branding to a shared destination.
 */
export abstract class ExternalTracker implements Tracker {
  abstract readonly kind: TrackerKind
  abstract list(status?: TaskStatus): Promise<TaskDTO[]>
  abstract create(input: CreateTaskInput): Promise<TaskDTO>
  abstract transition(id: string, status: TaskStatus): Promise<TaskDTO>
  /** Transport — receives already-neutralized text. */
  protected abstract post(id: string, neutralBody: string): Promise<void>

  async comment(id: string, body: string): Promise<void> {
    await this.post(id, stripBranding(body))
  }
}

export interface TrackerConfig {
  kind: TrackerKind
  db?: ProbaDb
  baseUrl?: string
  token?: string
}

/** Build a tracker. Embedded is real; external kinds require configuration + a wired transport. */
export function makeTracker(config: TrackerConfig): Tracker {
  if (config.kind === 'embedded') {
    if (!config.db) throw new Error('embedded tracker requires a store (db)')
    return new EmbeddedTracker(config.db)
  }
  // Jira/Trello/Plane/GitHub/Linear: scaffolded behind ExternalTracker; not faked.
  throw new TrackerNotConfiguredError(config.kind)
}
