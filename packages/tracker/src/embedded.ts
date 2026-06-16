import type { ProbaDb, TaskStatus } from '@proba/store'
import { tasks as tasksT } from '@proba/store'
import { eq } from 'drizzle-orm'
import type { CreateTaskInput, TaskDTO, Tracker } from './types'

const toDTO = (r: typeof tasksT.$inferSelect): TaskDTO => ({
  id: r.id,
  title: r.title,
  description: r.description ?? undefined,
  status: r.status,
  externalRef: r.externalRef ?? undefined,
  externalUrl: r.externalUrl ?? undefined,
})

/** Local-first Trello-like board backed by the Proba store. The default tracker. */
export class EmbeddedTracker implements Tracker {
  readonly kind = 'embedded' as const
  constructor(private readonly db: ProbaDb) {}

  async list(status?: TaskStatus): Promise<TaskDTO[]> {
    const rows = this.db.select().from(tasksT).all()
    return rows.filter((r) => !status || r.status === status).map(toDTO)
  }

  async create(input: CreateTaskInput): Promise<TaskDTO> {
    const [row] = this.db
      .insert(tasksT)
      .values({
        title: input.title,
        description: input.description,
        status: input.status ?? 'todo',
      })
      .returning()
      .all()
    return toDTO(row!)
  }

  async transition(id: string, status: TaskStatus): Promise<TaskDTO> {
    const [row] = this.db
      .update(tasksT)
      .set({ status, updatedAt: new Date() })
      .where(eq(tasksT.id, id))
      .returning()
      .all()
    if (!row) throw new Error(`task ${id} not found`)
    return toDTO(row)
  }

  async comment(id: string, body: string): Promise<void> {
    // embedded board: comments append to description (no external posting → no branding rule)
    const row = this.db.select().from(tasksT).where(eq(tasksT.id, id)).all()[0]
    if (!row) throw new Error(`task ${id} not found`)
    this.db
      .update(tasksT)
      .set({ description: `${row.description ?? ''}\n${body}`.trim(), updatedAt: new Date() })
      .where(eq(tasksT.id, id))
      .run()
  }
}
