import type { TaskStatus, TrackerKind } from '@proba/store'

export interface TaskDTO {
  id: string
  title: string
  description?: string
  status: TaskStatus
  externalRef?: string
  externalUrl?: string
}

export interface CreateTaskInput {
  title: string
  description?: string
  status?: TaskStatus
}

/**
 * One interface, many backends — embedded SQLite board (default) or external trackers
 * (Jira/Trello/Plane/...). External adapters MUST strip assistant branding from outbound text.
 */
export interface Tracker {
  readonly kind: TrackerKind
  list(status?: TaskStatus): Promise<TaskDTO[]>
  create(input: CreateTaskInput): Promise<TaskDTO>
  transition(id: string, status: TaskStatus): Promise<TaskDTO>
  /** Post a comment. External adapters neutralize branding first. */
  comment(id: string, body: string): Promise<void>
}
