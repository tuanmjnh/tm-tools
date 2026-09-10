import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const proxies = sqliteTable('proxies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  protocol: text('protocol', { enum: ['http', 'https', 'socks4', 'socks5'] }).default('http').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  username: text('username'),
  encryptedPassword: text('encrypted_password'),
  changeIpUrl: text('change_ip_url'),
  status: text('status', { enum: ['active', 'dead', 'untested'] }).default('untested').notNull(),
  latency: integer('latency'),
  ipInfo: text('ip_info', { mode: 'json' }).$type<{
    country?: string
    region?: string
    city?: string
    isp?: string
    ip?: string
  }>(),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
}, table => [
  index('idx_proxies_status').on(table.status),
  index('idx_proxies_host_port').on(table.host, table.port)
])

export type Proxy = typeof proxies.$inferSelect
export type NewProxy = typeof proxies.$inferInsert
