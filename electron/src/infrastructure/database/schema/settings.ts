import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').unique().notNull(),
  value: text('value', { mode: 'json' }).notNull(),
  isEncrypted: integer('is_encrypted', { mode: 'boolean' }).default(false).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export type Setting = typeof settings.$inferSelect
export type NewSetting = typeof settings.$inferInsert
