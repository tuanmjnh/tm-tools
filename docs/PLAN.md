# Kế hoạch xây dựng YouTube Download & FFmpeg Render

## Kiến trúc tổng quan

Module này sẽ được xây dựng dựa trên project **tm-browsers** (`D:\Applications\tm-browsers`) — một Electron + Vue 3 desktop app đã có sẵn:
- **YouTube Download**: dùng `yt-dlp.exe` bundled, spawn child process
- **FFmpeg Render**: dùng `ffmpeg.exe`/`ffprobe.exe` bundled, spawn child process
- **Task Manager**: `TaskProcessManager` / `TaskProcessManagerSimple` (thread pool, queue, group pipeline)
- **IPC pattern**: renderer → electron API (invoke) ↔ main process (handlers + callbacks)

## Database

**SQLite** (qua `better-sqlite3`) sẽ được dùng cho toàn bộ dữ liệu local của các module này thay vì MongoDB:

- **Lý do**: Desktop app local, không cần MongoDB server, tốc độ cao, CRUD đơn giản
- **Các collection/table**:
  - `youtube_formats` — format presets cho yt-dlp
  - `youtube_configs` — batch config presets (output path, threads, format, ...)
  - `youtube_history` — lịch sử download
  - `ffmpeg_configs` — render configurations (scale, zoom, flip, background, labels, ...)
  - `ffmpeg_batch_configs` — batch render configs (variable substitution, multi-file)
  - `ffmpeg_history` — lịch sử render

> **Note**: SQLite chỉ dùng cho dữ liệu local tools. MongoDB vẫn là database chính cho auth, users, permissions, system routes.

---

## Phase 1: Nâng cấp TaskManager

### Mục tiêu
Chuyển YouTube và FFmpeg từ `TaskProcessManagerSimple` sang `TaskProcessManager` (full-feature) đã có sẵn.

### Việc cần làm

#### 1.1. Main Process

**File:** `src/main/modules/youtube/youtube.controller.ts`
- Import `TaskProcessManager` từ `../../utils/TaskProcessManager` (full-feature)
- Bổ sung callbacks: `onTaskTimeout`, `onTaskRetry`, `onLog`
- Thêm IPC handlers: `getStatus`, `pauseTasks`, `continueTasks`

**File:** `src/main/modules/ffmpeg/ffmpeg.controller.ts`
- Tương tự YouTube controller
- Cấu hình `maxRetry`, `defaultTimeout`, `retryDelay` phù hợp
- Thêm IPC handlers: `getStatus`, `pauseTasks`, `continueTasks`

#### 1.2. Renderer (UI)

**File:** `src/renderer/stores/youtube/index.ts`
- Thêm state: `taskStatus`, `globalRetryCount`
- Thêm actions: `getStatus`, `pauseTasks`, `continueTasks`

**File:** `src/renderer/stores/ffmpeg/index.ts`
- Tương tự

**File:** `src/renderer/views/tools/youtube/index.vue`
- Thêm indicator: thread state, retry attempts, task status per item

**File:** `src/renderer/views/tools/video/index.vue`
- Tương tự

---

## Phase 2: YouTube Download nâng cấp

### 2.1. Kiến trúc files

```
src/main/modules/youtube/
  youtube.controller.ts    ← IPC handlers
  download.service.ts      ← NEW: download queue, retry, resume
  playlist.service.ts      ← NEW: crawl playlist/channel
  format.model.ts          ← gọn lại, dùng SQLite
  history.model.ts         ← NEW: lịch sử download (SQLite)
  batch-config.model.ts    ← NEW: batch config presets (SQLite)
  sqlite.ts                ← NEW: SQLite connection + schema init

src/renderer/views/tools/youtube/
  index.vue
  components/
    YoutubeUrlInput.vue       ← NEW
    YoutubePlaylistPreview.vue ← NEW
    YoutubeDownloadQueue.vue  ← NEW
    YoutubeHistory.vue        ← NEW
    YoutubeBatchConfig.vue    ← NEW
    YoutubeProgressCard.vue   ← NEW

src/renderer/stores/youtube/
  index.ts                  ← mở rộng
  helper.ts                 ← giữ nguyên
```

### 2.2. Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| **Download Queue** | Queue nhiều URL, ưu tiên, pause/resume từng task |
| **Playlist/Channel crawler** | Crawl danh sách video từ playlist/channel bằng `--flat-playlist --print`, hiển thị preview trước khi download |
| **Download History** | Lưu lịch sử vào SQLite: URL, format, thời gian, trạng thái, file output, dung lượng |
| **Retry + Resume** | Tự động retry khi lỗi mạng (configurable: maxRetry=3, delay=5s), resume partial download: `--continue` |
| **Batch Config Presets** | Lưu preset download (format, output template, thread count, encoding, restrict, overwrite) |
| **Progress chi tiết** | ETA, tốc độ, file size, % hoàn thành, estimated remaining time |

### 2.3. SQLite Schema

```sql
CREATE TABLE youtube_formats (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  code TEXT,
  opt TEXT NOT NULL,           -- JSON array
  w INTEGER DEFAULT 0,
  h INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 1,
  flag INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE youtube_configs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  format_id TEXT REFERENCES youtube_formats(id),
  out_path TEXT,
  file_name TEXT DEFAULT '%(title)s.%(ext)s',
  threads INTEGER DEFAULT 2,
  restrict INTEGER DEFAULT 0,
  overwrite INTEGER DEFAULT 1,
  encoding TEXT DEFAULT 'utf-8',
  flag INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE youtube_history (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  format_id TEXT,
  format_title TEXT,
  out_path TEXT,
  file_name TEXT,
  file_size INTEGER,
  duration REAL,
  status TEXT CHECK(status IN ('completed','failed','cancelled')),
  error_message TEXT,
  config_id TEXT,
  config_title TEXT,
  threads INTEGER,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 2.4. Multi-thread optimization

- Dùng `TaskProcessManager` với thread count từ config (default: CPU cores / 2)
- Mỗi thread = 1 process `yt-dlp.exe` riêng
- Option `--limit-rate` cho từng thread (tránh rate-limit)
- Throttle: `--throttled-rate 100K`

---

## Phase 3: YouTube Batch Config UI

### 3.1. Components

**`YoutubeBatchConfig.vue`**
- Danh sách preset dạng table/card
- CRUD: tạo mới, sửa, xoá, clone
- Form fields: title, format preset, output path, filename template, threads, overwrite, restrict
- Nút "Apply" → áp dụng preset vào model hiện tại

**`YoutubeUrlInput.vue`**
- Textarea cho URL (1 URL/dòng)
- Nút paste từ clipboard
- Auto-detect: video, shorts, playlist, channel (icon + label)
- Nút "Get playlist info" → crawl playlist, hiển thị preview

**`YoutubePlaylistPreview.vue`**
- Table: index, title, duration, upload date, view count
- Checkbox chọn video muốn download
- Select all / deselect all
- Filter: min duration, max duration

**`YoutubeDownloadQueue.vue`**
- Danh sách task đang chạy/chờ
- Mỗi item: progress bar, %, ETA, speed, file name
- Action: pause/resume/stop từng task
- Thread indicator: thread 1, 2, 3...

**`YoutubeHistory.vue`**
- Table: URL, title, format, file size, status, thời gian
- Filter: theo ngày, status, format
- Action: xoá, re-download, open output folder
- Pagination

**`YoutubeProgressCard.vue`**
- Progress bar (animated)
- Thông tin: speed, downloaded, ETA, %
- File name, output path
- Thread number

---

## Phase 4: FFmpeg Render nâng cấp

### 4.1. Kiến trúc files

```
src/main/modules/ffmpeg/
  ffmpeg.controller.ts      ← IPC handlers
  ffmpeg.service.ts         ← NEW: render engine, batch processor
  render-queue.service.ts   ← NEW: queue render jobs
  configuration.model.ts    ← sửa, dùng SQLite
  batch-config.model.ts     ← NEW: batch render config (SQLite)
  history.model.ts          ← NEW: render history (SQLite)
  ffmpeg.config.ts          ← giữ nguyên
  sqlite.ts                 ← NEW: SQLite connection + schema init

src/renderer/views/tools/video/
  index.vue
  components/
    VideoBatchConfig.vue       ← NEW
    VideoBatchRender.vue       ← NEW
    VideoRenderQueue.vue       ← NEW
    VideoProgressCard.vue      ← NEW
    VideoHistory.vue           ← NEW
    VideoVariableHelp.vue      ← NEW

src/renderer/stores/ffmpeg/
  index.ts                  ← mở rộng
  helper.ts                 ← giữ nguyên
```

### 4.2. SQLite Schema

```sql
CREATE TABLE ffmpeg_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  aspect_ratio INTEGER,
  background_type TEXT CHECK(background_type IN ('color','boxblur','file')),
  background_color TEXT DEFAULT '#000000',
  background_boxblur REAL DEFAULT 10,
  background_file TEXT,
  center INTEGER DEFAULT 1,
  speed REAL DEFAULT 1,
  volume REAL DEFAULT 1,
  zoom_enable INTEGER DEFAULT 0,
  zoom_ratio REAL DEFAULT 1.1,
  zoom_time_start REAL DEFAULT 0,
  zoom_time_duration REAL DEFAULT 0,
  zoom_time_loop REAL DEFAULT 0,
  hflip_enable INTEGER DEFAULT 0,
  hflip_all INTEGER DEFAULT 1,
  hflip_time_start REAL DEFAULT 0,
  hflip_time_duration REAL DEFAULT 0,
  hflip_time_loop REAL DEFAULT 0,
  vflip_enable INTEGER DEFAULT 0,
  vflip_all INTEGER DEFAULT 1,
  vflip_time_start REAL DEFAULT 0,
  vflip_time_duration REAL DEFAULT 0,
  vflip_time_loop REAL DEFAULT 0,
  scale_x INTEGER DEFAULT 0,
  scale_y INTEGER DEFAULT 0,
  scale_w INTEGER DEFAULT 0,
  scale_h INTEGER DEFAULT 0,
  labels TEXT,                  -- JSON array
  files TEXT,                   -- JSON array
  subtitle TEXT,
  render_code TEXT,             -- JSON object
  flag INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE ffmpeg_batch_configs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  items TEXT NOT NULL,          -- JSON array of { configId, inputPattern, outputPattern, fileFilter }
  threads INTEGER DEFAULT 1,
  output_path TEXT,
  flag INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE ffmpeg_history (
  id TEXT PRIMARY KEY,
  config_id TEXT,
  config_title TEXT,
  batch_config_id TEXT,
  batch_config_title TEXT,
  input_file TEXT,
  input_files TEXT,             -- JSON array
  output_file TEXT,
  output_path TEXT,
  operation TEXT CHECK(operation IN ('render','split','join','split_render','join_render')),
  duration REAL,
  file_size INTEGER,
  status TEXT CHECK(status IN ('completed','failed','cancelled')),
  error_message TEXT,
  threads INTEGER,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 4.3. Batch Configuration

```typescript
interface IBatchConfigItem {
  configId: string
  inputPattern: string        // glob: "D:/videos/*.mp4"
  outputPattern: string       // template: "{dirname}/{name}_rendered.{ext}"
  fileFilter?: {
    minDuration?: number
    maxDuration?: number
    minWidth?: number
    maxWidth?: number
  }
}

interface IBatchConfig {
  id: string
  title: string
  items: IBatchConfigItem[]
  threads: number
  outputPath: string
  flag: number
}
```

**Variable substitution** cho output pattern:
| Variable | Mô tả | Ví dụ |
|----------|-------|-------|
| `{name}` | Filename không extension | `video1` |
| `{ext}` | File extension | `mp4` |
| `{dirname}` | Tên thư mục cha | `my_videos` |
| `{fulldir}` | Full directory path | `D:/videos/my_videos` |
| `{date}` | Ngày hiện tại | `20260731` |
| `{datetime}` | Datetime | `20260731_143022` |
| `{config}` | Config title | `HD_Render` |
| `{idx}` | Index (tự động tăng) | `1`, `2`, `3`... |
| `{width}` | Video width | `1920` |
| `{height}` | Video height | `1080` |

### 4.4. Multi-thread render

**Render song song:**
- Dùng `TaskProcessManager.setGroupedTasks()` — mỗi group = 1 file
- Thread count = min(config.threads, số file)
- Mỗi process `ffmpeg.exe` độc lập

**FFmpeg internal thread:**
- Render args thêm `-threads auto` hoặc `-threads N`
- Cho `libx264`/`libx265`: `-x264-params threads=N`

**GPU acceleration (auto-detect):**
- Ưu tiên NVENC (NVIDIA) > QSV (Intel) > AMF (AMD) > libx264 (CPU fallback)
- Render args: `-c:v h264_nvenc -preset p7 -rc vbr -b:v 5M`

---

## Phase 5: FFmpeg Render Queue & Pipeline

### 5.1. Render Queue

**`render-queue.service.ts`**
- Queue nhiều render job
- Priority support
- Pause/resume từng job
- Pipeline: join → render hoặc download → render → output
- Temp file management (auto-cleanup sau khi hoàn tất)

### 5.2. Pipeline

Pipeline cho phép chuỗi operation tự động:

```
Download YouTube  →  Render với config  →  Output folder
Join videos       →  Render với config  →  Output folder
Split videos      →  Render từng segment →  Output folder
```

Mỗi step trong pipeline là 1 task group (`TaskProcessManager.setGroupedTasks`). Group chạy song song, task trong group chạy tuần tự.

---

## Phase 6: UI Components

### 6.1. FFmpeg UI Components

**`VideoBatchConfig.vue`**
- Danh sách batch config (table/card)
- CRUD: tạo mới, sửa, xoá, clone
- Form: title, items (table: config, inputPattern, outputPattern, fileFilter), threads
- Nút "Run" → chạy batch render

**`VideoBatchRender.vue`**
- Hiển thị progress của batch render
- Mỗi item: file name, progress bar, %, ETA, thread
- Overall progress: total files, completed, failed, remaining
- Pause/resume/stop batch

**`VideoRenderQueue.vue`**
- Queue jobs (mỗi job = 1+ files)
- Drag to reorder
- Priority: high, normal, low
- Status: waiting, running, completed, failed, paused

**`VideoHistory.vue`**
- Table: input, output, config, operation, duration, status, thời gian
- Filter: theo ngày, operation, status, config
- Action: re-run, open output folder, delete

**`VideoVariableHelp.vue`**
- Dialog hiển thị danh sách variable + description + example
- Copy variable name

---

## Phase 7: SQLite Implementation

### 7.1. Package

Thêm `better-sqlite3` vào `package.json` (tm-browsers).

### 7.2. SQLite Service

```typescript
// src/main/modules/sqlite/index.ts
import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database

export function getSQLite() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'tm-browsers.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema()
  }
  return db
}
```

### 7.3. Schema Init

```typescript
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS youtube_formats ( ... );
    CREATE TABLE IF NOT EXISTS youtube_configs ( ... );
    CREATE TABLE IF NOT EXISTS youtube_history ( ... );
    CREATE TABLE IF NOT EXISTS ffmpeg_configs ( ... );
    CREATE TABLE IF NOT EXISTS ffmpeg_batch_configs ( ... );
    CREATE TABLE IF NOT EXISTS ffmpeg_history ( ... );
  `)
}
```

### 7.4. Migration

- Version tracking: `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER, applied_at TEXT)`
- Seed data mặc định (youtube formats, mẫu configs)
- Migration script cho future schema changes

---

## Lộ trình thực hiện

| Phase | Nội dung | Thời gian |
|-------|----------|-----------|
| **Phase 1** | Nâng cấp TaskManager: YouTube + FFmpeg → TaskProcessManager, pause/resume, status | 2-3 ngày |
| **Phase 2** | YouTube download queue, retry, history, playlist preview | 3-4 ngày |
| **Phase 3** | YouTube batch config, UI components | 2-3 ngày |
| **Phase 4** | FFmpeg render queue, batch config model, variable substitution | 3-4 ngày |
| **Phase 5** | FFmpeg multi-thread render, GPU auto-detect, pipeline | 3-4 ngày |
| **Phase 6** | UI hoàn thiện (history, queue, batch UI), i18n | 2-3 ngày |
| **Phase 7** | SQLite schema, migration, seed data, test | 2 ngày |

**Tổng thời gian:** 17-23 ngày (full-time)

---

## Rủi ro & Lưu ý

- **FFmpeg multi-thread**: Mỗi process `-threads auto` + render song song nhiều file → CPU saturation. Cần auto-detect CPU cores, giới hạn process = cores / 2
- **yt-dlp rate-limit**: Download nhiều luồng → dễ bị YouTube block. Nên thêm `--limit-rate 5M` + delay giữa các luồng
- **Disk I/O**: Render nhiều file song song → I/O bottleneck. Recommend NVMe SSD
- **GPU memory**: Nếu dùng GPU encoder (NVENC) cho nhiều process → cần check VRAM, giới hạn process
- **Temp files**: Join+Render cần temp file. Cleanup sau khi hoàn tất
- **better-sqlite3**: Cần rebuild native module cho Electron (`electron-rebuild` hoặc `@electron/rebuild`)
- **Cross-platform**: Path handling (Windows `\\` vs Unix `/`), font paths, ffmpeg/yt-dlp binary paths

---

## Appendix: Code Audit & Fixes

### fontmanager.node

- **File**: `resources/fontmanager.node` (native addon từ `font-scanner`)
- **Trạng thái**: Load thành công với Node.js 22 (ABI 127), Electron 35 dùng cùng ABI → **dùng được luôn, không cần rebuild**
- **Fix đã áp dụng** (`system.fonts.ts`):
  - Cache module ở top-level thay vì `require()` mỗi lần gọi function
  - Thêm type annotations (`System.FontInfo`, `string`, `number`)
  - Xoá code comment, interface `FontScanner` không dùng

### vue-draggable-resizable

- **Đã có**: `package.json` có dependency, `main.ts` đăng ký global component, `framePreview.vue` dùng
- **Cách dùng**: User kéo/thả/resize main video, sub files, labels trong preview frame → toạ độ được tính ngược về base coordinates → sinh `-filter_complex` cho ffmpeg
- **Lưu ý**: Component này dùng `tsx` template trong `framePreview.vue`. Cần `@vue/jsx` types nếu chưa có

### Các vấn đề đã tối ưu

| # | Vấn đề | File | Trạng thái |
|---|--------|------|-----------|
| 1 | `require('fontmanager.node')` gọi lại mỗi lần, không cache | `system.fonts.ts` | ✅ Đã fix |
| 2 | `getAvailableFonts()` async gọi sync, type sai | `system.fonts.ts` | ✅ Đã fix |
| 3 | `FontScanner` interface export không dùng | `system.fonts.ts` | ✅ Đã xoá |
| 4 | `System.FontInfo` và `Models.FontInfo` duplicate | `fonts.d.ts` / `IConfiguration.d.ts` | ⏳ Có thể gộp sau |
| 5 | `formatArray` args type lỏng lẻo | `ffmpeg/helper.ts` / `ffmpeg.d.ts` | ⏳ Có thể cải thiện sau |