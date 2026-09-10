import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  level: text('level', { enum: ['debug', 'info', 'warn', 'error'] }).default('info').notNull(),
  category: text('category').notNull(),
  message: text('message').notNull(),
  details: text('details', { mode: 'json' }),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull()
}, table => [
  index('idx_audit_logs_timestamp').on(table.timestamp),
  index('idx_audit_logs_level').on(table.level),
  index('idx_audit_logs_category').on(table.category)
])

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
