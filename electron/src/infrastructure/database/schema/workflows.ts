import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  steps: text('steps', { mode: 'json' }).$type<Array<{
    id: string
    type: 'open_url' | 'click' | 'fill' | 'wait' | 'screenshot' | 'extract_text'
    params: Record<string, unknown>
  }>>().notNull(),
  isTemplate: integer('is_template', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export type Workflow = typeof workflows.$inferSelect
export type NewWorkflow = typeof workflows.$inferInsert
