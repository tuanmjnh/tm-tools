# BROWSER PROFILE MANAGEMENT PLATFORM — DATABASE SCHEMA SPECIFICATION

> **Phiên bản:** 1.0.0  
> **Hạ tầng cơ sở dữ liệu:** SQLite (via `better-sqlite3`)  
> **ORM & Migration Tooling:** Drizzle ORM (`drizzle-orm`) + Drizzle Kit (`drizzle-kit`)  
> **Đường dẫn vật lý:** `{app.getPath('userData')}/database/app.sqlite`  
> **Nguyên tắc cốt lõi:** SQLite là Single Source of Truth cho toàn bộ Business Data. Không lưu trữ thông tin nghiệp vụ trên LocalStorage.

---

## 1. NGUYÊN TẮC THIẾT KẾ VÀ QUẢN LÝ DỮ LIỆU

1. **Khóa chính (Primary Key)**: Sử dụng chuỗi UUID v4 (`text('id').primaryKey()`) cho toàn bộ các thực thể để đảm bảo tính duy nhất, thuận tiện cho việc backup, đồng bộ và import/export không bị trùng lặp ID.
2. **Quản lý thời gian (Timestamps)**: Sử dụng Unix epoch timestamp tính bằng mili-giây (`integer('created_at', { mode: 'timestamp_ms' })`) để đảm bảo hiệu năng lưu trữ và tính toán thời gian chuẩn xác giữa các múi giờ.
3. **Mã hóa dữ liệu nhạy cảm (Security & SafeStorage)**:
   - Các trường bí mật (như `encrypted_password` của Proxy, API Keys, Tokens) tuyệt đối **KHÔNG** lưu dưới dạng plain text.
   - Sử dụng Electron `safeStorage.encryptString()` trước khi lưu vào SQLite dưới dạng Base64 hoặc BLOB.
4. **Tính toàn vẹn tham chiếu (Referential Integrity)**: Kích hoạt `PRAGMA foreign_keys = ON;` ngay khi kết nối SQLite. Mọi quan hệ giữa các bảng đều có ràng buộc rõ ràng (`onDelete: 'cascade'` hoặc `'set null'`).
5. **Index hiệu năng (Performance Optimization)**: Tạo B-Tree index cho các trường thường xuyên dùng trong mệnh đề `WHERE`, `ORDER BY` và các trường khóa ngoại (`profile_id`, `group_id`, `proxy_id`, `status`).

---

## 2. DIAGRAM MỐI QUAN HỆ THỰC THỂ (ERD)

```
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────┐
│ profile_groups  │       │    browsers     │       │     proxies      │
├─────────────────┤       ├─────────────────┤       ├──────────────────┤
│ id (PK)         │       │ id (PK)         │       │ id (PK)          │
│ name            │       │ name            │       │ host, port       │
│ color, sort     │       │ engine, path    │       │ protocol         │
└────────┬────────┘       └────────┬────────┘       │ encrypted_pass   │
         │ 1                       │ 1              └────────┬─────────┘
         │                         │                         │ 1
         │ 0..*                    │ 0..*                    │ 0..*
┌────────┴─────────────────────────┴─────────────────────────┴─────────┐
│                               profiles                               │
├──────────────────────────────────────────────────────────────────────┤
│ id (PK)                                                              │
│ name, group_id (FK), browser_id (FK), proxy_id (FK)                  │
│ user_agent, viewport_width, viewport_height, os, timezone, locale    │
│ storage_path, custom_flags, notes, status                            │
│ last_launched_at, created_at, updated_at                             │
└────────┬─────────────────────────────────────────────────┬───────────┘
         │ 1                                               │ 1
         │                                                 │
         │ 0..*                                            │ 0..*
┌────────┴────────┐       ┌───────────────┐       ┌────────┴───────────┐
│  profile_tags   │       │     tags      │       │       tasks        │
├─────────────────┤       ├───────────────┤       ├────────────────────┤
│ profile_id (PK) ├──────►│ id (PK)       │       │ id (PK)            │
│ tag_id (PK)     │       │ name (UNIQUE) │       │ profile_id (FK)    │
└─────────────────┘       │ color         │       │ workflow_id (FK)   │
                          └───────────────┘       │ status, progress   │
                                                  │ payload, result    │
                                                  └────────┬───────────┘
┌─────────────────┐                                        │ 0..*
│    workflows    │◄───────────────────────────────────────┘
├─────────────────┤
│ id (PK)         │
│ name, steps     │
└─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│    settings     │       │   audit_logs    │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ key (UNIQUE)    │       │ level, category │
│ value, is_enc   │       │ message, time   │
└─────────────────┘       └─────────────────┘
```

---

## 3. ĐỊNH NGHĨA BẢNG DRIZZLE ORM CHI TIẾT (TYPESCRIPT SPEC)

Dưới đây là mã nguồn TypeScript định nghĩa đầy đủ cho các bảng trong thư mục `electron/src/infrastructure/database/schema/`:

### 3.1. Bảng Trình duyệt Runtime (`browsers.ts`)
Quản lý các nhân trình duyệt có sẵn trên hệ thống hoặc do người dùng cấu hình thủ công:

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const browsers = sqliteTable('browsers', {
  id: text('id').primaryKey(), // uuid
  name: text('name').notNull(), // vd: "Chrome Stable 128", "Custom Ungoogled"
  engine: text('engine', { enum: ['chromium', 'firefox', 'custom'] }).notNull(),
  executablePath: text('executable_path').notNull(),
  version: text('version').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
  isCustom: integer('is_custom', { mode: 'boolean' }).default(false).notNull(),
  detectedAt: integer('detected_at', { mode: 'timestamp_ms' }),
  status: text('status', { enum: ['available', 'missing'] }).default('available').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_browsers_engine').on(table.engine),
  index('idx_browsers_status').on(table.status),
]);
```

### 3.2. Bảng Nhóm Profile (`groups.ts`)
Tổ chức phân loại cây thư mục / danh mục hồ sơ:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const profileGroups = sqliteTable('profile_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').default('#6366f1').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
```

### 3.3. Bảng Thẻ Nhãn Đa Chiều (`tags.ts` & `profile_tags.ts`)
Cho phép gắn nhiều nhãn linh hoạt lên một profile:

```typescript
import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { profiles } from './profiles';

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').unique().notNull(),
  color: text('color').default('#10b981').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const profileTags = sqliteTable('profile_tags', {
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.profileId, table.tagId] }),
  index('idx_profile_tags_tag_id').on(table.tagId),
]);
```

### 3.4. Bảng Máy Chủ Proxy (`proxies.ts`)
Quản lý danh sách proxy, trạng thái kiểm tra và mật khẩu được mã hóa an toàn:

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const proxies = sqliteTable('proxies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  protocol: text('protocol', { enum: ['http', 'https', 'socks4', 'socks5'] }).default('http').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  username: text('username'),
  // Mật khẩu bắt buộc được mã hóa thông qua electron.safeStorage
  encryptedPassword: text('encrypted_password'),
  changeIpUrl: text('change_ip_url'),
  status: text('status', { enum: ['active', 'dead', 'untested'] }).default('untested').notNull(),
  latency: integer('latency'), // tính theo ms
  ipInfo: text('ip_info', { mode: 'json' }).$type<{
    country?: string;
    region?: string;
    city?: string;
    isp?: string;
    ip?: string;
  }>(),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_proxies_status').on(table.status),
  index('idx_proxies_host_port').on(table.host, table.port),
]);
```

### 3.5. Bảng Hồ Sơ Trình Duyệt (`profiles.ts`)
Bảng trọng tâm lưu trữ toàn bộ cấu hình độc lập của từng hồ sơ:

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { browsers } from './browsers';
import { proxies } from './proxies';
import { profileGroups } from './groups';

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), // UUID v4, đồng thời định danh thư mục userData/profiles/{id}
  name: text('name').notNull(),
  groupId: text('group_id').references(() => profileGroups.id, { onDelete: 'set null' }),
  browserId: text('browser_id').notNull().references(() => browsers.id, { onDelete: 'restrict' }),
  proxyId: text('proxy_id').references(() => proxies.id, { onDelete: 'set null' }),
  
  // Thông số môi trường và phần cứng giả lập phục vụ QA & Testing
  os: text('os', { enum: ['windows', 'macos', 'linux'] }).default('windows').notNull(),
  userAgent: text('user_agent'),
  viewportWidth: integer('viewport_width').default(1280).notNull(),
  viewportHeight: integer('viewport_height').default(720).notNull(),
  timezone: text('timezone').default('Asia/Ho_Chi_Minh').notNull(),
  locale: text('locale').default('vi-VN').notNull(),
  
  // Cấu hình tính năng & bảo vệ riêng tư (Privacy & QA)
  webrtcMode: text('webrtc_mode', { enum: ['default', 'disabled', 'proxy_only'] }).default('default').notNull(),
  canvasMode: text('canvas_mode', { enum: ['default', 'noise', 'off'] }).default('default').notNull(),
  audioMode: text('audio_mode', { enum: ['default', 'noise', 'off'] }).default('default').notNull(),
  webglMode: text('webgl_mode', { enum: ['default', 'noise', 'off'] }).default('default').notNull(),
  
  // Đường dẫn lưu trữ thư mục dữ liệu tách biệt tuyệt đối
  storagePath: text('storage_path').notNull(), // vd: "profiles/{id}"
  customFlags: text('custom_flags', { mode: 'json' }).$type<string[]>().default([]).notNull(),
  notes: text('notes'),
  
  // Trạng thái vận hành
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false).notNull(),
  lastLaunchedAt: integer('last_launched_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_profiles_group_id').on(table.groupId),
  index('idx_profiles_browser_id').on(table.browserId),
  index('idx_profiles_proxy_id').on(table.proxyId),
  index('idx_profiles_is_archived').on(table.isArchived),
  index('idx_profiles_name').on(table.name),
]);
```

### 3.6. Bảng Kịch Bản Quy Trình (`workflows.ts`)
Lưu trữ cấu trúc các kịch bản tự động hóa hợp pháp:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  steps: text('steps', { mode: 'json' }).$type<Array<{
    id: string;
    type: 'open_url' | 'click' | 'fill' | 'wait' | 'screenshot' | 'extract_text';
    params: Record<string, unknown>;
  }>>().notNull(),
  isTemplate: integer('is_template', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
```

### 3.7. Bảng Tác Vụ & Tiến Trình Automation (`tasks.ts`)
Quản lý hàng đợi thực thi tác vụ:

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { profiles } from './profiles';
import { workflows } from './workflows';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  workflowId: text('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  type: text('type').default('workflow').notNull(),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).default('pending').notNull(),
  progress: integer('progress').default(0).notNull(), // 0 - 100%
  payload: text('payload', { mode: 'json' }),
  result: text('result', { mode: 'json' }),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_tasks_status').on(table.status),
  index('idx_tasks_profile_id').on(table.profileId),
  index('idx_tasks_created_at').on(table.createdAt),
]);
```

### 3.8. Bảng Cài Đặt Hệ Thống (`settings.ts`)
Lưu trữ các tham số cấu hình hệ thống (General, Storage limits, Default flags):

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').unique().notNull(),
  value: text('value', { mode: 'json' }).notNull(),
  isEncrypted: integer('is_encrypted', { mode: 'boolean' }).default(false).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
```

### 3.9. Bảng Nhật Ký Hoạt Động (`audit_logs.ts`)
Ghi vết các hành động quan trọng và lỗi hệ thống:

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  level: text('level', { enum: ['debug', 'info', 'warn', 'error'] }).default('info').notNull(),
  category: text('category').notNull(), // vd: 'profile', 'browser', 'task', 'proxy'
  message: text('message').notNull(),
  details: text('details', { mode: 'json' }),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_audit_logs_timestamp').on(table.timestamp),
  index('idx_audit_logs_level').on(table.level),
  index('idx_audit_logs_category').on(table.category),
]);
```

---

## 4. QUAN HỆ VÀ RELATIONS TRONG DRIZZLE ORM

```typescript
import { relations } from 'drizzle-orm';
import { profiles } from './profiles';
import { browsers } from './browsers';
import { proxies } from './proxies';
import { profileGroups } from './groups';
import { tags, profileTags } from './tags';
import { tasks } from './tasks';
import { workflows } from './workflows';

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  browser: one(browsers, {
    fields: [profiles.browserId],
    references: [browsers.id],
  }),
  proxy: one(proxies, {
    fields: [profiles.proxyId],
    references: [proxies.id],
  }),
  group: one(profileGroups, {
    fields: [profiles.groupId],
    references: [profileGroups.id],
  }),
  tags: many(profileTags),
  tasks: many(tasks),
}));

export const profileTagsRelations = relations(profileTags, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileTags.profileId],
    references: [profiles.id],
  }),
  tag: one(tags, {
    fields: [profileTags.tagId],
    references: [tags.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  profile: one(profiles, {
    fields: [tasks.profileId],
    references: [profiles.id],
  }),
  workflow: one(workflows, {
    fields: [tasks.workflowId],
    references: [workflows.id],
  }),
}));
```

---

## 5. CHIẾN LƯỢC MIGRATION VÀ PHIÊN BẢN HÓA CƠ SỞ DỮ LIỆU

### 5.1. Cấu hình Drizzle Kit (`drizzle.config.ts`)
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './electron/src/infrastructure/database/schema/index.ts',
  out: './electron/migrations',
  dialect: 'sqlite',
  driver: 'better-sqlite3',
  strict: true,
  verbose: true,
});
```

### 5.2. Quản lý Thư mục Migrations
- Các file migration SQL được lưu trữ tại `electron/migrations/`:
  - `0000_init_schema.sql`
  - `0001_add_proxy_rotation.sql`
  - `meta/_journal.json`
- Khi ứng dụng khởi động (`app.whenReady()`), hàm `runMigrations()` trong `migrator.ts` sẽ đọc thư mục này và áp dụng các file SQL chưa chạy vào `app.sqlite` qua bảng nhật ký `__drizzle_migrations`.

### 5.3. Trình thực thi Migration tự động (`migrator.ts`)
```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDatabase } from './connection';
import path from 'path';

export function runMigrations(): void {
  const db = getDatabase();
  const migrationsFolder = path.join(__dirname, '../../../../migrations');
  
  try {
    migrate(db, { migrationsFolder });
    console.log('[Database] Migrations executed successfully.');
  } catch (error) {
    console.error('[Database] Failed to execute migrations:', error);
    throw error;
  }
}
```

---

## 6. QUY TẮC AN TOÀN VÀ BẢO TRÌ

1. **Khóa bản ghi và Thread Safety**: `better-sqlite3` chạy synchronous trong Node.js Main Process, loại bỏ hoàn toàn hiện tượng race condition hoặc deadlocks của SQLite giữa các tiến trình con.
2. **Sao lưu trước khi Migrate**: Khi phát hiện có migration mới cần chạy, `StorageManager.createDatabaseSnapshot()` sẽ tự động tạo bản sao lưu `userData/database/app.sqlite.backup_[timestamp]` trước khi thực thi file SQL.
3. **Dọn dẹp nhật ký WAL**: Bật chế độ `PRAGMA journal_mode = WAL;` để tối ưu tốc độ đọc/ghi đồng thời; thực hiện `PRAGMA wal_checkpoint(TRUNCATE);` định kỳ khi ứng dụng đóng.
