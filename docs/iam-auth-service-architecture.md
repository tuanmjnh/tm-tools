# Hướng Dẫn Tích Hợp TM-Tools Với TM-Hub (Control Plane)
> **Ứng dụng:** `tm-tools` (Electron + Nuxt 4 Desktop Application)  
> **Hệ thống điều phối trung tâm:** `tm-hub` (`D:\Applications\tm-hub` - Port 4000)  
> **Mã định danh dự án:** `appId = 'tm-tools'`  

---

## 1. Giới Thiệu & Mô Hình Kết Hợp

`tm-hub` đóng vai trò là **Hệ thống Đầu não (Control Plane / Central BaaS)**:
- Quản lý định danh tài khoản, phân quyền RBAC và menu động (`system_routes`) cho `tm-tools`.
- Quản lý toàn bộ cấu hình 3rd-party (`AI_*`, `CLOUDINARY_*`, `FIREBASE_*`, `WEB_PUSH_*`) tập trung trên Supabase.
- **Quyền hạn cấu hình:** Người dùng có vai trò cao nhất (`root`) khi đăng nhập vào `tm-tools` có thể **xem và cập nhật trực tiếp** toàn bộ các cấu hình này từ màn hình Settings của `tm-tools`. `tm-tools` đồng bộ hai chiều với `tm-hub`.
- **Cấu hình máy cục bộ:** Các đường dẫn binary (`TOOLS_FFMPEG_PATH`, `TOOLS_YTDLP_PATH`...) lưu trực tiếp trên máy người dùng qua `electron-store`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             TM-HUB (PORT 4000)                              │
│           Control Plane - Supabase Centralized Database                     │
│  - Lưu Apps, Users, Roles, Dynamic Routes                                   │
│  - Lưu Remote Configs (AI, Cloudinary, Firebase, WebPush)                   │
│  - Media Gateway & Notification Hub (Web Push / FCM)                        │
│  - Endpoint kiểm tra nghiêm ngặt theo appId & quyền root                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (REST API HTTPS / Localhost)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TM-TOOLS (ELECTRON DESKTOP)                        │
│  - NUXT_PUBLIC_HUB_APP_ID = 'tm-tools'                                      │
│  - NUXT_PUBLIC_HUB_URL = 'http://localhost:4000'                           │
│  - Frontend gọi trực tiếp tới TM-Hub qua useHub (Auth, Media, Push, RBAC)  │
│  - Backend cục bộ chỉ giữ lại ffmpeg, yt-dlp, network adapter và app DB    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Kế Hoạch Vận Hành

### A. Hệ thống Trung Tâm `tm-hub` (`D:\Applications\tm-hub`)
1. **Khởi tạo Database Supabase:**
   - Mở Supabase SQL Editor và chạy file `D:\Applications\tm-hub\supabase\schema.sql`.
2. **Cấu hình biến môi trường (`.env`):**
   - Điền `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`.
   - Thiết lập `AUTH_JWT_SECRET`.
3. **Chạy Seed Data:**
   - Chạy lệnh `pnpm seed` để tạo sẵn:
     - `appId: tm-tools`
     - Tài khoản root: `root@example.com` / `root123`
     - Phân quyền `root` (full access `*`) và `admin`
     - Menu động ban đầu (`/`, `/inbox`, `/customers`, `/media`, `/chat`)
     - Cấu hình mặc định cho `tm-tools` (`AI_*`, `CLOUDINARY_*`)
4. **Khởi chạy Server TM-Hub:**
   - `pnpm dev` (Chạy trên cổng `http://localhost:4000`).

---

### B. Kiến Trúc Clean App Trên `tm-tools` (`D:\Applications\tm-tools`)

#### 1. Mô hình gọi trực tiếp từ Frontend (`useHub`)
Toàn bộ frontend composables trong `tm-tools` gọi trực tiếp tới `tm-hub` qua composable `useHub.ts`, tự động đính kèm `X-App-Id: tm-tools` và Bearer token:
- **Auth:** `useAuth.ts` gọi `/api/v1/auth/login`, `/register`, `/refresh`, `/me`, `/logout`.
- **Dynamic Menu:** `useNavMenu.ts` gọi `/api/v1/auth/routes`.
- **Media Gateway:** `useCloudinary.ts` gọi `/api/v1/apps/tm-tools/media/*`.
- **Notification Hub:** `useNotify.ts` & `useWebPush.ts` gọi `/api/v1/apps/tm-tools/notifications/*`.
- **Users & RBAC:** `useUsers.ts` & `useRBAC.ts` gọi `/api/v1/apps/tm-tools/users` & `/roles`.
- **Remote Configs:** `config.vue` gọi `/api/v1/apps/tm-tools/configs` (chỉ user `root` mới được xem/sửa cấu hình bí mật).

#### 2. Dọn dẹp Clean Backend của `tm-tools`
Toàn bộ các proxy endpoints và backend modules trung gian đã được gỡ bỏ sạch sẽ:
- Đã xóa `server/api/auth/`, `media/`, `notifications/`, `users/`, `rbac/`, `system/routes/`, `system/config.*`.
- Đã xóa `server/modules/auth/`, `media/`, `notification/`, `rbac/`, `routes/`, `storage/`, `users/`, `config/`.
- `server/` của `tm-tools` hiện chỉ giữ lại các tác vụ đặc thù desktop cục bộ:
  - `youtube`: công cụ tải video/audio bằng binary yt-dlp / ffmpeg.
  - `system/network`: tra cứu thông tin card mạng phần cứng của máy tính.
  - `database/app.ts`: database dữ liệu app cục bộ.
  - Mock endpoints cục bộ: `chat`, `customers`, `icons`, `mails`, `members`, `health`.

---

## 3. Quy Trình Khai Báo Thêm App Mới Trong Tương Lai
Khi bạn muốn tạo thêm một app mới (ví dụ: `tm-actions`, `tm-browsers`, hoặc app Web SaaS):
1. Truy cập giao diện TM-Hub tại `http://localhost:4000/apps`.
2. Bấm **"Tạo Dự Án Mới"** -> Nhập `appId` (ví dụ: `tm-browsers`) và Tên ứng dụng.
3. TM-Hub tự động cấp `secret_key` và tạo không gian dữ liệu riêng.
4. Trên app mới, chỉ cần khai báo:
   ```env
   NUXT_PUBLIC_HUB_APP_ID=tm-browsers
   NUXT_PUBLIC_HUB_URL=http://localhost:4000
   ```
5. App mới lập tức sở hữu hệ thống đăng nhập, phân quyền, cấu hình động, Media Gateway và Notification Hub mà **không cần viết lại một dòng code backend nào!**
