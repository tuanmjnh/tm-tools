# TM Tools – Managed Document Workspace & Universal Explorer (v2)

> **Tài liệu giao cho AI Coding Agent triển khai trực tiếp trên codebase hiện tại.**
>
> Phạm vi: chuẩn hóa cách quản lý file, cây thư mục và giao diện 2 side trong TM Tools; áp dụng trước cho PDF Studio và có khả năng mở rộng cho Word, Excel, hình ảnh, OCR, AI Extraction, chuyển đổi và xuất dữ liệu.
>
> **Yêu cầu quan trọng:** dự án hiện đã có UI, component và chức năng PDF đang hoạt động. AI phải audit code hiện tại trước, tái sử dụng tối đa component/logic sẵn có, chỉ tạo component mới khi thực sự thiếu. Không được tự ý viết lại module hoặc thay đổi kiến trúc hiện tại chỉ vì muốn làm sạch code.
>
> **Kiến trúc bắt buộc (đã xác minh với code):** PDF Studio chạy như Nuxt SPA (`ssr: false`) trên cổng 4002; **Nitro server của chính app là privileged filesystem owner** và renderer chỉ nói chuyện qua `/api/v1/pdf/*`. Electron chỉ bọc web app, `electron/ipcPolicy.cjs` không cấp kênh PDF nào. Mọi yêu cầu "Main Process / IPC" trong tài liệu này phải đọc là "Nitro server + `server/modules/pdf/*`"; không tạo thêm IPC channel cho PDF.

## Trạng thái tài liệu

Đây là **v2**, thay thế v1 (đã chuyển vào
[`docs/archive/2026-11-05-workspace-spec-v1/`](../archive/2026-11-05-workspace-spec-v1/README.md)).
v1 mô tả layout `01-sources/…` và filesystem qua Electron IPC — cả hai đều không
đúng với repo này; v2 đã sửa lại theo code.

Phần lớn spec đã được giao. Bảng dưới đây là ảnh chụp 2026-11-05; chi tiết từng
phase ở [`WORKSPACE-UPGRADE-PLAN.md`](./WORKSPACE-UPGRADE-PLAN.md), bằng chứng
gate ở [`VERIFICATION.md`](./VERIFICATION.md).

| Hạng mục | Trạng thái |
|---|---|
| Area registry, `outputMapping`, report/repair | Đã có |
| Area root bất biến, subfolder sửa được | Đã có |
| Explorer 2 side + splitter/collapse/persist | Đã có |
| Library cây 7 area | Đã có |
| Cây đầy đủ trên mọi trang tool | **Chưa** — mỗi trang chỉ có cây area của mình |
| Toolbar file (search/sort/density) | Đã có |
| Multi-select, bulk, grid view | **Chưa** |
| Data Flow Note `Đầu vào → Đầu ra` | **Chưa** |
| Viewer: PDF/ảnh/bảng/docx/json/text | Đã có |
| Viewer: zoom/rotate/thumbnail/search/sheet-nav | **Chưa** |
| Atomic write, audit log | **Chưa** (symlink/junction guard đã có) |
| Lazy tree theo node | **Chưa** |

---

## 0. Chỉ dẫn bắt buộc cho AI Coding Agent

### 0.1. Làm việc trên codebase hiện tại

Trước khi chỉnh sửa:

1. Đọc cấu trúc repository, `package.json`, `nuxt.config.ts`, `electron/` (main + preload + `ipcPolicy.cjs`), `server/api/v1/pdf/*`, `server/modules/pdf/*`, router, composables, UI framework và quy ước đặt tên hiện tại.
2. Kiểm tra các trang PDF Studio đang tồn tại, đặc biệt các trang tương ứng với giao diện trong ảnh người dùng cung cấp:
   - Thư viện PDF (`/pdf/library`).
   - Tách & Ghép (`/pdf/split`).
   - Ảnh PDF (`/pdf/images`).
   - Xuất PDF (`/pdf/export`).
   - Nhập PDF (`/pdf/import`).
   - Bóc tách bảng giá bằng AI (`/pdf/extract`).
3. **Bắt buộc kiểm kê toàn bộ component hiện có trong `app/components/pdf`.** Đọc source của các component liên quan, xác định props, emits/events, slots, composables, store và dependency đang dùng.
4. Tìm các component dùng chung ở ngoài `app/components/pdf` (layout, sidebar, card, table, dropdown, dialog, tooltip, toast, file icon, viewer, upload, progress, empty state, `HeTreeMenu`) để tránh tạo bản sao.
5. Kiểm tra cách ứng dụng hiện đọc thư mục/file trên máy: `server/modules/pdf/paths.ts` (`pdfDirs`, root từ `config.pdf.dir`), `inspect.ts` (`AREA_DIRS`, `resolveAreaFile`), `security.ts` (`safeFileName`, `safeRelativePath`), `directory.ts`, và `runPdf` trong `server/utils/pdfApi.ts`.
6. Chạy các lệnh kiểm tra/build/test sẵn có để ghi nhận baseline trước khi sửa.

### 0.2. Tạo báo cáo audit trước khi code

Tạo tài liệu ngắn **trong `docs/pdf/`** (không tạo `docs/pdf-studio/`), ghi rõ:

- Cấu trúc trang và component hiện có.
- Bảng component: tên, đường dẫn, nhiệm vụ, nơi đang sử dụng, có thể tái sử dụng ở đâu.
- API/filesystem service hiện có (`server/api/v1/pdf/*`, `server/modules/pdf/*`).
- Cấu trúc thư mục thực tế hiện tại và dữ liệu người dùng đang có.
- Các điểm đang hoạt động cần bảo toàn.
- Khoảng trống cần bổ sung.
- Kế hoạch thay đổi và file dự kiến chỉnh sửa.

Mẫu đã có: [`WORKSPACE-AUDIT.md`](./WORKSPACE-AUDIT.md). Tái sử dụng nó thay vì tạo báo cáo thứ hai.

Không dừng lại ở báo cáo. Sau khi audit, tiếp tục triển khai theo tài liệu này. Nếu có điểm chưa rõ trong codebase, chọn phương án ít phá vỡ nhất và ghi lại assumption trong audit.

### 0.3. Quy tắc tái sử dụng component

- Ưu tiên component hiện có trong `app/components/pdf`.
- Nếu component hiện có đáp ứng khoảng 70–80% yêu cầu, hãy mở rộng theo hướng backward-compatible thay vì tạo component mới tương tự.
- Nếu component có nhiều trách nhiệm không phù hợp, tách nhỏ có kiểm soát và giữ component cũ làm wrapper nếu cần tương thích.
- Component dùng chung cho nhiều nhóm tài liệu có thể đặt tại khu vực shared/common theo convention của dự án; không ép component PDF-specific thành global component.
- Component mới liên quan PDF/Document Workspace nên đặt trong `app/components/pdf` và tuân theo cấu trúc/thói quen đặt tên hiện tại.
- Không tạo thêm thư viện UI hoặc design system mới. Tận dụng UI framework và primitive đang cài trong dự án.
- Không tạo component chỉ để bọc một component hiện có mà không mang thêm logic/layout có ý nghĩa.
- Không hard-code dữ liệu file, thư mục, số lượng, trạng thái hoặc đường dẫn chỉ để dựng giao diện.
- Không thay thế toàn bộ giao diện bằng mockup/demo tĩnh. Mọi control hiển thị phải có hành vi thực tế hoặc trạng thái disabled kèm lý do.

---

## 1. Mục tiêu sản phẩm

Xây dựng **Managed Document Workspace** – không gian lưu trữ tài liệu do ứng dụng quản lý, dùng chung cho toàn bộ PDF Studio và các công cụ tài liệu mở rộng.

Nguyên tắc sản phẩm:

1. PDF Studio tiếp tục dùng workspace hiện có tại `.data/pdf`; không tạo workspace PDF thứ hai.
2. Thư mục `.data/pdf/inputs` là vùng input chuẩn cho file **không phải PDF**; `.data/pdf/sources` là vùng PDF gốc. Cả hai đã tồn tại và đang được code đọc/ghi — không tạo thêm `input/` hay `sources/` mới, không gộp hai vùng này.
3. Một cây thư mục thống nhất dùng chung giữa các trang chức năng. *(Đã có component và API chung; library dựng cây 7 area, tool pages hiện chỉ dựng cây của area mình — thống nhất cây đầy đủ là việc còn mở, xem §3.2.)*
4. Các thư mục gốc (area root) do ứng dụng quản lý; người dùng không được đổi tên, di chuyển hoặc xóa **root**, nhưng thư mục con bên trong thì sửa được (trừ legacy `word`).
5. Người dùng thao tác với file bên trong theo quyền được cấp: xem, đọc, thêm, ghi output, đổi tên/xóa file ở những khu vực được cho phép.
6. Mỗi công cụ có thư mục output mặc định riêng; người dùng không phải tự chọn lại đường dẫn cho từng lần chạy.
7. Tài liệu nguồn không bị sửa trực tiếp bởi các thao tác xử lý. Mọi kết quả là artifact/file đầu ra riêng.
8. Các trang giữ mô hình **2 side**: Explorer bên trái, File/Task Workspace bên phải.
9. Các trang có cấu hình tác vụ, tiến trình hoặc kết quả riêng nhưng dùng chung module server (`server/modules/pdf/*`), registry và job extraction hiện có.
10. Preview Window hiện tại phải được giữ và phát triển thành Universal Document Viewer, không viết một cơ chế xem file độc lập khác. *(Hiện giữ nguyên renderer theo MIME; zoom/rotate/search/sheet-nav là việc còn mở.)*
11. Triển khai theo từng phase, có kiểm thử và không làm mất dữ liệu/thay đổi hành vi đang hoạt động.

### Không nằm trong phạm vi tự ý thay đổi

- Không đổi framework frontend hoặc thay kiến trúc filesystem hiện tại nếu audit không chứng minh cần thiết: Nitro server đã là privileged process, không thêm Electron IPC cho PDF.
- Không thay toàn bộ router, state management, database hoặc UI library.
- Không viết lại PDF extraction/AI relay hiện có; chỉ tích hợp nó vào workspace thống nhất.
- Không xóa cây thư mục hiện tại trước khi có migration và kiểm chứng dữ liệu.
- Không đưa nghiệp vụ xử lý PDF vào TM Hub. TM Tools tiếp tục dùng các dịch vụ của TM Hub qua cơ chế kết nối hiện tại.

---

## 2. Mô hình giao diện tổng thể

### 2.1. Giữ mô hình 2 side hiện tại

Giữ nguyên bố cục người dùng đang quen thuộc:

- **Left side – Universal Document Explorer:** cây thư mục (filter + collapse), trạng thái chọn. Không có mode switch.
- **Right side – File List Workspace:** breadcrumb, toolbar (search/sort/density/refresh), một danh sách file dùng chung, actions; cấu hình tác vụ mở qua modal/dialog.

**Data Flow Note (`Đầu vào → Đầu ra`) là mục tiêu, chưa giao** — xem §11.1.1.

Không biến trang thành một dashboard nhiều card rời rạc hoặc bắt người dùng đi qua nhiều bước upload không cần thiết.

### 2.2. Khung layout chuẩn

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ App navigation / sidebar hiện tại                                           │
├────────────────────────────────────────────────────────────────────────────┤
│ Page header: Icon + Tên công cụ + mô tả ngắn + actions cấp trang            │
├────────────────────────┬───────────────────────────────────────────────────┤
│ UNIVERSAL EXPLORER     │ RIGHT WORKSPACE                                    │
│                        │                                                   │
│ Search folders         │ Breadcrumb / current folder                       │
│ Folder tree (theo page)│ Toolbar: Search, Filter, Sort, View, Refresh       │
│                        │ Input → Output flow note                          │
│                        │ File selection / row actions                      │
│                        │ File list                                         │
│                        │ Operation config drawer/dialog khi cần            │
│                        │ Progress / Job status khi có tác vụ                │
└────────────────────────┴───────────────────────────────────────────────────┘
```

Navigation chính của TM Tools và sidebar ứng dụng hiện tại phải được giữ. Universal Explorer là side thứ nhất bên trong nội dung trang, không thay thế app navigation.

### 2.3. Kích thước và hành vi 2 side

Hiện trạng (`WorkspaceShell.vue`):
- Width mặc định **300 px**, splitter kéo được, clamp **220–420 px**.
- Collapse để lại rail **36 px**; chỉ collapse ở desktop (`min-width: 1024px`), dưới ngưỡng đó cây luôn hiển thị.
- Width + collapsed persist trong `localStorage` (`pdf.explorer.width`, `pdf.explorer.collapsed`), không lưu theo tài khoản.
- Right side `min-w-0` + `overflow-y-auto`; shell cao `calc(100vh - 140px)`, tối thiểu 540 px ở desktop.
- Dưới 1024 px grid chuyển 1 cột (cây trên, workspace dưới), không có drawer.

Yêu cầu giữ: không gây tràn ngang, không nested scroll khó dùng, action quan trọng không rơi ngoài viewport.

### 2.4. Giữ design system hiện tại

- Giữ dark theme, màu sắc, typography, border, radius, spacing, icon style và trạng thái hover/focus của TM Tools.
- Không tự đổi theme hoặc tạo style lệch khỏi các trang hiện có.
- Ưu tiên token CSS/theme hiện tại thay vì hard-code màu mới.
- Giữ mật độ thông tin phù hợp desktop: đủ gọn để xem nhiều file nhưng tên, metadata và action vẫn dễ đọc.
- Dùng icon từ bộ icon đang có; không đưa emoji vào UI sản phẩm.
- Tất cả action cần có tooltip/title khi icon-only.
- Có trạng thái focus bàn phím, disabled, loading, error, empty và selected rõ ràng.

---

## 3. Universal Document Explorer – cây thư mục dùng chung

### 3.1. Vai trò

Universal Explorer là một component/hệ thống dùng chung trên tất cả trang thuộc PDF Studio/Document Studio. Nó đọc cây thư mục thực tế từ Managed Workspace, không phải cây menu tĩnh được viết cứng trong từng trang.

### 3.2. Phạm vi cây trên từng trang

**Hiện trạng đã giao (khác với ý định ban đầu của v2):**
- `/pdf/library` dựng **một cây cho cả workspace**: 7 area root (`sources`…`office`) từ `GET /api/v1/pdf/explorer`, mỗi root là một system folder có khoá.
- `/pdf/split`, `/pdf/images`, `/pdf/export`, `/pdf/import`, `/pdf/extract` truyền `dir.tree` — tức **chỉ cây của area mà trang đó đang làm việc** (`sources` cho split/export/extract, v.v.).
- Vì vậy câu "mọi trang mở cùng một cây đầy đủ" **chưa đúng với code**. Nếu muốn đạt điều đó, phải cho các trang tool gọi `getExplorerTrees()` và merge thành virtual root giống Library — đây là việc mở, không được mô tả như đã có.

**Quy tắc chung đang áp dụng:**
- Cùng một component (`WorkspaceShell` → `FolderTree` → `HeTreeMenu`) và cùng semantics tương tác trên mọi trang.
- Không có `Contextual` mode / mode switch; không tự ẩn nhóm folder theo tool.
- Folder đang mở được highlight (`selectedKey`).
- Folder filter (debounce) chạy trên cây mà trang đang có.
- Expand/collapse state nằm trong `HeTreeMenu` (`expandedIds`); hiện **không** persist qua điều hướng trang.

**Mục tiêu nếu tiếp tục:** thống nhất cây đầy đủ trên mọi trang; khi đó bỏ ghi chú "chưa đúng" ở trên.

### 3.3. Header Explorer

Header nên có:
- Tiêu đề ngắn: `Thư mục` hoặc `Explorer`.
- Nút tạo thư mục con nếu vùng hiện tại cho phép.
- Nút refresh/reload metadata.
- Không có mode switch All/Contextual.
- Search folder.
- Nút collapse Explorer.

Không hiển thị các nút tạo/đổi tên/xóa đối với system folder nếu operation không được cho phép.

### 3.4. Folder row

Mỗi node hiện hỗ trợ:
- Expand/collapse bằng chevron riêng (không đổi folder đang xem).
- Icon loại folder: `i-lucide-folder-lock` (sky-blue) cho area root, `i-lucide-folder` (amber) cho subfolder; chuyển sang màu primary khi đang chọn.
- Tên hiển thị (truncate).
- Context menu chỉ gồm action được phép: root → `New subfolder`; subfolder → `New subfolder` / `Rename` / `Delete`. Nút menu chỉ hiện khi hover.
- Tooltip `pdf.tree.systemRootHint` trên root.

Chưa có: badge/file count trong node (dù `fileCount` tồn tại trên node), checkbox hoạt động, drag handle (`:draggable="false"`), trạng thái loading/lỗi per-node.

Quy tắc tương tác (đã có):
- Click **bất kỳ đâu trên thẻ node** (trừ checkbox / chevron / menu) chọn folder và load listing — `cardClickable` của `HeTreeMenu`.
- Click chevron: chỉ expand/collapse.
- Click menu: mở action được phép.
- Navigation (`selectedKey`) và expand (`expandedIds`) là hai state riêng.

### 3.5. Chọn nhiều thư mục — chưa triển khai

Hiện mỗi cây chỉ có **một** folder được chọn: `selectedKey` = `area:relativePath` → `selectedKeys` (mảng một phần tử) truyền xuống `HeTreeMenu`. Checkbox có render nhưng `FolderTree` không bắt `node:select`, nên tick một folder không thay đổi selection — đây là lỗi UX cần sửa (hoặc ẩn checkbox) trước khi làm multi-select.

Nếu triển khai multi-select:
- Checkbox nhiều folder chỉ khi có nghiệp vụ batch theo folder.
- Ctrl/Shift chỉ nếu không làm selection khó hiểu.
- Chọn folder cha **không** đồng nghĩa chọn file con; cần action `Chọn toàn bộ file trong thư mục`.
- Thể hiện indeterminate khi có folder con được chọn.
- Không cho chọn `checkpoints/` hay `.trash/` (vốn không có trong cây).

### 3.6. Lazy loading và hiệu năng — hiện trạng

- Cây **không** lazy theo node: `GET /api/v1/pdf/explorer` trả toàn bộ cây của 7 area trong một response; `GET /directory` trả cây của một area. Đây là gap đã biết.
- Mỗi lần chuyển folder gọi `GET /directory` (không cache metadata).
- Folder filter chạy client-side có debounce; không quét nội dung file.
- Chưa có virtual scrolling; chưa có TTL cache.
- Refresh một nhánh hiện reload cả listing của area đang xem (`dir.loadDirectory`).
- Xử lý folder bị xóa/mất ngoài ứng dụng: hiện trạng thái missing/unavailable và cho phép rescan/reconcile, không crash.

---

## 4. File Explorer – danh sách file bên phải

### 4.1. Header và breadcrumb — hiện trạng

`FileBrowser.vue` render:
- Tiêu đề area + mô tả ngắn (`title` / `description` prop do page truyền).
- Badge số file khi `files.length > 0`; badge trash khi `trashCount > 0`.
- Nút upload (ẩn ở area `readonly`), nút `New folder` (ẩn khi `foldersWritable` false), nút trash, nút refresh.
- Breadcrumb: `Home` + từng crumb; crumb cuối bị disable.

Chưa có: nút "mở folder trong File Explorer" (có `revealLocalPath` trong menu file, không phải ở header), số lượng thư mục.

Lưu ý: `FileBrowser` không tự gọi API — page truyền `folders`/`files`/`breadcrumbs` và nhận emit. Đây là boundary đúng, giữ nguyên.

### 4.2. Toolbar — hiện trạng

Đã có trong `FileBrowser.vue`:
- Search file trong folder hiện tại (client-side, trên listing đã tải).
- Sort: `name` (natural compare) / `modified` / `size`.
- Density: comfortable ↔ compact (icon + tooltip `pdf.browser.density*`).
- Refresh.
- Upload/import khi area cho phép.

**Chưa có:** filter theo type/ngày/dung lượng/status, view mode Grid/Details, pagination, virtual scroll. Không được mô tả như đã có.

### 4.3. Các kiểu hiển thị — hiện trạng

Chỉ có **một** kiểu: danh sách dọc, với hai density (`compact` boolean trong `FileBrowser`).

**Grid** và **Details** chưa triển khai. Nếu thêm, phải giữ nguyên selection và sort hiện có; view mode nên persist theo người dùng (hiện không persist gì cho list).

### 4.4. File row/card

Thông tin đang hiển thị (`FileRow.vue`): icon theo loại file (`pdfFileMeta`), tên, dung lượng (`formatPdfBytes`), thời gian cập nhật (`formatDateTime`), slot `badges`/`meta` do page tự thêm, nút actions riêng của page, menu `…`.

Chưa có: thumbnail, badge nguồn/đầu ra, badge trạng thái processing (slot có sẵn nhưng chưa page nào dùng).

Quy tắc đang áp dụng:
- Click tên file mở preview (`openPdfPreview`) — đây là hành vi hiện tại, khác với "single click chỉ chọn file".
- Context menu phải chuột dùng cùng `menuItems`.
- Chỉ render action hợp lệ với area (`deletable`, `preview` prop).
- Multi-select chưa có — xem §4.5.

### 4.5. Selection và Bulk Actions — chưa triển khai

Hiện mỗi trang thao tác trên **một** file tại một thời điểm qua menu hàng; không có selection toolbar, không có bulk action. Đây là quyết định có chủ đích (xem `WORKSPACE-UPGRADE-PLAN.md`, Phase 3) — không được viết code giả định đã có.

Khi thêm:
- Selection toolbar hiển thị số file đã chọn + Clear.
- Action nghiệp vụ theo tool hiện tại.
- Copy/Move/Delete chỉ khi policy cho phép.
- Không render action không dùng được.

Không đặt quá nhiều nút trực tiếp trên mỗi row. Row chỉ nên có action chính và menu More.

### 4.6. Empty/loading/error states — hiện trạng

Đã có:
- Empty area: `pdf.library.emptyArea` + slot `empty-extra` (import page dùng để liệt kê định dạng hỗ trợ).
- Search không khớp: `pdf.browser.noMatch`.
- Folder filter không khớp: `pdf.explorer.noMatch`.
- Cờ `loading` trên nút refresh và prop của tree.
- Lỗi API: `usePdfStudio` bắt lỗi và `notify.error`; không có error panel/retry riêng trong list.
- File không preview được: `PreviewFile` hiện thông báo / yêu cầu convert.

Chưa có: skeleton loading cho list, error state inline + Retry, phát hiện folder biến mất ngoài app với action rescan.

Yêu cầu khi bổ sung: loading không nhảy layout; error có Retry; không render blank box.

---

## 5. Cấu trúc Managed Workspace

### 5.1. Nguyên tắc

- Một `workspaceRoot` duy nhất: `config.pdf.dir` (override bằng `PDF_DATA_DIR`), đọc trong `server/modules/pdf/paths.ts`.
- Tên folder vật lý là slug ASCII (`sources`, `inputs`, `split`, …), không phụ thuộc ngôn ngữ UI.
- Tên hiển thị nằm ở i18n `pdf.areas.*`, không phải tên folder.
- Root được tạo idempotently bởi `ensurePdfDirs()` khi server khởi động, và `repairWorkspace()` tạo lại root thiếu.
- Chỉ area root được tạo sẵn; subfolder tạo theo nhu cầu.
- Không di chuyển file người dùng khi khởi tạo.

### 5.2. Cấu trúc PDF Workspace – dùng đúng layout đang chạy

**Không tạo thêm `sources/`, `input/` hay `01-sources/` mới.** Layout dưới đây đã tồn tại trên đĩa, đang được `AREA_DIRS` phục vụ và đã có dữ liệu người dùng — không rename, không move, không gộp:

```text
.data/pdf/                    # config.pdf.dir, override bằng PDF_DATA_DIR
├── sources/                  # PDF gốc người dùng upload (ghi được: file + subfolder)
├── inputs/                   # input KHÔNG phải PDF: docx, xlsx, csv, json, xml, ảnh
├── word/                     # legacy .docx cũ — chỉ đọc, vẫn được resolve như input
├── split/                    # thư mục trang tách (mỗi trang một PDF)
├── images/                   # thư mục ảnh trang (PNG mỗi trang)
├── merged/                   # PDF ghép / ảnh→PDF / convert input
├── products/                 # kết quả extraction (csv/json/xlsx/docx/xml)
├── office/                   # file docx/xlsx sinh ra để tải về
├── checkpoints/              # checkpoint extraction — nội bộ, không phục vụ qua API
└── .trash/                   # file/folder xoá mềm — nội bộ, không phục vụ qua API
```

Quy tắc bắt buộc:
- `.data/pdf` là workspace root duy nhất, đọc từ `config.pdf.dir` (xem `server/modules/pdf/paths.ts`); không hard-code `D:\Applications\tm-tools`.
- 8 area phục vụ UI nằm trong `PDF_FILE_AREAS` (`shared/types/pdf.ts`) = `sources, inputs, word, split, images, merged, products, office`. Đây là whitelist duy nhất; `checkpoints` và `.trash` không bao giờ lộ ra API.
- `sources` và `inputs` là **hai vai trò khác nhau**, không phải bản trùng: `sources` chỉ nhận PDF (`isPdfName`), `inputs` nhận docx/xlsx/csv/json/xml/ảnh (`isInputName`). Không gộp, không đổi tên.
- `word` là legacy: `writableFiles: false`, `writableFolders: false`; `resolveAreaFile('inputs', …)` fallback sang `word/` nên vẫn đọc được.
- Tên hiển thị nằm ở i18n `pdf.areas.*` (vi: `PDF gốc`, `Tệp đầu vào`, `Trang tách`, `Ảnh PDF`, `PDF ghép`, `Dữ liệu trích xuất`, `Word & Excel`), không phải tên folder vật lý.
- Không tạo hàng loạt folder rỗng; `POST /api/v1/pdf/workspace/repair` chỉ tạo lại root đã khai báo trong registry.
- Các nhóm `compress/`, `convert/`, `extraction/`, `exports/` trong bản v1 **không tồn tại và không cần tạo**: nén/convert/export hiện ghi vào `merged`/`office`/`products` theo `outputMapping`.

### 5.2.1. Ý nghĩa nguồn và đầu ra

- `inputs/` nhận file không phải PDF; `sources/` nhận PDF upload. Import PDF đi vào `sources/`.
- Các trang xử lý được phép chọn file từ bất kỳ area nào mà user có quyền đọc, không giới hạn ở `sources/`.
- Source file là file được job tham chiếu làm đầu vào; không cần bản sao trong một vùng `sources/` riêng.
- Output của mỗi operation đi vào folder đích cố định theo Output Mapping.
- Nếu một output được dùng làm input cho job tiếp theo, chỉ cần tham chiếu `relativePath`/`area` của output đó; không cần copy ngược lại.

### 5.3. Tổ chức theo dự án/collection

Cần hỗ trợ phân nhóm theo dự án nghiệp vụ như `hoa-phat`, `company-documents`, `contracts`, `invoices` mà không tạo thêm vùng song song.

Đề xuất:
- Trong giai đoạn hiện tại, giữ cấu trúc vật lý hiện có dưới `.data/pdf`.
- Dùng subfolder/project folder bên trong `sources/`, `inputs/` và các output area khi thật sự cần phân loại (mọi area đều `writableFolders: true`, trừ legacy `word`).
- Khi output có quan hệ với một project/subfolder đầu vào, hệ thống có thể tạo subfolder tương ứng trong output area, nhưng phải qua registry và output mapping.
- Không bắt buộc mọi project phải có folder vật lý trong tất cả các operation.
- Không tự lấy tên file làm project name một cách cứng nhắc.

Ví dụ mapping logic (tên thư mục con chỉ là ví dụ):

```text
.data/pdf/sources/hoa-phat/...
.data/pdf/split/hoa-phat/...
.data/pdf/products/ai/hoa-phat/...
.data/pdf/office/csv/hoa-phat/...
```

### 5.4. Mapping giữa công cụ và output folder

Mỗi tool phải khai báo input policy và output mapping tập trung; không tự ghép đường dẫn ở từng page. Nguồn sự thật là `outputMapping` trong `server/modules/pdf/workspace.ts`; `outputArea(tool)`/`outputDir(tool)` là đường duy nhất để lấy thư mục đích.

| Tool / operation (key) | Trang | Input được phép | Output zone |
|---|---|---|---|
| Import PDF (`upload`) | `/pdf/import`, `/pdf/library` | File ngoài workspace qua multipart | `sources/` |
| Upload input (`inputs/upload`) | `/pdf/import` | docx/xlsx/csv/json/xml/ảnh | `inputs/` |
| Split PDF (`split`) | `/pdf/split` | PDF trong `sources/` (có subfolder) | `split/` |
| Merge PDF (`merge`) | `/pdf/split` | PDF trong `split/` | `merged/` |
| Rasterize (`rasterize`) | `/pdf/split` → tab Ảnh | PDF trong `sources/` | `images/` |
| Images→PDF (`imagesToPdf`) | `/pdf/images` | Ảnh trong `images/` | `merged/` |
| Convert input (`convertInput`) | `/pdf/import` | File trong `inputs/` hoặc legacy `word/` | `merged/` |
| Source export (`export`) | `/pdf/export` | PDF trong `sources/` (png/docx/xlsx/csv/json/xml) | `office/` |
| AI Extraction (`extract`) | `/pdf/extract` | PDF trong `sources/` | `products/` |

Các operation chưa tồn tại trong codebase — **Compress, Rotate/Organize, OCR, Table Extraction, PDF→Word độc lập, Word→PDF độc lập, XML export** — không được bịa ra output zone. Khi một operation được thêm, nó phải thêm một key vào `outputMapping` và map vào một area đã có (hoặc thêm area mới vào `PDF_FILE_AREAS` + `AREA_DIRS` + registry) trong cùng thay đổi.

Output mapping phải nằm trong registry dùng chung. Không để mỗi page tự định nghĩa output path riêng rẽ.

#### Hiển thị luồng dữ liệu trên UI

Mọi trang xử lý phải hiển thị một flow note nhỏ, rõ ràng và luôn nhìn thấy ở khu vực đầu của Right side:

```text
ĐẦU VÀO: 3 file PDF đã chọn · sources/bang-gia/
     →
ĐẦU RA: split/ · Mở thư mục đầu ra
```

Quy tắc:
- `Đầu vào` được tính từ các file đang chọn, không chỉ từ folder đang mở.
- Nếu file được chọn nằm trong nhiều folder, hiển thị `N tệp từ M thư mục` và cho xem chi tiết nguồn.
- Nếu chưa chọn file, hiển thị folder hiện tại như vị trí duyệt, đồng thời nhắc `Chưa chọn tệp đầu vào` để không gây hiểu nhầm rằng toàn bộ folder đã được chọn.
- `Đầu ra` phải hiển thị tên folder dễ hiểu và đường dẫn tương đối trong workspace; không cần lộ absolute path.
- Có action nhẹ `Mở thư mục đầu ra` để điều hướng cây bên trái và mở folder output.
- Destination chỉ được resolve từ `outputMapping`; không cho chọn đường dẫn ngoài workspace, `checkpoints/` hay `.trash/`.
- Khi operation bắt đầu, lưu snapshot danh sách input (`area` + `relativePath`) và output area trong job record để truy vết chính xác.

### 5.5. Output naming và ghi file an toàn

Hiện trạng:
- Output mặc định đặt tên theo `documentStem(source)` + hậu tố (`_split`, `_merged`, `-page-01`, …).
- Ghi đè điều khiển bằng `overwriteFlag(body.overwrite)` trong `server/utils/pdfApi.ts`: giá trị khác `false`/`'false'` được coi là bật. Route kiểm tra `existsSync` trước và ném `PDF_FILE_ALREADY_EXISTS` (409) khi được tắt.
- **Chưa có atomic write**: file được ghi trực tiếp vào đích, chưa qua temp + rename. Đây là gap, không phải hành vi đã có.
- Nếu job thất bại, file nguồn giữ nguyên; không có cơ chế temp/recovery riêng.
- Liên kết input/output chỉ được lưu cho extraction job (`PdfExtractJobState`); các tool khác trả kết quả trong response, không có record.

Yêu cầu khi mở rộng:
- Collision nên có strategy rõ (suffix version hoặc hỏi người dùng) thay vì chỉ bật/tắt ghi đè.
- Không mặc định cho phép ghi đè file nguồn.
- Nếu thêm atomic write, phải ghi temp trong cùng `areaDir` rồi rename, và dọn temp khi lỗi.

---

## 6. Permission Policy – khóa cấu trúc nhưng cho phép thao tác dữ liệu

### 6.1. Nguyên tắc phân quyền

Không chỉ ẩn nút trên UI. Quyền phải được xác thực ở Nitro server (privileged process) cho **mọi** request ghi: `server/api/v1/pdf/directory/*`, `sources/*`, `upload`, `trash/*`.

System folder không thể:
- Rename.
- Move.
- Delete.
- Thay đổi system ID hoặc đường dẫn gốc.

Người dùng vẫn có thể đọc/ghi file bên trong theo policy của folder.

### 6.2. Permission matrix — trạng thái đã triển khai

Cột `writableFiles` / `writableFolders` lấy từ `DESCRIPTORS` trong `server/modules/pdf/workspace.ts`; đây là nguồn sự thật, không phải UI.

| Area | kind | `writableFiles` | `writableFolders` | `systemRoot` |
|---|---|---:|---:|---:|
| `sources` | source | Có | Có | Có (root khoá) |
| `inputs` | source | Có | Có | Có (root khoá) |
| `word` | system | Không | Không | Có (root khoá) |
| `split` | processing | Có | Có | Có (root khoá) |
| `images` | processing | Có | Có | Có (root khoá) |
| `merged` | processing | Có | Có | Có (root khoá) |
| `products` | extraction | Có | Có | Có (root khoá) |
| `office` | extraction | Có | Có | Có (root khoá) |

Quy tắc thực thi:
- **Root của mọi area là bất biến** (rename/move/delete đều bị từ chối), nhưng **subfolder bên trong thì sửa được** ở mọi area trừ `word`.
- `renameAreaItem` / `deleteAreaItem` tự từ chối `relativePath` rỗng bằng `PDF_INVALID_PATH`, nên root không thể bị trỏ tới kể cả khi client gửi `''`.
- `assertFolderWritable(area)` chặn subfolder của `word` (`PDF_FOLDER_IMMUTABLE`); `assertFileWritable(area)` chặn file của `word` (`PDF_FILE_IMMUTABLE`), áp dụng ở `renameAreaItem`, `deleteAreaItem`, `saveWord`, `removeWord` và `restoreTrashItem`.
- Rename chỉ khác hoa/thường được chấp nhận: so sánh path sau `toLowerCase()` trước khi báo `PDF_FILE_ALREADY_EXISTS`, vì filesystem Windows coi tên nguồn là "đã tồn tại".
- `checkpoints/` và `.trash/` không nằm trong `PDF_FILE_AREAS` nên không có route nào phục vụ chúng; `.trash` chỉ mở qua `trash/*` (restore/empty).

### 6.3. File nguồn bất biến

- File nguồn được import vào workspace phải được xem là bản gốc.
- Các thao tác xử lý tạo output mới; không sửa binary của source.
- Nếu có tính năng chỉnh sửa trực tiếp, phải tạo bản copy/version mới hoặc yêu cầu lưu thành file mới.
- Nếu người dùng muốn xóa source, phải có policy riêng, cảnh báo tác động tới job/result liên quan và xác nhận rõ ràng. Hiện tại xoá đi qua `.trash` (soft delete, restore được) trước khi bị dọn hẳn.

### 6.4. User subfolder

Người dùng được tạo folder con để sắp xếp dữ liệu:
- Chỉ bật ở area có `writableFolders = true` (`sources`, `inputs`, `split`, `images`, `merged`, `products`, `office`).
- Folder con nhận `relativePath` do `safeRelativePath` chuẩn hoá; không có bảng registry riêng — đường dẫn trên đĩa là identity.
- Không cho tạo folder con trong `word`, `checkpoints/`, `.trash/`.
- Quyền rename/delete folder con chỉ áp dụng cho folder con thật sự tồn tại; root area luôn bị từ chối.
- Tên folder không được giả mạo area root hoặc dùng ký tự bị `safeFileName` chặn.

---

## 7. Filesystem Architecture & Security (Nitro, không phải Electron IPC)

### 7.1. Luồng kiến trúc

```text
Renderer (Vue 3 / Nuxt UI v4, SPA ssr:false)
        │
        │ fetch /api/v1/pdf/*   (JWT + X-App-Id qua useHub/pdfFetch)
        ▼
Nitro server  ← privileged filesystem owner
        │
        ├── server/utils/pdfApi.ts          runPdf(): PDF_* → HTTP status
        ├── server/modules/pdf/paths.ts     pdfDirs, root = config.pdf.dir
        ├── server/modules/pdf/security.ts  safeFileName / safeRelativePath
        ├── server/modules/pdf/workspace.ts registry, outputMapping, report/repair
        ├── server/modules/pdf/directory.ts list/create/rename/delete area items
        ├── server/modules/pdf/inspect.ts   AREA_DIRS, resolveAreaFile
        ├── server/modules/pdf/library.ts   readLibrary(), saveSource()
        ├── server/modules/pdf/{raster,merge,images-to-pdf,convert,source-export}.ts
        └── server/modules/pdf/extract/* + office/*
                 │
                 ▼
        .data/pdf  (config.pdf.dir, override PDF_DATA_DIR)
```

Tên service trong sơ đồ là vai trò logic; trong repo này chúng đã tồn tại dưới dạng module Nitro. Không tạo process hay lớp service trùng lặp, và không di chuyển filesystem sang Electron main.

### 7.2. Quy tắc bắt buộc

- Renderer không gọi `fs`. Trong repo này `app/` không được import `server/` hay `#server/...` — đây là boundary đã có trong `AGENTS.md`.
- Không expose một endpoint kiểu `/api/v1/pdf/read?path=…` hay `delete?path=…` nhận absolute path.
- Client chỉ gửi `area` + `relativePath` (hoặc tên file) + options đã validate; `area` phải nằm trong `PDF_FILE_AREAS`.
- `resolveAreaFile` join `AREA_DIRS[area]` với đường dẫn đã qua `safeRelativePath`, nên kết quả luôn nằm trong area root.
- Chặn path traversal (`..`, encoded traversal, separator bất thường) bằng `safeFileName`/`safeRelativePath`.
- Decode tham số đúng **một lần**: `getQuery()` (h3/ufo) đã decode sẵn nên route không được gọi `decodeURIComponent` thêm (tên chứa `%` sẽ `URIError` → 500); `getRouterParam()` trả chuỗi còn encoded nên phải đi qua `pathParam()` (có try/catch).
- Kiểm tra quyền trước mọi thao tác ghi (create/rename/delete/upload) bằng descriptor trong `workspace.ts`.
- Giới hạn file size/type khi import theo `library.ts` (`maxUploadMb`, `maxPages`, extension); không tin MIME type do client gửi.
- Không thực thi file người dùng hoặc nội dung tài liệu như code.
- "Open file location" đi qua Electron IPC allowlist đã có (`electron/ipcPolicy.cjs`), không nhận chuỗi shell tuỳ ý.

### 7.3. Path và identity

Hiện tại identity của một file là **`area` + `relativePath`**; không có `fileId`/`folderId` dạng bảng registry và không cần thêm (filesystem là nguồn sự thật cho một workspace desktop-local). Phân biệt:
- `area`: một trong 8 giá trị `PDF_FILE_AREAS`.
- `relativePath`: đường dẫn tương đối bên trong area root, đã qua `safeRelativePath`; rỗng = chính area root.
- `name`: tên file/folder hiển thị (basename), không dùng làm identity.
- `path` (absolute): có trong `PdfFileInfo.path` để "open file location"; không nhận từ client.

Nếu sau này cần identity ổn định qua rename, đó là thay đổi có migration riêng — không giả định `fileId` đã tồn tại.

### 7.4. Integrity / reconciliation

`workspaceReport()` hiện có (read-only) kiểm tra:
- Area root bị thiếu (`exists: false`).
- File/folder count mỗi area.

`repairWorkspace()` chỉ `mkdirSync` lại root đã khai báo trong registry — không xoá, không move, không ghi đè file.

Chưa triển khai (ghi rõ là gap, không được mô tả như đã có):
- Phát hiện file vật lý không có record (vì không có bảng record).
- Đánh dấu missing/orphaned ở cấp file.
- Output dang dở/temp còn sót sau crash.
- Dry-run và log reconciliation (hiện chỉ trả JSON kết quả trong response).

---

## 8. Data Model / Registry

AI phải dùng database/state persistence hiện có nếu đã có. Không tự thêm database mới nếu chưa audit và chứng minh cần thiết.

**Trạng thái thực tế:** repo không có bảng Workspace / Folder / File record. Registry là một hằng số TypeScript (`DESCRIPTORS` + `outputMapping` trong `server/modules/pdf/workspace.ts`), và filesystem dưới `.data/pdf` là nguồn sự thật. Các interface dưới đây là logical model **để đối chiếu**, không phải schema phải tạo ngay. Nếu một phase sau cần registry động (multi-workspace, metadata cache), hãy map vào chúng và ghi rõ migration.

### 8.1. Workspace

```ts
interface WorkspaceRecord {
  id: string;
  name: string;
  rootPath: string;          // Chỉ server đọc; hiện là config.pdf.dir
  schemaVersion: number;
  status: 'ready' | 'missing' | 'needs_repair';
  createdAt: string;
  updatedAt: string;
}
```

Không expose `rootPath` đầy đủ cho UI nếu không cần thiết. Hiện `/api/v1/pdf/workspace` chỉ trả descriptor + count + `needsRepair`, không trả root path.

### 8.2. Folder Registry

Đã triển khai dưới dạng **area descriptor tĩnh**, không phải bảng:

```ts
// server/modules/pdf/workspace.ts — shape thực tế
interface PdfAreaDescriptor {
  area: PdfFileArea
  key: string                 // vd: 'sources.pdf', 'processing.split'
  kind: PdfAreaKind           // 'source' | 'processing' | 'extraction' | 'system'
  writableFiles: boolean
  writableFolders: boolean
  systemRoot: boolean
  accept: 'pdf' | 'input' | 'all'
}
```

`PdfAreaKind` và `PdfAreaDescriptor` nằm trong `shared/types/pdf.ts`, dùng chung app + server. Subfolder do user tạo **không** có record riêng — chúng là `relativePath` trên đĩa.

Nếu sau này cần `FolderRecord` đầy đủ (parentId, sortOrder, permissions array), đó là mở rộng có migration; không giả định nó đã tồn tại.

### 8.3. File Metadata

Hiện dùng `PdfFileInfo` / `PdfFolderInfo` (`shared/types/pdf.ts`), đọc trực tiếp từ đĩa mỗi lần list:

```ts
interface PdfFileInfo {
  name: string
  path: string            // absolute, chỉ để "open file location"
  size: number
  modifiedAt: string
  relativePath?: string   // vd: 'reports/2026/q1.pdf'
  parentFolder?: string
  overwritten?: boolean
}
```

Không có `checksum`, `pageCount`, `origin`, `status` lưu sẵn — chúng chưa tồn tại. Nếu thêm (ví dụ thumbnail cache, checksum nền), phải là cache có invalidation, không phải nguồn sự thật thứ hai.

### 8.4. Liên kết Job / Artifact

Job engine duy nhất hiện có là extraction (`server/modules/pdf/extract/jobs.ts`), lưu trong bộ nhớ tiến trình. Không tạo engine thứ hai; split/merge/raster/convert/export chạy đồng bộ trong request và trả kết quả, không có record job.

`PdfExtractJobState` lưu: `id`, `status`, `source`, `model`, `connectionId`, `preset`, `totalPages`, `processedPages`, `cachedPages`, `failedPages`, `currentPage`, `productCount`, `rowCount`, `error`, `createdAt`, `finishedAt`, `cancelRequested`.

Chưa lưu: output file/area tường minh, config snapshot đầy đủ, retry info, input list nhiều file. Lineage `Source → Job → Artifact → Export` chỉ suy ra được qua `source` + `products/`.

### 8.5. Version và migration

- Registry hiện là hằng số TypeScript, **không có schema version** và không có migration engine.
- Nếu thêm version/migration: phải idempotent, có log, có backup/manifest trước khi chạy.
- Migration không được xóa source file.
- Nếu phải di chuyển physical file: copy → verify size/checksum → cập nhật references, chỉ xóa bản cũ khi xác nhận xong và có policy rõ ràng.

---

## 9. API Contract (HTTP `/api/v1/pdf/*`)

Hợp đồng dưới đây là **hiện trạng đã có**, không phải tên gợi ý. API mới phải theo cùng convention (Nitro route + `runPdf` + `PDF_*` error code), không thêm IPC channel.

### 9.1. Workspace

| Method + path | Trả về |
|---|---|
| `GET /api/v1/pdf/workspace` | `PdfWorkspaceReport`: mỗi area descriptor + `exists`/`fileCount`/`folderCount`, `needsRepair`, `outputMapping` |
| `POST /api/v1/pdf/workspace/repair` | `PdfWorkspaceRepair`: `created: PdfFileArea[]`, `needsRepair` |
| `GET /api/v1/pdf/explorer` | Cây folder cho 7 area (`sources`…`office`, không gồm `word`) để dựng root `.data/pdf` trên Library |

### 9.2. Folder & listing

| Method + path | Ghi chú |
|---|---|
| `GET /api/v1/pdf/directory?area=&folder=` | `PdfDirectoryListing`: breadcrumbs, folders, files, tree |
| `POST /api/v1/pdf/directory/folder` | tạo subfolder — `assertFolderWritable(area)` |
| `PATCH /api/v1/pdf/directory/rename` | rename file/folder — từ chối `relativePath` rỗng |
| `POST /api/v1/pdf/directory/delete` | xoá vào `.trash` — từ chối `relativePath` rỗng |
| `GET /api/v1/pdf/trash`, `POST /trash/restore`, `DELETE /trash/:id`, `DELETE /trash/empty` | soft delete |

Mutation kiểm tra descriptor trong `workspace.ts` tại server. Không tin `area`/`relativePath` từ client mà không qua `parseArea` + `safeRelativePath`.

### 9.3. Files

| Method + path | Ghi chú |
|---|---|
| `GET /api/v1/pdf/library` | `PdfLibrary`: danh sách 8 area + limits |
| `GET /api/v1/pdf/file?area=&name=` | stream file trong `AREA_DIRS` |
| `GET /api/v1/pdf/inspect?area=&name=` | preview csv/xlsx/json/xml/docx |
| `POST /api/v1/pdf/upload` (multipart, `folder`) | PDF → `sources/` |
| `POST /api/v1/pdf/inputs/upload` | non-PDF → `inputs/` |
| `POST /api/v1/pdf/word/upload` | legacy docx → `word/`; luôn bị từ chối `PDF_FILE_IMMUTABLE` vì `word` là read-only |

Không có endpoint nhận absolute path. Không có `copy`/`move` endpoint — chưa triển khai, không được giả định.

### 9.4. Tool operations

Các trang PDF gọi route nghiệp vụ có sẵn, mỗi route tự lấy đích từ `outputDir(tool)`:
`POST /sources/:name/split`, `POST /split/:name/merge`, `POST /sources/:name/images`, `POST /images/:name/pdf`, `POST /inputs/:name/pdf`, `POST /sources/:name/docx`, `POST /sources/:name/export`, `POST /extract/start`.

### 9.5. Validation

Mọi request ghi cần:
- Validate `area` qua `parseArea` (whitelist `PDF_FILE_AREAS`).
- Chuẩn hoá mọi path qua `safeFileName` / `safeRelativePath`.
- Kiểm tra descriptor + `assertFolderWritable` trước khi mutate folder.
- Kiểm tra `relativePath` không rỗng trước rename/delete area item.
- Trả `PDF_*` code ổn định; `runPdf` map sang HTTP status.

---

## 10. Universal Document Viewer – giữ cửa sổ preview hiện có

Người dùng đã có tính năng mở window để xem file trực tiếp. Phải audit và giữ lại cơ chế này.

### 10.1. Mục tiêu

Phát triển cửa sổ preview thành Universal Document Viewer, dùng chung cho mọi module.

### 10.2. Định dạng

- PDF: page navigation, thumbnail, zoom, fit width/page, search text nếu có text layer, rotate view, fullscreen.
- Images: zoom, fit, rotate view, next/previous.
- DOCX: preview bằng cách hiện thực phù hợp với stack đang có; không giả định chuyển đổi hoàn hảo.
- XLSX: sheet navigation, grid preview, freeze/header nếu phù hợp.
- CSV: tabular preview, delimiter/encoding handling.
- JSON: syntax highlight, collapse/expand node, copy.
- TXT/Markdown/XML: text preview có encoding handling.
- File không hỗ trợ: thông báo và action Open externally an toàn.

### 10.3. Hành vi

- Preview chỉ đọc; không sửa file gốc.
- Không load file lớn toàn bộ vào Renderer nếu có streaming/chunk approach phù hợp.
- Có trạng thái loading/error/unsupported.
- Có thông tin file và đường dẫn breadcrumb logic (không cần lộ absolute path).
- Có thể điều hướng Previous/Next trong tập kết quả nếu được mở từ File Explorer — **chưa triển khai**, không được mô tả như đã có.
- Preview dùng chung API file/inspect, không tự đọc filesystem.
- Đóng cửa sổ không làm hủy job đang xử lý.

**Hiện trạng đã có** (`app/pages/pdf/preview.vue`, `layout: false`, mở qua `openPdfPreview(area, name, path)`):

| Định dạng | Renderer |
|---|---|
| pdf | `<iframe>` trỏ `/api/v1/pdf/file?area=&name=` |
| png/jpg/jpeg | `<img>` cùng endpoint |
| csv / xlsx | `PreviewTable` (qua `/inspect`) |
| docx | mammoth → HTML (server, qua `/inspect`) |
| json | editor view |
| xml/txt | text view |
| khác | thông báo chuyển đổi/không hỗ trợ |

Chưa có: thumbnail, zoom, rotate, fullscreen, page search, sheet navigation, Previous/Next. Ghi rõ là backlog, không giả định tồn tại.

---

## 11. Sắp xếp UI theo từng trang chức năng

Tất cả trang dùng cùng outer layout 2 side, nhưng phần Right Workspace thay đổi theo nhiệm vụ. Không ép mọi trang phải có cùng một bộ panel giống hệt nhau.

### 11.1. PDF Library / Thư viện PDF (`/pdf/library`)

Hiện trạng:
1. Tree: 7 area root (`sources`, `inputs`, `split`, `images`, `merged`, `products`, `office`), mỗi root là system folder có khoá, subfolder load từ `GET /explorer`.
2. `FileBrowser`: breadcrumb, toolbar (search/sort/density/refresh), folder rows + file rows, upload chỉ ở `sources`.
3. Row actions: file có menu preview/download/rename/delete + `Export` (điều hướng `/pdf/export?source=…`); folder có `New subfolder`/rename/delete theo area.
4. Footer/pagination: không có; list giới hạn theo folder.

Không có cấu hình xử lý ở Library — đúng như mong muốn.

`/pdf` (overview) chỉ là dashboard liệt kê workspace + output mapping (`GET /workspace`), nút Repair khi `needsRepair`.

### 11.1.1. Quy tắc UI chung cho tất cả trang xử lý

Đây là quy tắc bắt buộc, áp dụng trước các mô tả từng trang. Ghi chú **[đã có]** / **[mở]** cho biết trạng thái thật:

- Left side dùng cùng component và cùng semantics như Library **[đã có]**; cây đầy đủ trên mọi trang **[mở]** (§3.2).
- Người dùng có thể search folder, mở folder, xem và thao tác file **[đã có]**. Folder navigation state tách khỏi file selection state **[đã có]**.
- Right side chỉ có **một danh sách file dùng chung** (`FileBrowser`) **[đã có]**; không dựng explorer input riêng.
- Đầu Right side: breadcrumb + toolbar **[đã có]**; **Data Flow Note `Đầu vào → Đầu ra` [mở]**.
- `Đầu vào` phản ánh file thực sự đã chọn, không ám chỉ cả folder **[áp dụng khi có flow note]**.
- `Đầu ra` resolve từ `outputMapping`, có `Mở thư mục đầu ra` **[mở]**.
- Không đặt form cấu hình dài thường trực dưới danh sách **[đã có]**: cấu hình nằm trong modal/dialog của từng trang (`FolderModal`, modal split/extract…).
- Progress/Job status là vùng gọn/drawer, không che danh sách **[đã có cho extraction]**.
- Đổi folder cập nhật breadcrumb + listing **[đã có]**. Giữ selection xuyên folder **[mở]** — hiện mỗi thao tác dùng một file trên trang đang mở.
- Selection count + popover nhiều folder **[mở]** (phụ thuộc multi-select).
- Selection cần lưu `area` + `relativePath` để flow note mô tả đúng nguồn **[yêu cầu khi làm flow note]**.

Data Flow Note mục tiêu:

```text
ĐẦU VÀO: 3 file PDF đã chọn · sources/bang-gia/
ĐẦU RA: split/ · Mở thư mục đầu ra
```

### 11.2. Split & Merge / Tách & Ghép (`/pdf/split`)

Hiện trạng: một trang gồm hai nửa việc, cả hai đều dùng `WorkspaceShell` + `FileBrowser`:

1. `FileBrowser` area `sources` — duyệt/chọn file PDF nguồn, mỗi row có nút `Tách thành trang` (`splitToPages`). Footer có checkbox `Ghi đè`.
2. Panel **`Thư mục trang`** (`pdf.split.folders`) — list `splitFolders`, mỗi folder có nút chính `Ghép thành PDF` (`mergePdfFolder`) và action xoá.
3. Panel **`PDF đã ghép`** (`pdf.split.merged`) — list `merged` với row action `Tách thành trang`.

Không có modal cấu hình page range/odd-even — split tách toàn bộ trang. `Mở thư mục đầu ra` và flow note chưa có.

Hướng mở rộng (nếu cần): thêm config drawer cho page range/odd-even, flow note `sources/… → split/`, `split/… → merged/`.

### 11.3. Merge PDF / Ghép PDF

Merge hiện chạy **theo folder trang tách**, không theo multi-file selection: mỗi folder trong `split/` là một đơn vị ghép (`<folder>_merged.pdf` vào `merged/`), kiểm tra tồn tại trước và tôn trọng `overwrite`.

Chưa có: chọn nhiều PDF rồi sắp thứ tự bằng drag-and-drop; xem tổng trang/dung lượng trước khi ghép.

### 11.4. Images / Ảnh PDF (`/pdf/images`)

Hiện trạng:
1. `FileBrowser` area `sources` — mỗi row có nút `Rasterize` (`POST /sources/:name/images`), footer checkbox `Ghi đè`.
2. Panel **`Thư mục ảnh`** (`pdf.images.folders`) — list folder trong `images/`, mỗi folder có nút `Tạo PDF` (`POST /images/:name/pdf`) và action xoá.

Chưa có config drawer cho page range/định dạng/DPI/quality — server dùng `config.pdf.imageScale`. Ảnh hiện là PNG; JPEG/WebP chưa hỗ trợ.

### 11.5. Import & Export

**`/pdf/import`** — area `inputs`:
1. `FileBrowser` liệt kê file không phải PDF (docx/xlsx/csv/json/xml/ảnh), mỗi row có nút `Chuyển thành PDF` (`convert` → `merged/`).
2. Empty state hiện grid các định dạng hỗ trợ (`supportedFormats`).
3. Trash count + `openTrash` mở `TrashModal`.
4. Upload dùng `PDF_INPUT_ACCEPT`; footer checkbox `Ghi đè`.

**`/pdf/export`** — area `sources`:
1. `FileBrowser` có `selectable`, chọn **một** file nguồn (`selected-path`).
2. Panel format: `ExportFormatPicker` (`png`, `docx`, `xlsx`, `csv`, `json`, `xml`), checkbox `Ghi đè`, nút `Export`.
3. Kết quả từng format hiển thị ok/error ngay dưới panel.

Chưa có: cảnh báo mất layout/font; filter theo format trong file list; flow note.

### 11.6. AI Extraction / Bóc tách bằng AI (`/pdf/extract`)

Trang hiện có: chọn PDF nguồn từ tree `sources`, chọn connection/model, chọn preset, chọn định dạng export, chạy job, theo dõi tiến trình, xem kết quả. Kết quả ghi vào `products/`.

Thứ tự mong muốn (đã có phần lớn, chỉ thiếu calibration):
1. **Source files** — chọn từ Explorer.
2. **Model & Preset** — có.
3. **Output formats** — csv/json/xlsx/docx/xml theo khả năng.
4. **Advanced** — overwrite/collision, page selection, checkpoint/resume.
5. **Preview/Calibration** trên vài trang đại diện — **chưa có UI riêng**.
6. **Start extraction**.
7. **Progress** — `PdfExtractJobState` (totalPages, processedPages, cachedPages, failedPages, currentPage).
8. **Results** — mở trong `products/` hoặc chuyển sang export.

Yêu cầu giữ nguyên:
- Extraction ghi `products/`; export riêng qua `/pdf/export` ghi `office/`. Cả hai từ `outputMapping`.
- Job lưu `model`, `connectionId`, `preset` (`PdfExtractJobState`).
- Checkpoint hiện lưu ở `checkpoints/<stem>/<page>.json` và được tái dùng khi `!force` **chỉ dựa trên `stem` + `unit.id`**. Nó **chưa** fingerprint theo preset/model/schema — đổi preset rồi chạy lại vẫn đọc cache cũ. Đây là gap đã biết, không phải hành vi mong muốn; đừng mô tả là đã an toàn.
- Không xuất dữ liệu lỗi nghiêm trọng mà không cảnh báo.
- Không tự gán category khi AI không xác định; đánh dấu needs_review.

### 11.7. OCR / Table Extraction / Review — chưa triển khai

Không có trang OCR, Table Extraction hay Extraction Review trong repo. `products/` giữ kết quả extraction dưới dạng bảng (`PreviewTable`) nhưng không có UI sửa/approve/reject.

Khi xây, mỗi năng lực là một trang riêng dùng chung `WorkspaceShell` + `FileBrowser` + viewer, không nhồi vào `/pdf/extract`.

### 11.8. Queue / History / Failed jobs — hiện trạng

Chỉ extraction có job: `GET /extract/jobs` (danh sách), `GET /extract/:id` (chi tiết), `POST /extract/:id/cancel`. Trạng thái trong `PDF_JOB_STATUSES` = `queued | running | done | failed | cancelled` (không có `paused`/`retrying`).

Chưa có: history filter, retry action, job detail xuyên tool, queue dùng chung cho split/merge/raster. Không được mô tả như đã có.

---

## 12. Component Strategy – tận dụng `app/components/pdf`

### 12.1. Audit component trước khi tạo mới

Inventory đã có trong [`WORKSPACE-AUDIT.md`](./WORKSPACE-AUDIT.md) §3 (component) và §4 (composable). Đọc bảng đó trước khi thêm component.

Không tự điền tên component giả định vào báo cáo. Tên phải lấy từ codebase.

### 12.2. Component hiện có và vai trò

Không tạo bản trùng; các component dưới đây đã gánh các vai trò trong sơ đồ lý thuyết:

| Vai trò | Component thực tế (`app/components/pdf/`) |
|---|---|
| Explorer wrapper (side trái, splitter/collapse) | `WorkspaceShell.vue` |
| Cây folder + filter + header | `FolderTree.vue` |
| Node/menu cây dùng chung | `shared/HeTreeMenu.vue` |
| Right side: header, breadcrumb, toolbar, list, footer | `FileBrowser.vue` |
| Một file row | `FileRow.vue` |
| Menu hành động của file | `FileActions.vue` |
| Folder row trong listing | `FolderRow.vue` |
| Output-folder row có action chính | `OutputFolderRow.vue` |
| Right-click menu | `ContextMenu.vue` |
| Chọn format export | `ExportFormatPicker.vue` |
| Modal folder / rename / trash | `FolderModal.vue`, `RenameModal.vue`, `TrashModal.vue` |
| Viewer theo MIME | `PreviewFile.vue` + `PreviewTable.vue` / `PreviewText.vue` |
| Preset extraction | `PresetSampleEditor.vue` |

**Chưa có** (không được coi là đã có): `DocumentDataFlowNote`, `DocumentOperationConfigDrawer`, `DocumentJobProgress`, `DocumentSelectionToolbar` (bulk), grid view, `DocumentFileMetadata` riêng. Khi cần, thêm mới hoặc mở rộng component ở trên, không tạo song song.

**Viewer:** `app/pages/pdf/preview.vue` (`layout: false`) là viewer hiện tại; thêm renderer MIME mới trong `PreviewFile.vue`.

### 12.3. Nguyên tắc phân lớp component

- Presentation component: nhận props, emit event; không tự truy cập filesystem.
- Container/composable/store: quản lý state, gọi typed API (`usePdfStudio`, `usePdfDirectory`).
- Nitro module: xử lý filesystem, policy, registry (`server/modules/pdf/*`).
- Không nhồi tree loading, permission và file operation vào cùng một Vue component.
- Không để mỗi page tự duy trì một bản folder tree hoặc list file riêng.
- Component dùng chung phải có props/events rõ ràng và không phụ thuộc cứng vào một route.

### 12.4. State — hiện trạng

| State | Nơi giữ hiện tại |
|---|---|
| Folder đang mở (`currentFolder`) | `usePdfDirectory` (ref cục bộ mỗi page) |
| `expandedIds` | `HeTreeMenu` + `FolderTree` |
| Selection folder | `selectedKey` computed = `${area}:${currentFolder}` |
| Selection file | state cục bộ trong `FileBrowser`/page |
| View density | `FileBrowser` (không persist) |
| Search/sort file | `FileBrowser` (không persist) |
| Explorer width/collapsed | `localStorage` (`pdf.explorer.width`, `pdf.explorer.collapsed`) |

`activeFolderId`, `selectedFolderIds`, `fileViewMode` (grid/details), Recent/Favorites **chưa tồn tại**. Không để navigation selection và checkbox selection dùng chung một biến khi thêm multi-select.

State ngắn hạn của page có thể ở page/store; preference dùng chung lưu theo cơ chế persistence hiện có. Tránh duplicate source of truth giữa local component state, Pinia/store và server.

---

## 13. Shared service layer

Không có lớp `DocumentService` duy nhất; trách nhiệm đang chia theo module Nitro, tất cả dưới `server/modules/pdf/`. Trang/composable không được tự `path.join`.

| Trách nhiệm | Module hiện có |
|---|---|
| Resolve workspace root | `paths.ts` (`pdfDirs`, `ensurePdfDirs`) |
| Registry, permission, output mapping | `workspace.ts` |
| Cây folder, listing, CRUD folder/file | `directory.ts` |
| Library + upload | `library.ts`, `inputs.ts` |
| Chuẩn hoá tên/path | `security.ts` |
| Resolve file, preview | `inspect.ts` |
| Xoá mềm / khôi phục | `trash.ts` |
| Split / merge / raster / ảnh→PDF / convert / export | `document.ts` (splitPdf), `merge.ts`, `raster.ts`, `images-to-pdf.ts`, `convert.ts`, `source-export.ts` |
| Extraction + job | `extract/*` |
| Lỗi → HTTP | `server/utils/pdfApi.ts` (`runPdf`) |

Khi thêm tool, dùng đúng các module này; không tạo `path.join(workspaceRoot, …)` ở route ngoài `paths.ts`/`workspace.ts`.

---

## 14. Hiệu năng và độ ổn định

Hiện trạng đã đạt:
- Listing đọc `readdirSync` + `statSync` (không đọc binary).
- Extraction chạy phía server, không block UI thread.
- Nút Cancel của extraction chỉ hiện khi job đang chạy.
- `checkpoints/<stem>/<page>.json` giữ kết quả từng trang để resume.

Chưa có (gap, không được mô tả như đã có):
- Pagination hoặc virtual scrolling cho folder nhiều file.
- Thumbnail cache.
- Metadata cache + invalidation, và file watcher.
- Concurrency limit tường minh cho extraction (hiện chạy tuần tự theo unit).
- Chống mất job history khi app đóng; job chỉ nằm trong bộ nhớ tiến trình Nitro.
- Atomic write.
- Xử lý riêng cho Windows file lock (lỗi bubble lên như `PDF_*` thường).

---

## 15. Migration từ cấu trúc hiện tại

**Kết luận: không cần migration.** Cây thư mục đang chạy đã là cây đích, cùng tên với `AREA_DIRS`; `sources` và `inputs` là hai vai trò khác nhau chứ không phải nhánh legacy trùng lặp:

| Nhãn UI (`pdf.areas.*`) | Folder vật lý | Vai trò |
|---|---|---|
| PDF gốc | `sources/` | PDF upload (`isPdfName`) |
| Tệp đầu vào | `inputs/` | docx/xlsx/csv/json/xml/ảnh (`isInputName`) |
| Trang tách | `split/` | thư mục trang tách |
| Ảnh PDF | `images/` | thư mục ảnh trang |
| PDF ghép | `merged/` | PDF ghép / ảnh→PDF / convert |
| Dữ liệu trích xuất | `products/` | kết quả extraction |
| (không có trong cây Library) | `word/` | legacy docx — chỉ đọc, không nằm trong `/explorer` |
| Word & Excel | `office/` | docx/xlsx sinh ra, có trong cây Library |

Chỉ khi thật sự đổi layout mới áp dụng các bước dưới đây:

1. Scan và ghi manifest cấu trúc hiện tại (không di chuyển/xóa).
2. Map folder cũ sang area/key mới.
3. Đối chiếu file và cập nhật references nếu có.
4. Nếu cần đổi physical layout, copy sang destination mới, verify size/checksum khi có, cập nhật references.
5. Kiểm tra các job/result cũ vẫn mở được.
6. Chỉ đánh dấu folder cũ legacy khi mọi kiểm tra thành công.
7. Không xóa dữ liệu legacy tự động trong migration đầu tiên.
8. Nếu có folder trùng tên hoặc chưa map được, giữ nguyên, không tự đoán.
9. Có backup/rollback plan trước migration.

Migration phải idempotent: chạy lại không tạo bản sao và không làm hỏng record.

---

## 16. Error handling và audit log

Error code đã có, phải tái dùng thay vì bịa mã mới. `runPdf` (`server/utils/pdfApi.ts`) map code → HTTP status; client map `statusMessage` sang i18n (`error-handling` convention của dự án).

| Code | HTTP | Dùng ở đâu |
|---|---:|---|
| `PDF_FILE_NOT_FOUND`, `PDF_FOLDER_NOT_FOUND`, `PDF_SOURCE_NOT_FOUND`, `PDF_OUTPUT_NOT_FOUND`, `PDF_JOB_NOT_FOUND` | 404 | resolve file/folder/job |
| `PDF_FOLDER_IMMUTABLE` | 409 | `assertFolderWritable` — subfolder của legacy `word` |
| `PDF_FILE_IMMUTABLE` | 409 | `assertFileWritable` — file của legacy `word` (rename/delete/upload/restore) |
| `PDF_FOLDER_ALREADY_EXISTS`, `PDF_FILE_ALREADY_EXISTS`, `PDF_JOB_RUNNING` | 409 | collision |
| `PDF_INVALID_PATH` | 500 (fallback) | `renameAreaItem`/`deleteAreaItem` với `relativePath` rỗng |
| `PDF_INVALID`, `PDF_INVALID_EXTENSION`, `PDF_EMPTY_UPLOAD`, `PDF_NAME_REQUIRED`, `PDF_FOLDER_NAME_REQUIRED`, `PDF_INPUT_INVALID`, `PDF_EXPORT_NO_FORMAT`, `PDF_PREVIEW_NEEDS_PDF` | 422 | validation |
| `PDF_UPLOAD_TOO_LARGE` | 413 | upload |
| `PDF_AI_KEY_MISSING`, `PDF_FONT_MISSING` | 503 | thiếu cấu hình |
| `PDF_AI_TIMEOUT` | 504 | provider |
| `PDF_AI_HTTP_429` | 429 | provider rate limit |

Mã mới phải thêm vào `PDF_ERROR_STATUS` cùng lúc với nơi throw, và phải có key i18n ở cả `en.json` và `vi.json`.

Audit log: repo **chưa có** audit log cho thao tác PDF. Đây là gap đã biết; nếu thêm, ghi tối thiểu:
- Import, ghi output/overwrite.
- Rename/delete file.
- Tạo/xoá subfolder.
- Repair workspace.
- Request bị từ chối do descriptor (`PDF_FOLDER_IMMUTABLE`).

Không ghi API key, nội dung nhạy cảm hoặc toàn bộ binary vào log.

---

## 17. Kiểm thử bắt buộc

### 17.1. UI

Đã có (xem `docs/pdf/VERIFICATION.md` phase 14):
- Explorer dùng chung trên library, split, images, export, import, extract.
- Collapse/expand và resize 2 side hoạt động; width + collapsed persist qua `localStorage`.
- Click cả thẻ node chọn folder; chevron chỉ expand; checkbox giữ state riêng.
- Empty/loading/error states hiển thị đúng.

Còn phải kiểm khi làm:
- Tên folder dài không phá layout.
- List/Grid/Details không làm mất selection ngoài ý muốn.
- Không trang nào tự ẩn nhóm folder; cây đầy đủ trên mọi trang là mục tiêu còn mở (library đã đủ, tool pages mới có cây area).
- Layout hoạt động với kích thước cửa sổ Electron mục tiêu.
- Multi-select và bulk action — **chưa có**, chỉ kiểm khi tính năng được thêm.

### 17.2. Filesystem/security

- Không thể rename/delete/move area root từ UI.
- Không thể rename/delete/move area root khi gọi thẳng `/api/v1/pdf/directory/*` (không chỉ khi UI ẩn nút) — đã có spec `pdf_area_guard.spec.ts`.
- Subfolder trong `sources`/`split`/… tạo, rename, delete được; subfolder của `word` bị từ chối `PDF_FOLDER_IMMUTABLE`.
- File trong `word` bị từ chối rename/delete/upload/restore bằng `PDF_FILE_IMMUTABLE` (spec `pdf_area_guard.spec.ts`).
- Rename chỉ đổi hoa/thường không bị báo trùng tên; đổi sang tên của file khác vẫn báo `PDF_FILE_ALREADY_EXISTS`.
- Tham số URL được decode đúng một lần: file có `%` trong tên mở được qua `file`/`inspect`/`directory`, và không route nào gọi `decodeURIComponent` trên `query.*` hay router param trực tiếp (spec `pdf_url_params.spec.ts`).
- `fileCount` của folder chỉ đếm file, không đếm subfolder.
- Chặn `../` và path traversal (`safeRelativePath`).
- Không thể truy cập file ngoài workspace bằng `area`/`relativePath` giả hoặc traversal.
- Import file vào đúng folder.
- Output ghi đúng folder mapping.
- Source file không thay đổi sau Split/Merge/Rasterize/Export/AI Extraction.
- File trùng tên có xử lý collision đúng (`overwriteFlag`, `PDF_FILE_ALREADY_EXISTS`).

- Symlink/junction escape bị chặn: `assertInsideRoot` (`paths.ts`) `realpath` ancestor gần nhất đã tồn tại rồi so với area root, và `listAreaDirectory`/`getAreaFolderTree` bỏ qua mọi `Dirent` là link (Windows junction báo `isSymbolicLink`, không `isDirectory`).

**Chưa có, phải coi là gap:** bảo vệ "file đang được job dùng" khỏi bị xoá (không có lock).

### 17.3. Migration/recovery

Hiện **chưa có migration** — layout trên đĩa đã là layout đích, nên không có bước di chuyển dữ liệu. Các mục dưới đây là yêu cầu chỉ áp dụng **khi** một thay đổi layout thật sự xảy ra:

- Migration chạy lần đầu và chạy lần hai không tạo bản trùng.
- App crash giữa lúc ghi output: không có file hoàn chỉnh giả; temp/recovery được xử lý.
- Workspace root mất/đổi tên: UI báo trạng thái và có hướng repair.
- Folder/file bị thay đổi ngoài ứng dụng: reconciliation không crash và không tự xóa dữ liệu.

Đã có: `GET /workspace` báo `needsRepair`; `POST /workspace/repair` tạo lại root thiếu (chỉ `mkdir`, không xoá). Đã có unit spec `pdf_workspace_repair.spec.ts` chứng minh điều này.

### 17.4. Regression

Kiểm tra lại các chức năng đang có:
- Import PDF.
- Thư viện PDF.
- Split/Merge.
- PDF → Images.
- Export/Import PDF.
- AI Extraction.
- Preset/model selector.
- Checkpoint/resume và kết quả cũ nếu có.
- Mở cửa sổ preview hiện tại.

Không tuyên bố hoàn tất nếu chỉ build thành công mà chưa smoke-test các flow chính.

---

## 18. Kế hoạch triển khai theo phase

> **Trạng thái:** Phase 0–4 và 6 đã giao (xem [`WORKSPACE-UPGRADE-PLAN.md`](./WORKSPACE-UPGRADE-PLAN.md)); Phase 5 mới dừng ở mức giữ preview hiện có. Các mục dưới đây là tiêu chí, không phải việc còn trống hết.

### Phase 0 – Audit & Baseline — **DONE**

- Inventory component tại `app/components/pdf`.
- Audit trang, route, composable, API routes, filesystem, preview window, job system.
- Ghi baseline build/test và regression list.
- Đề xuất mapping component cũ → kiến trúc mới.

**Exit criteria:** có audit report, không sửa chức năng trước khi hiểu dependency.

### Phase 1 – Workspace Registry & Safe Filesystem — **DONE**

- Định nghĩa workspace root/config theo cơ chế hiện có (`config.pdf.dir`).
- Area registry + stable `key` (`server/modules/pdf/workspace.ts`).
- Khởi tạo root idempotently (`ensurePdfDirs`, `repairWorkspace`).
- `safeFileName` / `safeRelativePath` + descriptor permission.
- API route Nitro + `runPdf` theo convention hiện có; không thêm Electron IPC cho PDF.
- Test area root immutable và path traversal.

**Exit criteria:** area root được tạo/đọc; route từ chối thao tác phá cấu trúc.

### Phase 2 – Universal Explorer UI — **DONE**

- Tái sử dụng component cũ (`WorkspaceShell`, `FolderTree`, `HeTreeMenu`).
- Explorer dùng chung cho library + tool pages.
- Tree tải theo area, folder filter trong cây hiện có.
- Folder selection/navigation state tách biệt (`expandedIds` vs `selectedKey`).
- Resize/collapse và lưu preference.

**Exit criteria:** Thư viện PDF và AI Extraction dùng chung Explorer với dữ liệu filesystem thật.

### Phase 3 – Universal File Explorer — **DONE (một phần)**

- File list, toolbar, filter/sort, view density — đã có.
- Multi-select và bulk actions — **deferred**, cố ý không làm.
- Contextual actions theo MIME/permission/tool — đã có per-row.
- Pagination/virtualization — chưa cần (danh sách giới hạn theo folder).

**Exit criteria:** danh sách file chạy với metadata thật; selection và actions ổn định.

### Phase 4 – Output Mapping & Tool Integration — **DONE**

- `outputMapping` + `outputDir`/`areaDir` cho split/merge/rasterize/images→Pdf/convert/export/extract.
- Các tool dùng registry, không tự build path.
- Collision qua `overwriteFlag`; lineage lưu trong job record của extraction.

**Exit criteria:** tool tạo output đúng folder, source không bị sửa.

### Phase 5 – Universal Viewer Integration — **OPEN**

- Giữ preview window hiện tại — đã làm.
- **Còn mở:** zoom, rotate, thumbnail, fullscreen, page search, sheet navigation, Previous/Next.
- **Còn mở:** thêm định dạng chưa hỗ trợ.

**Exit criteria:** PDF và các định dạng đang hỗ trợ mở được từ mọi trang mà không duplicate filesystem logic.

### Phase 6 – Migration, Recovery & Full Regression — **DONE (không cần migration)**

- Migration cây thư mục: **không cần**, layout đã là đích.
- Integrity check/repair: `GET /workspace` + `POST /workspace/repair`.
- Recovery và audit logs: **audit log chưa có** (gap).
- Chạy toàn bộ regression tests.
- Cập nhật tài liệu sử dụng và architecture docs.

**Exit criteria:** dữ liệu cũ được bảo toàn; các flow PDF hiện tại hoạt động; cấu trúc folder và permission được kiểm thử.

---

## 19. Definition of Done

Chỉ coi công việc hoàn tất khi đạt tất cả điều kiện áp dụng:

- [x] Đã audit và tái sử dụng component hiện có trong `app/components/pdf`.
- [x] Không tạo component trùng với component có sẵn mà không có lý do.
- [x] Các trang PDF Studio dùng cùng Universal Explorer.
- [x] UI giữ bố cục 2 side và design system hiện tại.
- [x] Có resize/collapse Explorer và preference persistence.
- [x] Cây thư mục lấy từ filesystem thật.
- [ ] Lazy loading thật cho cây — hiện tải cả cây area trong một request (`/explorer`), chưa lazy theo node.
- [x] Area root không thể rename/move/delete từ UI lẫn API route.
- [x] File operations được kiểm soát bằng descriptor/`assertFolderWritable`.
- [x] Path traversal được ngăn chặn bằng `safeRelativePath`; symlink/junction escape bị chặn bằng `assertInsideRoot` + bỏ qua `Dirent` là link khi liệt kê.
- [x] Các tool dùng output mapping tập trung.
- [x] Source files không bị ghi đè bởi xử lý thông thường.
- [ ] Output collision handling — có `overwriteFlag` + `PDF_FILE_ALREADY_EXISTS`; **atomic write (temp + rename) chưa có**.
- [x] Preview window hiện tại được giữ và dùng chung API file/inspect.
- [x] Không cần migration; layout đã là đích.
- [x] Regression test các chức năng PDF hiện tại đạt (`pnpm test` 16/16 specs, 2026-11-05).
- [x] Build/lint/typecheck/test theo khả năng dự án đều đạt; lỗi còn lại được ghi rõ.
- [x] Có tài liệu audit, phase plan, component inventory và cách thêm tool mới.
- [ ] Audit log cho thao tác PDF — **chưa có**.
- [ ] Multi-select + bulk actions — **deferred**.`

---

## 20. Hướng dẫn AI khi triển khai từng phase

Khi bắt đầu mỗi phase:

1. Đọc lại yêu cầu phase và code hiện tại có liên quan.
2. Nêu ngắn gọn file/component/service sẽ tái sử dụng và file mới dự kiến tạo.
3. Thực hiện thay đổi nhỏ, theo từng nhóm chức năng; không refactor lan rộng.
4. Chạy typecheck/lint/test phù hợp ngay sau thay đổi.
5. Kiểm tra giao diện và hành vi thực tế bằng dữ liệu local, không chỉ dựa vào mock.
6. Cập nhật checklist/phase status và ghi rõ phần chưa hoàn thành.
7. Không tự ý bỏ qua test hoặc đổi yêu cầu để làm cho build xanh.

Nếu phát hiện component cũ không thể tái sử dụng an toàn:
- Nêu rõ vấn đề kỹ thuật trong audit.
- Giữ API cũ nếu có nơi đang dùng.
- Tạo component mới có trách nhiệm rõ ràng.
- Chuyển từng page sang component mới và kiểm thử regression.

**Ưu tiên cao nhất:** bảo toàn hoạt động hiện tại, tái sử dụng code tốt, chuẩn hóa một nguồn dữ liệu và một filesystem service dùng chung, sau đó mới mở rộng tính năng.

---

## 21. Prompt khởi động ngắn cho AI Coding Agent

Hãy đọc toàn bộ tài liệu `TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md` và audit codebase hiện tại trước khi chỉnh sửa. Đặc biệt kiểm kê `app/components/pdf` cùng các component UI dùng chung khác. Tôi đã có sẵn các component và chức năng PDF đang hoạt động; hãy tận dụng tối đa, không tạo component trùng, không viết lại module tùy tiện.

Giữ giao diện 2 side hiện tại: Universal Document Explorer bên trái và File List Workspace bên phải. Workspace là `.data/pdf` với 8 area cố định (`sources`, `inputs`, `word`, `split`, `images`, `merged`, `products`, `office`); root mỗi area bất biến, subfolder bên trong sửa được. Mọi filesystem operation phải qua Nitro server (`server/modules/pdf/*`), không để renderer tự dựng absolute path hay đọc `fs`.

Phase 0–4 và 6 đã giao; đọc `WORKSPACE-UPGRADE-PLAN.md` để biết phần còn mở trước khi bắt tay. Không dừng ở việc chỉ đưa ra kế hoạch.
