# Kế hoạch Tái cấu trúc & Nâng cấp Hệ thống Quản lý Video (Video Tool Suite)

## 1. Giới thiệu & Mục tiêu

Tài liệu này xác định lộ trình tái cấu trúc kiến trúc (Refactoring) và phát triển các tính năng giá trị cao cho công cụ Video của ứng dụng:
1. **Tái cấu trúc kiến trúc (Architecture Refactoring)**:
   - Phân rã file nguyên khối [video.vue](file:///d:/Applications/tm-tools/app/pages/tools/video.vue) (hiện gần 1.600 dòng) thành các Panel chuyên biệt độc lập và composable quản lý Preset `useFfmpegPresets.ts`.
   - Đưa trang `video.vue` về kích thước chuẩn (~200 dòng), đóng vai trò là Dashboard Router kết nối các Panels với `useToolTaskManager`.
2. **Phát triển tính năng mới (Feature Enhancements)**:
   - **Công cụ Âm thanh Video (Audio Tool Panel)**: Tách lấy nhạc (Extract Audio MP3/WAV/AAC), Tắt tiếng (Mute Video), Thay thế hoặc Trộn nhạc nền mới (BGM Replace/Mix).
   - **Trình xem trước video thành phẩm (In-App Video Preview Modal)**: Bấm xem ngay video sau khi hoàn thành trong modal ứng dụng mà không cần mở thư mục ngoài Windows.

---

## 2. Thiết kế Kiến trúc Tái cấu trúc (Component Modularization)

```
app/
 ├── composables/
 │    └── useFfmpegPresets.ts             <-- [MỚI] Quản lý state & CRUD Preset (load, save, delete, apply, config)
 ├── components/tools/video/
 │    ├── SinglePanel.vue                 <-- [MỚI] Form & logic Render 1 video
 │    ├── BatchPanel.vue                  <-- [MỚI] Form & logic Render hàng loạt (Glob Pattern)
 │    ├── CreatorPanel.vue                <-- [MỚI] Form & logic Image2Video từ thư mục con
 │    ├── AudioToolPanel.vue              <-- [MỚI] Trích xuất Audio, Tắt tiếng, Ghép nhạc nền
 │    ├── PreviewModal.vue                <-- [MỚI] Modal phát video xem trước kết quả in-app
 │    ├── JoinPanel.vue                   <-- (Đã có) Nối video/ảnh (Files, Root, Subfolder)
 │    └── SplitPanel.vue                  <-- (Đã có) Cắt video đa chế độ
 └── pages/tools/video.vue                <-- [TỐI ƯU HÓA] Router trung tâm (~200 dòng)
```

---

## 3. Chi tiết Kế hoạch Thực hiện (Proposed Changes)

### Giai đoạn 1: Tách Composable & Các Panel Hiện Tại (Refactoring)

#### 1. Tạo Composable: `app/composables/useFfmpegPresets.ts`
- Quản lý reactive state của Preset: `presets`, `selectedPresetId`, `selectedPresetTitle`, `config`.
- Các hàm: `loadPresets()`, `savePreset()`, `deletePreset()`, `applyPreset()`, `resetConfig()`.
- Giúp chia sẻ cấu hình Preset mượt mà giữa trang chính và các Panel mà không bị trùng lặp mã nguồn.

#### 2. Tạo `app/components/tools/video/SinglePanel.vue`
- Chứa form chọn 1 file video đầu vào và file đầu ra.
- Tự động probe kích thước video (`getMediaSize`, `probeMedia`).
- Nút khởi chạy và emit `submit(tasks: ToolTask[])`.

#### 3. Tạo `app/components/tools/video/BatchPanel.vue`
- Chứa form nhập mẫu glob `batchPattern` (hỗ trợ chọn folder để sinh pattern `*.mp4`).
- Mẫu tên tệp đầu ra `batchOutputPattern` (`{dirname}/{name}_rendered.{ext}`).
- Cấu hình số luồng `batchThreads`.
- Danh sách xem trước các file tìm được (`batchMatchedFiles`).
- Emit `submit(tasks: ToolTask[])`.

#### 4. Tạo `app/components/tools/video/CreatorPanel.vue`
- Chuyển toàn bộ form Image2Video từ thư mục con:
  - Chọn thư mục cha đầu vào, thư mục xuất, bộ lọc extension (`.jpg`, `.png`, `.webp`...).
  - Độ phân giải (Resolution: 9:16 dọc, 16:9 ngang, 1:1 vuông), FPS (24, 30, 60).
  - Thời lượng mỗi ảnh (`minDuration` - `maxDuration`), hiệu ứng chuyển cảnh `xfade` (kèm modal tùy biến `TransitionsModal.vue`), zoom effect, nhạc nền `bgMusic`, nền mờ `blurBg`.
- Emit `submit(tasks: ToolTask[])`.

#### 5. Thu gọn [app/pages/tools/video.vue](file:///d:/Applications/tm-tools/app/pages/tools/video.vue)
- Giữ vai trò là Dashboard Controller:
  - Hộp chọn chế độ `USelectMenu` gọn gàng (Single, Batch, Join, Split, Creator, Audio).
  - Khung xem trước trực quan (`ToolsVideoFramePreview`) ở cột phải.
  - Cấu hình mã hóa GPU (`detectGpuSupport`, chọn `selectedEncoder`).
  - Trình quản lý tiến trình `ToolsTaskManagerPanel` và nút lịch sử `ToolsVideoHistorySlideover`.
  - Giảm kích thước file từ 1.600 dòng xuống chỉ còn ~200 dòng.

---

### Giai đoạn 2: Phát triển Tính năng Mới (Feature Implementation)

#### 1. Backend Engine & IPC: [electron/tools/ffmpeg.controller.cjs](file:///d:/Applications/tm-tools/electron/tools/ffmpeg.controller.cjs)
- **`buildAudioToolArgs(input, output, mode, options)`**:
  - `extract`: `-vn -c:a aac -b:a 192k` (hoặc `-c:a libmp3lame -q:a 2` cho MP3).
  - `mute`: `-c:v copy -an`.
  - `replace_bgm`: `-i input.mp4 -i music.mp3 -c:v copy -map 0:v:0 -map 1:a:0 -shortest`.
  - `mix_bgm`: Trộn audio gốc và nhạc nền qua filter `amix=inputs=2:duration=first:dropout_transition=2`.
- Cập nhật `resolveTasks` xử lý `operation: 'audio_tool'`.

#### 2. UI Component: `app/components/tools/video/AudioToolPanel.vue`
- Chọn file video hoặc folder video.
- Chọn tác vụ:
  - Trích xuất âm thanh (Extract Audio sang MP3, AAC, WAV, M4A).
  - Tắt tiếng video (Mute Video).
  - Thay thế âm thanh bằng nhạc nền mới (Replace Audio).
  - Trộn thêm nhạc nền (Mix Background Music) với thanh trượt chỉnh âm lượng.
- Emit `submit(tasks: ToolTask[])`.

#### 3. In-App Video Preview Modal: `app/components/tools/video/PreviewModal.vue`
- Modal hiển thị trình phát video HTML5 (`<video controls autoplay class="w-full max-h-[70vh] rounded-lg">`).
- Hỗ trợ phát trực tiếp file video cục bộ bằng giao thức `atom://` hoặc path của Electron.
- Nút Play/Eye tích hợp vào `ToolsTaskManagerPanel.vue` và `HistorySlideover.vue`.

---

## 4. Đa ngôn ngữ (i18n)
Bổ sung các khóa dịch vào `i18n/locales/vi.json` và `i18n/locales/en.json`:
- Các khóa cho Audio Tool (`tools.audioTool`, `tools.extractAudio`, `tools.muteVideo`, `tools.replaceAudio`, `tools.mixAudio`...).
- Các khóa cho In-App Preview (`tools.previewResult`, `tools.playVideo`...).

---

## 5. Kế hoạch Kiểm tra (Verification Plan)

1. **TypeScript Typecheck**:
   ```bash
   pnpm typecheck
   ```
   *Yêu cầu*: 0 lỗi type.
2. **ESLint**:
   ```bash
   pnpm eslint app/pages/tools/video.vue app/components/tools/video/*.vue app/composables/useFfmpegPresets.ts electron/tools/ffmpeg.controller.cjs
   ```
   *Yêu cầu*: 0 lỗi cú pháp và định dạng.
3. **Kiểm tra chức năng thực tế**:
   - Render đơn & Render hàng loạt hoạt động chính xác sau khi tách panel.
   - Trích xuất audio và tắt tiếng video tạo ra file chuẩn.
   - Modal xem trước phát video mượt mà ngay trong ứng dụng.
