import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').unique().notNull(),
  color: text('color').default('#10b981').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const profileTags = sqliteTable('profile_tags', {
  profileId: text('profile_id').notNull(),
  tagId: text('tag_id').notNull()
}, table => [
  primaryKey({ columns: [table.profileId, table.tagId] }),
  index('idx_profile_tags_tag_id').on(table.tagId)
])

export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
export type ProfileTag = typeof profileTags.$inferSelect
