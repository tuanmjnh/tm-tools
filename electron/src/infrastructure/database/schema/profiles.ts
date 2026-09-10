import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { browsers } from './browsers'
import { proxies } from './proxies'
import { profileGroups } from './groups'

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  groupId: text('group_id').references(() => profileGroups.id, { onDelete: 'set null' }),
  browserId: text('browser_id').notNull().references(() => browsers.id, { onDelete: 'restrict' }),
  proxyId: text('proxy_id').references(() => proxies.id, { onDelete: 'set null' }),

  os: text('os', { enum: ['windows', 'macos', 'linux'] }).default('windows').notNull(),
  userAgent: text('user_agent'),
  viewportWidth: integer('viewport_width').default(1280).notNull(),
  viewportHeight: integer('viewport_height').default(720).notNull(),
  timezone: text('timezone').default('Asia/Ho_Chi_Minh').notNull(),
  locale: text('locale').default('vi-VN').notNull(),

  webrtcMode: text('webrtc_mode', { enum: ['default', 'disabled', 'proxy_only'] }).default('default').notNull(),
  canvasMode: text('canvas_mode', { enum: ['default', 'noise', 'off'] }).default('default').notNull(),
  audioMode: text('audio_mode', { enum: ['default', 'noise', 'off'] }).default('default').notNull(),
  webglMode: text('webgl_mode', { enum: ['default', 'noise', 'off'] }).default('default').notNull(),
  stealthMode: integer('stealth_mode', { mode: 'boolean' }).default(false).notNull(),

  storagePath: text('storage_path').notNull(),
  customFlags: text('custom_flags', { mode: 'json' }).$type<string[]>().default([]).notNull(),
  notes: text('notes'),

  isArchived: integer('is_archived', { mode: 'boolean' }).default(false).notNull(),
  lastLaunchedAt: integer('last_launched_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
}, table => [
  index('idx_profiles_group_id').on(table.groupId),
  index('idx_profiles_browser_id').on(table.browserId),
  index('idx_profiles_proxy_id').on(table.proxyId),
  index('idx_profiles_is_archived').on(table.isArchived),
  index('idx_profiles_name').on(table.name)
])

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
