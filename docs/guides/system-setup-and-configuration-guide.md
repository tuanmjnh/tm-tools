# Hướng Dẫn Cài Đặt & Cấu Hình Hệ Thống TM Tools

Tài liệu này cung cấp hướng dẫn chi tiết về cách thiết lập môi trường, cấu hình kết nối giữa **TM Tools** và **TM Hub**, thiết lập các API nhà cung cấp Video AI (Runway Gen-3) và cơ sở dữ liệu MongoDB.

---

## 1. Tổng Quan Kiến Trúc

Hệ sinh thái TM Platform hoạt động theo mô hình **Control Plane - Satellite Architecture**:

```
┌────────────────────────────────────────────────────────┐
│                   TM HUB CONTROL PLANE                 │
│                      (Port: 4000)                      │
│                                                        │
│  - Supabase PostgreSQL: IAM, Users, Roles, RBAC Routes │
│  - MongoDB (tm-hub-logs): Audit Logging                │
│  - MongoDB (tm-hub-app): Docs & Dynamic Content        │
└──────────────────────────┬─────────────────────────────┘
                           │ API: useHub() / X-App-Id
                           ▼
┌────────────────────────────────────────────────────────┐
│                  TM TOOLS DESKTOP APP                  │
│                      (Port: 4002)                      │
│                                                        │
│  - Nuxt 4 (UI Framework) + Nuxt UI v4                  │
│  - Electron Main Process (IPC, Video Factory, Runway)  │
│  - TMCut Video Studio, Browser Hub, Automation         │
│  - Menu & Docs được tải động từ TM Hub                 │
└────────────────────────────────────────────────────────┘
```

---

## 2. Phân Bổ Cổng Dịch Vụ (Port Allocation)

| Ứng dụng | Cổng (Port) | Vai trò |
| :--- | :--- | :--- |
| **TM Hub** | `https://tm-hub-app.vercel.app` | Control Plane trung tâm: IAM, Quản trị Roles, Routes, Configs, MongoDB |
| **TM Tools** | `http://localhost:4002` | Desktop Studio: TMCut Timeline, Video Factory, Automation, Profiles |
| **TM Trading** | `http://localhost:4001` | Automated Trade Desk & Quantitative Signal Engine |

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
AUTH_JWT_SECRET=24481429ddef2654285b4906225e7f159e6d08a58105dd1231da4d5d07af90d5
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
Mở file `tm-tools/.env` và thiết lập kết nối tới Hub cùng API sinh video:

```env
PORT=4002
APP_PORT=3456
APP_URL=http://localhost:4002

# Kết nối Control Plane TM Hub
AUTH_PROVIDER=hub
NUXT_PUBLIC_HUB_URL=https://tm-hub-app.vercel.app
NUXT_PUBLIC_HUB_APP_ID=tm-tools_bbx58v
AUTH_JWT_SECRET=24481429ddef2654285b4906225e7f159e6d08a58105dd1231da4d5d07af90d5

# Video Generation API (Runway Gen-3 Alpha)
RUNWAY_API_KEY=key_your_runway_api_key_here
RUNWAY_BASE_URL=https://api.runwayml.com/v1
```

> **Lưu ý**: `AUTH_JWT_SECRET` tại `tm-tools/.env` **phải trùng khớp** với `AUTH_JWT_SECRET` tại `tm-hub/.env` để client xác thực token ngoại tuyến.

---

## 4. Khởi Tạo Cơ Sở Dữ Liệu & Seed Dữ Liệu Mẫu

Chạy lệnh seed từ thư mục `tm-hub` để đồng bộ quyền, routes và tài khoản admin/developer:

```bash
# Di chuyển vào thư mục tm-hub
cd d:\Applications\tm-hub

# Seed toàn bộ Hub, Tools và Trading:
pnpm seed

# Hoặc seed riêng cho tm-tools:
pnpm seed --app=tools
```

Tài khoản mặc định được khởi tạo:
* **Admin**: `admin@example.com` / `admin123456`
* **Root**: `root@example.com` / `root123456`

---

## 5. Khởi Chạy Ứng Dụng

Mở 2 cửa sổ terminal riêng biệt:

### Terminal 1: Chạy TM Hub Control Plane
```bash
cd d:\Applications\tm-hub
pnpm dev
# Server lắng nghe tại: https://tm-hub-app.vercel.app
```

### Terminal 2: Chạy TM Tools (Desktop + Web)
```bash
cd d:\Applications\tm-tools

# Lựa chọn 1: Chạy kèm Electron Desktop (khuyên dùng để sử dụng Video Generation & IPC)
pnpm dev:electron

# Lựa chọn 2: Chỉ chạy giao diện Web
pnpm dev
# Giao diện mở tại: http://localhost:4002
```

---

## 6. Xem & Quản Lý Tài Liệu Trên Giao Diện

### 6.1. Xem tài liệu trực tiếp trên TM Tools
* Truy cập menu: **System** > **Docs** (`/system/docs`).
* Trang docs tự động tải dữ liệu thời gian thực từ TM Hub (`GET /api/v1/apps/:appId/docs`).
* Nếu TM Hub offline, hệ thống tự động sử dụng bản fallback được lưu tại `shared/docs/content.ts`.

### 6.2. Quản lý & tùy biến tài liệu động trên TM Hub
* Đăng nhập TM Hub (`https://tm-hub-app.vercel.app`) bằng tài khoản Admin.
* Vào menu: **Administration** > **Nội dung & Tài liệu** (`/administration/content`).
* Tại đây bạn có thể:
  1. Nhấn nút **"Seed System Docs"** để đưa tài liệu từ code vào lưu trữ tại MongoDB (`tm-hub-app`).
  2. Bấm **Chỉnh sửa** để sửa trực tiếp tài liệu dạng **JSON (Visual Tree Editor)** hoặc **Rich Text HTML/Markdown**.
  3. Bấm **Lưu**: Ngay lập tức TM Tools sẽ nhận được bản cập nhật mới nhất mà không cần build lại code!

---

## 7. Tài Liệu Tham Khảo Mở Rộng

* 📖 **[Hướng Dẫn Sử Dụng TM Tools Cho Người Dùng (User Guide)](./user-guide.md)**: Hướng dẫn chi tiết cách dựng video bằng TMCut Studio, quản lý Browser Profiles chống phát hiện, quản lý Media và sử dụng các công cụ Utilities.
* 🚀 **[Hướng Dẫn Cấu Hình Hệ Thống Assets & Tích Hợp RunwayML (https://dev.runwayml.com)](./assets-and-runwayml-setup-guide.md)**: Hướng dẫn chuyên sâu về kiến trúc quản lý Assets phân tầng, cấu hình API Key Runway Gen-3 Alpha / Turbo và vòng đời sinh video AI tự động.
* 🏪 **[Hướng Dẫn Cấu Hình & Đẩy Asset Lên Marketplace](./asset-marketplace-guide.md)**: Quy trình tạo manifest, kiểm tra bản quyền (license review), tính mã băm SHA-256 và đóng gói asset lên Marketplace.
