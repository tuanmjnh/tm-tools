import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { profiles } from './profiles'
import { workflows } from './workflows'

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  workflowId: text('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  type: text('type').default('workflow').notNull(),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).default('pending').notNull(),
  progress: integer('progress').default(0).notNull(),
  payload: text('payload', { mode: 'json' }),
  result: text('result', { mode: 'json' }),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
}, table => [
  index('idx_tasks_status').on(table.status),
  index('idx_tasks_profile_id').on(table.profileId),
  index('idx_tasks_created_at').on(table.createdAt)
])

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
