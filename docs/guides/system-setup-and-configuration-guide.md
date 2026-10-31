# Hướng Dẫn Cài Đặt & Cấu Hình Hệ Thống TM Tools

Tài liệu này hướng dẫn thiết lập môi trường và cấu hình kết nối giữa **TM Tools** và **TM Hub** sau khi bộ biên tập video TMCut đã tách sang repo riêng **tm-studio**.

---

## 1. Tổng Quan Kiến Trúc

Hệ sinh thái TM Platform hoạt động theo mô hình **Control Plane – Satellite**:

```
┌────────────────────────────────────────────────────────┐
│                   TM HUB CONTROL PLANE                 │
│                      (Port: 4000)                      │
│                                                        │
│  - Supabase PostgreSQL: IAM, Users, Roles, RBAC Routes │
│  - MongoDB (tm-hub-logs): Audit Logging                │
│  - MongoDB (tm-hub-app): Docs & Dynamic Content        │
│  - AI provider catalog & relay                         │
└──────────────────────────┬─────────────────────────────┘
                           │ API: useHub() / X-App-Id
                           ▼
┌────────────────────────────────────────────────────────┐
│                  TM TOOLS DESKTOP APP                  │
│                      (Port: 4002)                      │
│                                                        │
│  - Nuxt 4 (UI) + Nuxt UI v4 + Electron                 │
│  - Browser Hub (anti-detect profiles & proxies)        │
│  - Downloader & FFmpeg video processing tools          │
│  - AI provider/model console (connections only)        │
│  - Menu & Docs tải động từ TM Hub                      │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                TM STUDIO — TMCut EDITOR                │
│                      (Port: 4003)                      │
│  Repo riêng: tm-studio (video timeline, templates,     │
│  autocut, HTML/CSS studio). Dùng chung Hub cho auth,   │
│  connections và AI.                                    │
└────────────────────────────────────────────────────────┘
```

---

## 2. Phân Bổ Cổng Dịch Vụ (Port Allocation)

| Ứng dụng | Cổng (Port) | Vai trò |
| :--- | :--- | :--- |
| **TM Hub** | `http://localhost:4000` | Control Plane trung tâm: IAM, Roles, Routes, Configs, AI relay |
| **TM Trading** | `http://localhost:4001` | Automated Trade Desk & Quantitative Signal Engine |
| **TM Tools** | `http://localhost:4002` | Desktop utility app: Browser Hub, Downloader, FFmpeg tools, AI console |
| **TM Studio** | `http://localhost:4003` | TMCut video editor (repo `tm-studio`) |

---

## 3. Cấu Hình Biến Môi Trường (.env)

### 3.1. Cấu hình tại `tm-hub/.env`
Đảm bảo file `.env` trong thư mục `tm-hub` có đầy đủ các thông số sau:

```env
PORT=4000
HOST=0.0.0.0
APP_ID=tm-hub_hqmnrn

# Supabase (Database quan hệ: Auth, Roles, Routes, Public Configs)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-role-key

# Khóa JWT Secret dùng chung cho toàn bộ hệ sinh thái
AUTH_JWT_SECRET=your-shared-jwt-secret
AUTH_ACCESS_TOKEN_EXPIRY=15m
AUTH_REFRESH_TOKEN_EXPIRY=7d
CONFIG_ENCRYPTION_KEY=your-32-bytes-hex-encryption-key-64-characters

# 1. MongoDB Audit Logging (Pool: logger)
MONGODB_LOG_URI=mongodb://admin:pass@host:27017/...?replicaSet=...
MONGODB_LOG_DB_NAME=tm-hub-logs
MONGODB_LOG_MODE=compact
MONGODB_LOG_TTL_DAYS=0

# 2. MongoDB App Data & Custom Documents (Pool: app_data)
MONGODB_APP_URI=mongodb+srv://admin:pass@cluster0...mongodb.net
MONGODB_APP_DB_NAME=tm-hub-app
```

### 3.2. Cấu hình tại `tm-tools/.env`

```env
PORT=4002
APP_PORT=3456
APP_URL=http://localhost:4002

# Kết nối Control Plane TM Hub
AUTH_PROVIDER=hub
NUXT_PUBLIC_HUB_URL=http://localhost:4000
NUXT_PUBLIC_HUB_APP_ID=tm-tools_bbx58v

# Phải trùng khớp với AUTH_JWT_SECRET của tm-hub/.env
AUTH_JWT_SECRET=your-shared-jwt-secret
```

> **Lưu ý bảo mật**: không commit `.env`, không dán giá trị thật của `AUTH_JWT_SECRET` vào tài liệu hay UI. Khóa AI provider được quản lý tập trung tại TM Hub, tm-tools không giữ API key AI cục bộ.

### 3.3. Cấu hình tại `tm-studio/.env`

```env
PORT=4003
APP_PORT=3457
APP_URL=http://localhost:4003

AUTH_PROVIDER=hub
NUXT_PUBLIC_HUB_URL=http://localhost:4000
NUXT_PUBLIC_HUB_APP_ID=tm-studio_749app
AUTH_JWT_SECRET=your-shared-jwt-secret
```

---

## 4. Khởi Tạo Cơ Sở Dữ Liệu & Seed Dữ Liệu Mẫu

Chạy lệnh seed từ thư mục `tm-hub` để đồng bộ quyền, routes và tài khoản admin/developer:

```bash
cd d:\Applications\tm-hub

# Seed toàn bộ Hub, Tools, Studio và Trading:
pnpm seed

# Hoặc seed riêng từng app:
pnpm seed --app=tools
pnpm seed --app=studio
```

Tài khoản mặc định được khởi tạo:
* **Admin**: `admin@example.com` / `admin123456`
* **Root**: `root@example.com` / `root123456`

> Seed ghi trực tiếp vào Supabase/MongoDB dùng chung — chỉ chạy khi thực sự muốn cập nhật routes/roles của môi trường đó.

---

## 5. Khởi Chạy Ứng Dụng

### Terminal 1: TM Hub Control Plane
```bash
cd d:\Applications\tm-hub
pnpm dev            # http://localhost:4000
```

### Terminal 2: TM Tools
```bash
cd d:\Applications\tm-tools
pnpm dev:electron   # Nuxt + Electron (Browser Hub, FFmpeg tools)
# hoặc chỉ giao diện web:
pnpm dev            # http://localhost:4002
```

### Terminal 3: TM Studio (khi làm việc với video)
```bash
cd d:\Applications\tm-studio
pnpm dev:electron   # http://localhost:4003
```

---

## 6. Xem & Quản Lý Tài Liệu Trên Giao Diện

### 6.1. Xem tài liệu trực tiếp trên TM Tools
* Truy cập menu: **System** > **Docs** (`/system/docs`).
* Trang docs tự động tải dữ liệu thời gian thực từ TM Hub (`GET /api/v1/apps/:appId/docs`).
* Nếu TM Hub offline, hệ thống dùng bản fallback tại `shared/docs/content.ts`.

### 6.2. Quản lý tài liệu động trên TM Hub
* Đăng nhập TM Hub bằng tài khoản Admin.
* Vào **Administration** > **Nội dung & Tài liệu** (`/administration/content`).
* Tại đây có thể seed tài liệu từ code vào MongoDB (`tm-hub-app`), chỉnh sửa JSON/HTML/Markdown và lưu — tm-tools nhận bản mới mà không cần build lại.

---

## 7. Kiểm Tra Chất Lượng

```bash
cd d:\Applications\tm-tools
pnpm typecheck      # vue-tsc
pnpm test:unit      # tests/unit/run-all.mts
pnpm lint           # eslint
```

## 8. Tài Liệu Tham Khảo Mở Rộng

* 📖 **[Hướng Dẫn Sử Dụng TM Tools](./user-guide.md)** — Browser Hub, Downloader, FFmpeg tools, AI console.
* 🔐 **[AI & Hub Connections](../ai-and-hub-connections.md)** — ai giữ key, hub relay hoạt động thế nào.
* 🌐 **[Browser Platform](../browser-platform/)** — kiến trúc profile chống phát hiện, adapter, IPC, bảo mật.
* 🏛️ **[IAM & Auth Service](../iam-auth-service-architecture.md)** — JWT, refresh, RBAC.
* 🗄️ **[Archive: tài liệu TMCut v1](../archive/2026-10-31-v1-pre-tmcut-extraction/)** — toàn bộ tài liệu video editor trước khi tách repo (chỉ để tham khảo lịch sử).
