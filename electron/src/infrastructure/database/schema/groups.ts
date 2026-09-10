import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const profileGroups = sqliteTable('profile_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').default('#6366f1').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export type ProfileGroup = typeof profileGroups.$inferSelect
export type NewProfileGroup = typeof profileGroups.$inferInsert
