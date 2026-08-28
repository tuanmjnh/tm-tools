# Kế hoạch chi tiết: Port Media Manager + Input components (nuxt4-cms → tm-tools)

Plan này ghi lại toàn bộ mục tiêu, tiến độ, và các bước **còn lại** để hoàn tất việc port
bộ quản lý media (Cloudinary file manager + tab "Local" link history) và 6 input components
(`InputIcon`, `JsonEditor`, `QrCode`, `Barcode`, `CodeInput`, `IconSelector`) từ repo
`nuxt4-cms` sang `tm-tools`.

---

## 1. Mục tiêu tổng quan

| Hạng mục | Mô tả |
|----------|-------|
| Tab **Cloudinary** | Cho phép duyệt cây thư mục, chọn/upload/rename/delete file, tạo folder, xem trước qua Cloudinary Admin API |
| Tab **Local** | "Link history" — lịch sử các link đã dán (localStorage), hiển thị dạng grid, xuất được sử dụng. Không phải local media thật |
| 6 Input components | `InputIcon`, `JsonEditor`, `QrCode`, `Barcode`, `CodeInput`, `IconSelector` |
| Route | Top-level `/media`, icon `i-lucide-images`, label i18n `nav.media` |
| Đấu nối | Backend Nitro + Cloudinary SDK, RBAC, seed route, i18n EN/VI |

**Quyết định kiến trúc đã chốt**
- Không dùng Pinia — dùng composable thuần.
- Link history: `useLocalStorage('media-link-history')`, cap 50 phần tử.
- `useCloudinary` đặt ở `app/composables/` (top-level) vì Nuxt KHÔNG auto-import subfolder
  cấu hình `app/composables/services/`.

---

## 2. Trạng thái hoàn thành

### 2.1 Dependencies đã cài
- `easyqrcodejs 4.6.2`
- `jsbarcode 3.12.3`
- `json-editor-vue 0.19.1`
- `vanilla-jsoneditor 3.13.0`
- Cloudinary SDK: đã có sẵn

### 2.2 Đã tạo (new files)
| File | Vai trò |
|------|---------|
| `app/shared/types/cloudinary.d.ts` | Namespace `Cloudinary`: `IFileAttach`, `IResource`, `IFolder`, `UploadedResponse`, `IResponseSignature/Folders/Asset`, v.v. Các field nullable cho phép `IFileAttach` |
| `app/composables/useMediaStore.ts` | Link history: `useLocalStorage('media-link-history')`, `addHistory/removeHistory/clearHistory`, cap 50 |
| `app/composables/useCloudinary.ts` | `fetchConfig/getSignature/uploadToCloudinary/getOptimizedUrl/getVideoThumbnail/listFolders/listFiles/createFolder/deleteFolder/deleteFile/renameFile` |
| `server/modules/media/cloudinary.service.ts` | `getCredentials/getInstance/listFolders/listResources/getSignature/deleteResources/deleteFolder/createFolder/renameResource` |
| `server/api/media/config.get.ts` | Trả `{ succeeded, data: { cloudinary: { connected, cloudName, uploadPreset, folder } } }` |
| `server/api/media/cloudinary/signature.get.ts` | Trả signature + `cloudName/apiKey/preset/folder` |
| `server/api/media/cloudinary/files/index.get.ts` | List resources (pagination) |
| `server/api/media/cloudinary/files/rename.put.ts` | Rename file |
| `server/api/media/cloudinary/files/[id]/index.delete.ts` | Delete file |
| `server/api/media/cloudinary/folders/index.get.ts` | List folder tree (map `path` + `hasChildren: true`) |
| `server/api/media/cloudinary/folders/index.post.ts` | Create folder |
| `server/api/media/cloudinary/folders/[folder].delete.ts` | Delete folder |
| `server/api/icons.get.ts` | Lucide + simple-icons, pagination cursor |
| `app/pages/media.vue` | Trang tabs Local/Cloudinary |

### 2.3 Config / i18n / RBAC đã sửa
- `nuxt.config.ts`: thêm `imports.dirs: ['shared/utils']`.
- `server/modules/auth/seed-data.ts`:
  - Thêm route `/media` (top-level, `nav.media`, `i-lucide-images`, sort 4).
  - Re-sort các route khác (tools=5, admin=6, settings=7, system=8).
  - Thêm role admin: `{ module: 'media', actions: ['read','write','delete'] }`.
- `server/middleware/rbac.ts`: thêm `'/api/media': 'media:read'` vào permissionMap.
- `i18n/locales/{en,vi}.json`:
  - Merge từ reference: groups `media`, `input_icon`, `icon_selector`, `confirm`, `products`, `common.*`, `error.*`.
  - `nav.media` = "Media".
  - Thêm thủ công: `common.copy_url`, `error.invalid_barcode`, `input_icon.svg_copied`, `products.generated_content`, `common.confirm_delete`.

### 2.4 Components đã port & adapt
- Adapt conventions tm-tools (`$t()` → `t()` từ `useI18n()`; auth server; emits tuple-type; không `any`):
  - `cloudinary/Index.vue`, `cloudinary/CloudUpload.vue`
  - `media/UploadReview.vue` (folder default `''`), `media/InputImageLink.vue`
  - `media/Gallery.vue`, `media/ImageCard.vue`, `media/ImagePreview.vue`
  - `media/ConfirmModal.vue`, `media/MediaVisual.vue`, `media/UploadCard.vue`
  - `cloudinary/FileGrid.vue`, `cloudinary/FolderTree.vue`
  - `inputs/Barcode.vue`, `inputs/IconSelector.vue`, `inputs/JsonEditor.vue`, `inputs/QrCode.vue`, `inputs/InputIcon.vue`
  - `code/QrCodeBuilder.vue`

### 2.5 Lint cleanup đã hoàn tất
- Chuyển toàn bộ `defineEmits` function-overload → tuple-syntax (trừ `load-children` cần kiểu trả về).
- Thay mọi `any`:
  - `catch (error: any)` → `catch (error)` + `error instanceof Error`.
  - ModelValue Gallery → `unknown` + narrowing.
  - Props `any` → interface cụ thể / `Record<string, unknown>`.
  - `useRuntimeConfig().public as any` → `unknown as {...}`.
- Bỏ biến unused (`isNoFile`, `getFormattedDate`, `props`, `open` slot var, `isActuallyImage`, `isBarcodeInputOpen`, `error`).
- Còn lại **7 warning `vue/no-v-html`** ở `ConfirmModal/ImageCard/ImagePreview/MediaVisual/IconSelector/InputIcon`
  — đây là vị trí render SVG đã qua `sanitizeSvg()`, cố ý giữ (warnings không làm fail lint).

---

## 3. VIỆC CÒN LẠI (đang dở dang)

### 3.1 ⚠️ 5 lỗi typecheck hiện tại (ƯU TIÊN CAO)

`pnpm typecheck` còn fail do **namespace `Cloudinary` không visible trong tsconfig server**:

| File | Dòng | Lỗi |
|------|------|-----|
| `server/api/media/cloudinary/folders/index.get.ts` | 15 | `Cannot find namespace 'Cloudinary'` (dùng `Cloudinary.IFolder`) |
| `server/modules/media/cloudinary.service.ts` | 32, 35 | `Cannot find namespace 'Cloudinary'` (chuyển `any[]` → `Cloudinary.IFolder[]`) |
| `server/api/media/cloudinary/files/index.get.ts` | 20 | `Property 'error' does not exist on type 'Error \| {...}'` |
| `server/api/media/cloudinary/folders/index.get.ts` | 24 | `Property 'error' does not exist on type 'Error \| {...}'` |

**Nguyên nhân:** `.d.ts` đặt trong `app/shared/types/` chỉ nằm trong `tsconfig.server`? hiện tại server
không visible namespace đó.

**Các hướng xử lý (chọn 1):**

- **Hướng A (khuyên dùng):** Trong server, KHÔNG dùng namespace `Cloudinary`; thay bằng type inline
  hoặc cast `as { folders: Array<{ name: string; path: string }> }`:
  - `cloudinary.service.ts`: bỏ `Cloudinary.IFolder[]` → `as { folders: unknown[] }` rồi cast ở route, hoặc khai báo interface local trong service `interface CloudinaryFolderRow { name: string; path: string }`.
  - `folders/index.get.ts`: không cần `Cloudinary.IFolder`, dùng `Array<{ name: string; path: string }>`.

- **Hướng B:** Đặt file `.d.ts` vào thư mục `types/` (hoặc `shared/types/`) nằm trong scope cả app lẫn server
  (xem cách `types/auth.ts`, `types/rbac.ts` đang được import 2 nơi). Di chuyển `cloudinary.d.ts` và
  cấu hình `types` include cho server tsconfig. — Rủi ro: phải sửa lại toàn bộ reference `Cloudinary.*` ở app.

- **Hướng C:** Tạo `server/types/cloudinary.d.ts` khai báo duplicate namespace chỉ cho server.

**Sau khi chọn:** chạy lại `pnpm typecheck` cho tới khi 0 lỗi.

### 3.2 Hoàn thiện lint phần cấu trúc catch vẫn còn `error.error`
- Đang đổi `catch (error: any)` → `catch (error)` kèm `error instanceof Error ? ...` nhưng một số route
  dùng `error.statusCode`/`error.error?.message` → union type phức. Cần tối ưu helper kiểm tra `statusCode`
  (vd function `getErrorMessage(error)` / `isH3Error(error)`) đặt chung để 4 route dùng lại.

### 3.3 Test thủ công (chưa làm)
- `pnpm dev` → login với `root@example.com/root123` (hoặc `admin`).
- Mở `/media`:
  - Tab **Cloudinary**: connect (cần cloud_name/api_key/api_secret hợp lệ trong `.env`), upload, duyệt cây folder, rename/delete, preview.
  - Tab **Local**: dán link → thấy trong link history; delete từng link; clear all.
  - Mở 1 trang product (nếu có) để test 6 input components `InputIcon/JsonEditor/QrCode/Barcode/CodeInput/IconSelector`.
- Đảm bảo role admin có `media:read/write/delete`; role khác không thấy `/media` khi render menu.

### 3.4 Kiểm tra chéo
- `pnpm dev` không có lỗi console (đặc biệt Cloudinary fetch).
- `pnpm lint` toàn repo: vẫn còn lỗi **pre-existing** không liên quan (vd
  `server/modules/database/app.ts`, `shared.ts`... `no-explicit-any`) — KHÔNG thuộc phạm vi port, bỏ qua.
- Đảm bảo không vỡ trang khác (register/login/settings).

---

## 4. Checklist kết thúc

- [ ] `pnpm typecheck` → 0 lỗi (đã pass ở giai đoạn trước, MỚI fail do namespace server — đang sửa ở 3.1)
- [ ] `pnpm exec eslint <các file mới>` → 0 error (chấp nhận warning `v-html`)
- [ ] `pnpm dev` chạy được, `/media` render đúng 2 tab
- [ ] Cloudinary upload + folder tree + rename/delete hoạt động (với creds hợp lệ)
- [ ] Link history ghi/đọc được sau refresh
- [ ] 6 input components dispatch đúng `v-model`
- [ ] Không đăng ký route `settings` / không phá menu hệ thống

---

## 5. Files liên quan

**Đã tạo mới:** `app/shared/types/cloudinary.d.ts`, `app/composables/useMediaStore.ts`,
`app/composables/useCloudinary.ts`, `server/modules/media/cloudinary.service.ts`,
`server/api/media/**`, `server/api/icons.get.ts`, `app/pages/media.vue`.

**Đã sửa:** `nuxt.config.ts`, `server/modules/auth/seed-data.ts`, `server/middleware/rbac.ts`,
`i18n/locales/en.json`, `i18n/locales/vi.json`, các file component liệt kê ở 2.4.

**Reference nguồn:** `D:\Applications\nuxt4-cms\app\pages\settings\media\index.vue`,
`app\composables\services\useCloudinary.ts`, `server\api\v1\admin\media\**`,
`server\services\cloudinary.service.ts`, `app\stores\media.ts`,
`shared\types\common\cloudinary.d.ts`, `server\api\v1\public\icons\index.get.ts`,
`D:\Applications\nuxt4-cms\i18n\locales\{en,vi}.json`.