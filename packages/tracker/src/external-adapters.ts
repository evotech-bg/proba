import type { TaskStatus, TrackerKind } from '@proba/store'
import { ExternalTracker } from './adapters'
import type { CreateTaskInput, TaskDTO } from './types'

/**
 * Live external-tracker adapters (Jira, Trello). Code-complete and unit-tested with an injected
 * fetch — NO live network call happens without real credentials. Outbound comments always pass
 * through ExternalTracker.comment → stripBranding before post() (global comms rule).
 */

export interface JiraConfig {
  baseUrl: string
  email: string
  token: string
  projectKey: string
  /** optional status → Jira transition id map */
  transitions?: Partial<Record<TaskStatus, string>>
  fetchImpl?: typeof fetch
}

export class JiraAdapter extends ExternalTracker {
  readonly kind: TrackerKind = 'jira'
  private readonly f: typeof fetch
  private readonly auth: string
  constructor(private readonly cfg: JiraConfig) {
    super()
    this.f = cfg.fetchImpl ?? fetch
    this.auth = `Basic ${Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64')}`
  }
  private headers() {
    return { authorization: this.auth, 'content-type': 'application/json' }
  }
  async list(): Promise<TaskDTO[]> {
    const res = await this.f(
      `${this.cfg.baseUrl}/rest/api/3/search?jql=project=${this.cfg.projectKey}`,
      {
        headers: this.headers(),
      },
    )
    const data = (await res.json()) as { issues?: { key: string; fields: { summary: string } }[] }
    return (data.issues ?? []).map((i) => ({
      id: i.key,
      title: i.fields.summary,
      status: 'todo' as TaskStatus,
      externalRef: i.key,
    }))
  }
  async create(input: CreateTaskInput): Promise<TaskDTO> {
    const res = await this.f(`${this.cfg.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        fields: {
          project: { key: this.cfg.projectKey },
          summary: input.title,
          description: input.description,
          issuetype: { name: 'Task' },
        },
      }),
    })
    const data = (await res.json()) as { key: string }
    return {
      id: data.key,
      title: input.title,
      status: input.status ?? 'todo',
      externalRef: data.key,
    }
  }
  async transition(id: string, status: TaskStatus): Promise<TaskDTO> {
    const tid = this.cfg.transitions?.[status]
    if (tid) {
      await this.f(`${this.cfg.baseUrl}/rest/api/3/issue/${id}/transitions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ transition: { id: tid } }),
      })
    }
    return { id, title: id, status, externalRef: id }
  }
  protected async post(id: string, neutralBody: string): Promise<void> {
    await this.f(`${this.cfg.baseUrl}/rest/api/3/issue/${id}/comment`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ body: neutralBody }),
    })
  }
}

export interface TrelloConfig {
  key: string
  token: string
  listId: string
  fetchImpl?: typeof fetch
}

export class TrelloAdapter extends ExternalTracker {
  readonly kind: TrackerKind = 'trello'
  private readonly f: typeof fetch
  constructor(private readonly cfg: TrelloConfig) {
    super()
    this.f = cfg.fetchImpl ?? fetch
  }
  private q() {
    return `key=${this.cfg.key}&token=${this.cfg.token}`
  }
  async list(): Promise<TaskDTO[]> {
    const res = await this.f(`https://api.trello.com/1/lists/${this.cfg.listId}/cards?${this.q()}`)
    const cards = (await res.json()) as { id: string; name: string }[]
    return cards.map((c) => ({
      id: c.id,
      title: c.name,
      status: 'todo' as TaskStatus,
      externalRef: c.id,
    }))
  }
  async create(input: CreateTaskInput): Promise<TaskDTO> {
    const res = await this.f(
      `https://api.trello.com/1/cards?${this.q()}&idList=${this.cfg.listId}&name=${encodeURIComponent(input.title)}`,
      { method: 'POST' },
    )
    const card = (await res.json()) as { id: string }
    return { id: card.id, title: input.title, status: input.status ?? 'todo', externalRef: card.id }
  }
  async transition(id: string, status: TaskStatus): Promise<TaskDTO> {
    // Trello "status" = list membership; caller maps a list id per status (not modeled here).
    return { id, title: id, status, externalRef: id }
  }
  protected async post(id: string, neutralBody: string): Promise<void> {
    await this.f(
      `https://api.trello.com/1/cards/${id}/actions/comments?${this.q()}&text=${encodeURIComponent(neutralBody)}`,
      {
        method: 'POST',
      },
    )
  }
}
