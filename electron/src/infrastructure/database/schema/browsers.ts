import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const browsers = sqliteTable('browsers', {
  id: text('id').primaryKey(), // uuid
  name: text('name').notNull(),
  engine: text('engine', { enum: ['chromium', 'firefox', 'camoufox', 'donut', 'browser_oxide', 'custom'] }).notNull(),
  executablePath: text('executable_path').notNull(),
  version: text('version').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
  isCustom: integer('is_custom', { mode: 'boolean' }).default(false).notNull(),
  detectedAt: integer('detected_at', { mode: 'timestamp_ms' }),
  status: text('status', { enum: ['available', 'missing'] }).default('available').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
}, table => [
  index('idx_browsers_engine').on(table.engine),
  index('idx_browsers_status').on(table.status)
])

export type Browser = typeof browsers.$inferSelect
export type NewBrowser = typeof browsers.$inferInsert
