# TM Document Studio — Rebuild Specification v3

> **Tài liệu triển khai cho AI Coding Agent, viết lại từ đầu trên code thật.**
>
> v2 đặc tả workspace/filesystem. v3 đặc tả **sản phẩm và cấu trúc frontend**: người dùng bắt đầu bằng việc muốn làm, hệ thống tự biết đọc/ghi ở đâu, và mọi trang dùng chung một Explorer, một danh sách file, một mô hình trạng thái.

## Trạng thái tài liệu

| Mục | Đường dẫn |
|---|---|
| Bản hiện hành | `docs/pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` (tài liệu này) |
| Đặc tả nền (filesystem, permission, error code) | `docs/pdf/TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md` (v2) |
| Bản nháp v3 trước khi đối chiếu code | `docs/archive/2026-11-05-rebuild-spec-v3-draft/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.draft.md` |
| Audit hiện trạng | `docs/pdf/WORKSPACE-AUDIT.md` |
| Phase + kết quả | `docs/pdf/WORKSPACE-UPGRADE-PLAN.md` |
| Bằng chứng gate | `docs/pdf/VERIFICATION.md` |

**Trạng thái 2026-11-06:** Phases 0–6 đã xong; gate và bằng chứng nằm trong
`VERIFICATION.md`. Phase 7 (viewer parity) chỉ làm khi có yêu cầu cụ thể;
Phase 8 ngoài v3; §12 (v4 multi-runtime) chưa bắt đầu.

Hệ quả cho người đọc: §0.1 và §1 là **ảnh chụp trước khi rebuild**, giữ nguyên
làm bằng chứng. Chúng còn nhắc `usePdfDirectory` và `OutputFolderRow` — cả hai
đã bị xoá (`usePdfExplorer` thay thế từ Phase 2, `ConfirmAction`/folder action
thay thế row từ Phase 5/6). Đọc trạng thái hiện tại ở `WORKSPACE-AUDIT.md` §3–4
và `WORKSPACE-UPGRADE-PLAN.md`, không đọc §1 như mô tả code đang chạy.

Bản nháp v3 đầu tiên viết từ mô tả sản phẩm mà chưa đọc code, nên có ba giả định sai: (1) tồn tại route `/pdf/merge` — thực tế không có, Merge nằm trong `/pdf/split`; (2) app tự khai báo menu — thực tế tm-hub sinh từ `system_routes`; (3) filesystem đi qua Electron IPC — thực tế đi qua Nitro. Bản nháp lưu nguyên văn ở `docs/archive/`, **không dùng để triển khai**. Mọi route, field và con số dưới đây đọc trực tiếp từ code ngày 2026-11-05.

---

## 0. Định hướng

### 0.1. Vấn đề của trạng thái hiện tại

Code chạy đúng, nhưng UI đang phản chiếu cấu trúc lưu trữ thay vì công việc người dùng muốn làm.

| Triệu chứng | Bằng chứng |
|---|---|
| Trang công cụ chỉ thấy **một** nhánh thư mục | `usePdfDirectory('sources')` ở `split.vue:20`, `images.vue:19`, `export.vue:18`, `extract.vue:24`; `usePdfDirectory('inputs')` ở `import.vue:17`. Chỉ `library.vue:20-23` dựng đủ 7 area |
| Nhiều danh sách file cạnh tranh | `split.vue` = FileBrowser (`:113`) + panel split folders (`:160`) + panel merged PDFs (`:200`); `images.vue` = browser (`:109`) + panel image folders (`:156`); `import.vue` = browser (`:97`) + panel converted (`:157`); `extract.vue` = browser (`:339`) + panel jobs (`:470`) + panel results (`:532`) |
| Không thấy đích ghi trước khi chạy | Không trang công cụ nào đọc `outputMapping`; chỉ `index.vue:206-232` hiển thị bảng mapping |
| Click tên file mang hai nghĩa | `FileBrowser.vue:124-130`: `selectable` → `emit('pick')`, ngược lại → `openPdfPreview` |
| Input đã chọn không sống qua điều hướng | `selectedSource` chỉ là string `relativePath`; đổi folder là file không còn thấy ở đâu |
| Cấu hình dài nằm thường trực | Panel formats `export.vue:136-192`; model/preset/formats `extract.vue:366-468` |

### 0.2. Kết quả mong muốn

1. Vào Document Studio thấy **việc muốn làm**, không phải 7 folder kỹ thuật.
2. Chọn input tách rời khỏi việc đang duyệt thư mục nào.
3. Mỗi operation chỉ hiện tham số nó thật sự hỗ trợ, trong dialog/drawer.
4. Trước khi chạy thấy `Đầu vào → Xử lý → Đầu ra`; đích lấy từ server mapping.
5. Chạy xong có tóm tắt kết quả + mở đúng thư mục đầu ra trong cùng Explorer.
6. Mọi trang dùng chung Explorer, FileBrowser, viewer, input model và operation metadata.
7. Người dùng không cần biết `sources/`, `split/`, `products/` nghĩa là gì.

### 0.3. Phạm vi rebuild

- Information architecture và trang Home.
- Composition của 5 trang công cụ (split, images, import, export, extract) + Library + Home + Preview.
- Chọn input, hiển thị output, trạng thái operation.
- Operation metadata dùng chung (nhỏ, khai báo).
- Tổ chức lại `app/components/pdf` theo trách nhiệm.
- Giữ nguyên URL hiện tại trong suốt quá trình chuyển.

### 0.4. Không được tự ý rebuild

- Không đổi `config.pdf.dir`, `PDF_DATA_DIR` hay layout area.
- Không đổi tên/gộp/xoá area, không di chuyển dữ liệu người dùng.
- Không chuyển filesystem ownership khỏi Nitro; không thêm kênh IPC PDF.
- Không thay TM Hub AI Relay bằng API key riêng.
- Không viết lại engine PDF/extraction/preset/checkpoint/viewer trước khi audit.
- Không đổi Nuxt, Nuxt UI, pnpm hay build pipeline.
- Không đổi `overwrite` mặc định. Hiện mọi trang đều `ref(true)` và `overwriteFlag()` phía server chỉ trả `false` khi client gửi `false`.

> **"Đập đi xây lại" trong phạm vi cho phép:** thiết kế lại trải nghiệm, page composition, ranh giới component. Dữ liệu, contract server và chức năng đang chạy phải bảo toàn tới khi bản thay thế đạt parity.

---

## 1. Baseline đã xác minh (đọc từ code, không suy đoán)

### 1.1. Runtime

- Nuxt 4 SPA (`ssr: false`), `srcDir: app/`, cổng 4002.
- Nitro (nitropack + h3) là process duy nhất chạm filesystem.
- Renderer chỉ gọi `/api/v1/pdf/*`; không `import 'node:fs'`.
- `electron/ipcPolicy.cjs` allowlist chỉ có eventbus/updater/profiles/youtube/ffmpeg — **không có kênh PDF**.
- Menu sidebar do tm-hub cấp qua `GET /api/v1/apps/:appId/routes`; seed ở `tm-hub/scripts/seed/data.ts:362-369`.

### 1.2. Filesystem

Root = `config.pdf.dir` (`server/config/index.ts:164`), mặc định `<cwd>/.data/pdf`, override `PDF_DATA_DIR`.

```text
.data/pdf/
├── sources/      # PDF gốc (isPdfName)
├── inputs/       # docx/xlsx/csv/json/xml/png/jpg (isInputName)
├── word/         # legacy DOCX, read-only
├── split/        # <stem>/page_0001.pdf
├── images/       # <stem>/page_0001.png
├── merged/       # <folder>_merged.pdf, <folder>_from_images.pdf, <stem>.pdf
├── products/     # <stem>_products.{csv,json,xlsx,docx,xml}
├── office/       # <stem>.docx
├── checkpoints/  # nội bộ extraction
├── .trash/       # soft delete
├── audit.jsonl   # audit log, tối đa 500 dòng
└── presets.json  # extraction presets
```

Cấu hình liên quan: `maxUploadMb` 200, `maxPages` 400, `imageScale` 2, `pagePrefix` `page_`, `padLength` 4.

### 1.3. Route và page hiện có

| Route | File | Area mặc định của Explorer |
|---|---|---|
| `/pdf` | `app/pages/pdf/index.vue` | không có Explorer |
| `/pdf/library` | `app/pages/pdf/library.vue` | đủ 7 area (chỉ trang này) |
| `/pdf/split` | `app/pages/pdf/split.vue` | `sources` |
| `/pdf/images` | `app/pages/pdf/images.vue` | `sources` |
| `/pdf/import` | `app/pages/pdf/import.vue` | `inputs` |
| `/pdf/export` | `app/pages/pdf/export.vue` | `sources` |
| `/pdf/extract` | `app/pages/pdf/extract.vue` | `sources` |
| `/pdf/preview` | `app/pages/pdf/preview.vue` | cửa sổ viewer (`layout: false`) |

**Không có `/pdf/merge`.** Merge là thao tác trên folder trong trang Split.

### 1.4. Component hiện có (`app/components/pdf/`)

| Component | Trách nhiệm |
|---|---|
| `WorkspaceShell.vue` | layout 2 cột, splitter, collapse, lưu `pdf.explorer.width` / `pdf.explorer.collapsed` |
| `FolderTree.vue` | cây folder, search, lazy expand, context menu node |
| `FileBrowser.vue` | header, breadcrumb, toolbar (search/sort/density), list folder+file, upload/empty state; slots `header-actions`, `file-actions`, `empty-extra`, `footer` |
| `FileRow.vue` | một dòng file + `FileActions` |
| `FolderRow.vue` | một dòng folder; emits `open`/`rename`/`delete` |
| `FileActions.vue` | dropdown thao tác file |
| `OutputFolderRow.vue` | dòng folder output kèm 1 hành động chính (merge / build PDF) |
| `ContextMenu.vue` | right-click wrapper |
| `ExportFormatPicker.vue` | checkbox chọn format export |
| `FolderModal.vue`, `RenameModal.vue`, `TrashModal.vue` | CRUD folder, rename, thùng rác |
| `PreviewFile.vue` | dispatcher theo `pdfPreviewKind()` |
| `PreviewTable.vue`, `PreviewText.vue` | bảng CSV/XLSX, text XML |
| `PresetSampleEditor.vue` | soạn sample cho preset extraction |

Primitive dùng chung: `app/components/shared/HeTreeMenu.vue`.

### 1.5. Composable và util

- `usePdfStudio.ts` — toàn bộ lời gọi API + `library`/`jobs`/`trashItems`/`busy` + `errorText()`.
- `usePdfDirectory.ts` — `currentFolder`, `directoryListing`, `tree`, lazy `expandFolder`, `searchFolders`, modal state.
- `usePdfMenus.ts` — `fileItems`, `folderItems`, `workspaceItems`, `refreshItem`; **nguồn duy nhất** của menu file nên row dropdown và right-click luôn khớp.
- `app/utils/pdfStudio.ts` — `pdfPreviewKind`, `openPdfPreview`, `pdfFileMeta`, `PDF_ERROR_KEYS`, accept constants, `pdfParentPath`.

### 1.6. Server module

`paths.ts`, `security.ts` (`safeFileName`/`safeRelativePath`/`safeStem`/`documentStem`), `inspect.ts` (`PDF_FILE_AREAS`, `AREA_DIRS`, `parseArea`, `resolveAreaFile`), `directory.ts`, `library.ts`, `trash.ts`, `audit.ts`, `workspace.ts` (`DESCRIPTORS`, `outputMapping`, `areaAcceptPredicate`, `assertFolderWritable`, `assertFileWritable`, `workspaceReport`, `repairWorkspace`), `document.ts` (split), `merge.ts`, `raster.ts`, `images-to-pdf.ts`, `convert.ts`, `source-export.ts`, `extract/*`, `office/*`, `data/parse.ts`.

### 1.7. API route

```text
GET    /workspace                     POST /workspace/repair
GET    /explorer[?depth=full]         GET  /explorer/children?area=&folder=
GET    /directory?area=&folder=       POST /directory/folder
PATCH  /directory/rename              POST /directory/delete
GET    /library                       GET  /file?area=&name=[&inline=1]
GET    /inspect?area=&name=           GET  /audit[?limit=]
POST   /upload                        POST /inputs/upload
POST   /sources/<name>/split          POST /sources/<name>/images
POST   /sources/<name>/export         POST /sources/<name>/docx
POST   /split/<name>/merge            POST /images/<name>/pdf
POST   /inputs/<name>/pdf             POST /word/<name>/pdf
POST   /word/upload
GET    /merged/<name>                 GET  /office/<name>
GET    /products/<name>               GET  /word/<name>
DELETE /sources/<name>                DELETE /inputs/<name>
DELETE /split/<name>                  DELETE /images/<name>
DELETE /merged/<name>                 DELETE /products/<name>
DELETE /office/<name>                 DELETE /word/<name>
GET    /trash                         POST /trash/restore
DELETE /trash/<id>                    DELETE /trash/empty
POST   /extract/start                 GET  /extract/jobs
GET    /extract/<id>                  POST /extract/<id>/cancel
GET    /extract/models                GET/POST /extract/presets
DELETE /extract/presets/<id>
```

`runPdf()` bọc mọi handler; lỗi module thành HTTP status qua `pdfHttpStatus()`.

### 1.8. Error code đang dùng

`PDF_INVALID`, `PDF_INVALID_EXTENSION`, `PDF_EMPTY_UPLOAD`, `PDF_UPLOAD_TOO_LARGE`, `PDF_TOO_MANY_PAGES`, `PDF_SOURCE_NOT_FOUND`, `PDF_OUTPUT_NOT_FOUND`, `PDF_FOLDER_ALREADY_EXISTS`, `PDF_FOLDER_IMMUTABLE`, `PDF_FILE_IMMUTABLE`, `PDF_FILE_ALREADY_EXISTS`, `PDF_FOLDER_NOT_FOUND`, `PDF_RESULT_NOT_FOUND`, `PDF_EMPTY_FOLDER`, `PDF_JOB_RUNNING`, `PDF_JOB_NOT_FOUND`, `PDF_PRESET_NAME_REQUIRED`, `PDF_PRESET_LIMIT`, `PDF_WORD_LEGACY`, `PDF_WORD_INVALID`, `PDF_WORD_NOT_FOUND`, `PDF_OFFICE_NOT_FOUND`, `PDF_FILE_NOT_FOUND`, `PDF_INPUT_INVALID`, `PDF_NAME_REQUIRED`, `PDF_INVALID_PATH`, `PDF_INPUT_NOT_FOUND`, `PDF_NO_ROWS`, `PDF_EXPORT_NO_FORMAT`, `PDF_PREVIEW_NEEDS_PDF`, `PDF_FONT_MISSING`, `PDF_AI_KEY_MISSING`, `PDF_AI_TIMEOUT`, `PDF_AI_HTTP_429`.

Client map (`PDF_ERROR_KEYS`) còn có `PDF_TRASH_ITEM_NOT_FOUND`, `PDF_EXPORT_FAILED`, `PDF_FOLDER_NAME_REQUIRED`; ba mã này **không** có trong `PDF_ERROR_STATUS`, nên trả 500 — không được phân loại là validation error.

### 1.9. Output mapping và đích ghi thật

`outputMapping` (server, 7 key): `split→split`, `merge→merged`, `rasterize→images`, `imagesToPdf→merged`, `convertInput→merged`, `export→office`, `extract→products`.

Đích ghi chi tiết theo route (khác mapping ở 3 chỗ — xem §10.1):

| Thao tác | Đích thật | Tên |
|---|---|---|
| Split | `split/` | `<documentStem(source)>/page_0001.pdf…` |
| Merge | `merged/` | `<folder>_merged.pdf` từ `split/<folder>` |
| Rasterize | `images/` | `<documentStem(source)>/page_0001.png…` |
| Images→PDF | `merged/` | `<folder>_from_images.pdf` từ `images/<folder>` |
| Convert input | `merged/` | `<safeStem(input)>.pdf` |
| Export `png` | `images/` | `<documentStem(source)>/` |
| Export `docx` | `office/` | `<documentStem(source)>.docx` |
| Export `xlsx/csv/json/xml` | `products/` | `<documentStem(source)>_products.<ext>`, chỉ khi đã có rows AI cache |
| PDF→Word | `office/` | `<documentStem(source)>.docx` |
| AI Extract | `products/` | `<stem>_products.{csv,json,xlsx,docx,xml}` |

Quy tắc tên phải **lấy từ server**, không đoán ở client: `documentStem()` bỏ đuôi `.pdf/.docx/.doc`; `pageFileName()` ghép `page_` + 4 chữ số; merge/images→PDF dùng `safeFileName(folder)` + hậu tố cố định.

### 1.10. Permission descriptor

`word`: `writableFiles: false`, `writableFolders: false` — bất biến. Các area còn lại `true/true`. Mọi area có `systemRoot: true`, nên root không rename/delete. `accept`: `pdf` cho `sources`/`merged`, `input` cho `inputs`/`word`, `all` cho phần còn lại.

`deleteAreaItem` chặn `path` rỗng bằng `PDF_INVALID_PATH`, nên không thể xoá root qua API.

### 1.11. Năng lực đang có (dùng để chặn "bịa tính năng")

Có: upload/rename/delete folder+file, lazy tree, deep search, trash restore/purge, workspace report/repair, audit log (chưa có UI), preview 7 loại file, split toàn bộ trang, merge folder split, rasterize, images→PDF, convert input, export (có điều kiện), AI extraction async + preset + checkpoint + cancel.

**Không có** — không được hiển thị như đang chạy: page-range split, odd/even split, rotate, compress, OCR, table extraction, form extraction, validation/review, merge nhiều PDF rời, multi-file selection, job history bền vững, DPI/quality cho raster, output-folder picker.

---

## 2. Information architecture

### 2.1. Điều chỉnh so với bản nháp

Bản nháp đề xuất menu mới (`Tools / Files / Activity / Settings`). Điều đó **không cần** và còn tạo rủi ro: menu do tm-hub quản lý, mọi thay đổi phải sửa `scripts/seed/data.ts` bên tm-hub rồi seed lại, và phải thêm key `nav.pdf_*` ở cả hai locale.

Thực tế menu hiện tại đã là task-first:

| Route | Key | EN | VI |
|---|---|---|---|
| `/pdf` | `nav.pdf_overview` | Overview | Tổng quan |
| `/pdf/library` | `nav.pdf_library` | PDF library | Thư viện PDF |
| `/pdf/split` | `nav.pdf_split` | Split & merge | Tách & Ghép |
| `/pdf/images` | `nav.pdf_images` | Page images | Ảnh PDF |
| `/pdf/export` | `nav.pdf_export` | PDF → other formats | Xuất PDF |
| `/pdf/import` | `nav.pdf_import` | Other formats → PDF | Nhập PDF |
| `/pdf/extract` | `nav.pdf_extract` | AI extraction | Bóc tách bảng giá |

**Quyết định v3:** giữ nguyên 7 route và 7 key menu. Không thêm route `/pdf/merge`, không thêm mục "Coming later". Cải thiện nằm ở Home và composition từng trang, không ở menu.

Nếu sau này muốn nhóm 7 mục thành các nhóm cấp 2 trong sidebar, đó là việc của tm-hub seed + `parent_id`, làm thành phase riêng có cập nhật i18n; không tự chế menu trong app.

### 2.2. Home (`/pdf`)

Nguồn dữ liệu được phép dùng (đều là API thật):

- `GET /library` → `PdfLibrary` (`sources`, `inputs`, `split`, `images`, `merged`, `products`, `office`, `maxUploadMb`, `maxPages`, `imageScale`, `trashCount`).
- `GET /workspace` → `PdfWorkspaceReport` (`needsRepair`, `outputMapping`).
- `GET /extract/models` → số model AI khả dụng (badge "AI sẵn sàng").

Cấu trúc:

```text
TIÊU ĐỀ — Document Studio
          Bạn muốn làm gì với tài liệu?

[ Tìm công cụ… ]                     (lọc trong danh sách operation đã có)

TÁCH & GHÉP            CHUYỂN ĐỔI             BÓC TÁCH
Split · Merge          Import · Export         AI Extraction

[ Thư viện tài liệu ]  (card lớn, luôn hiện)
```

Quy tắc:

- Card dẫn thẳng tới route hiện có. Không card nào là "sắp có".
- Số đếm chỉ hiện khi `library` đã tải; khi chưa có hiện `—`, không hiện `0` giả.
- `needsRepair` hiện banner + nút "Sửa workspace" gọi `POST /workspace/repair`. Đây là hành động duy nhất không phải điều hướng.
- Bảng `outputMapping`, giới hạn upload, thông tin kỹ thuật chuyển vào một `<details>` thu gọn cuối trang.
- Không có "recent documents": chưa có endpoint lịch sử. `GET /audit` chỉ ghi mutation, không phải danh sách tài liệu gần đây.

Search trên Home lọc danh sách `PDF_OPERATIONS` khai báo trong `app/utils/pdfOperations.ts` (§7). Không gọi API.

### 2.3. Khung chung của trang công cụ

Mọi trang công cụ (split/images/import/export/extract) theo đúng thứ tự:

```text
BasePage (title + description)
└── PdfWorkspaceShell
    ├── aside: PdfFolderTree        ← cùng 7 area trên mọi trang
    └── main
        ├── PdfFileBrowser          ← danh sách file duy nhất
        ├── PdfDocumentDataFlowNote ← Đầu vào → Xử lý → Đầu ra
        ├── <OperationActions>      ← 1 nút chính + nút tuỳ chọn của operation
        └── PdfOperationResult      ← chỉ hiện sau khi chạy
```

Không có panel danh sách file thứ hai. Không có form cấu hình dài thường trực; cấu hình nằm trong `UModal` mở từ nút chính.

### 2.4. Library (`/pdf/library`)

Giữ vai trò hiện tại, chỉ sửa cho khớp mô hình mới:

- Explorer 7 area như hiện nay.
- Một FileBrowser, upload theo `areaAcceptPredicate(area)`.
- Không flow note, không nút operation.
- Menu row vẫn là `fileItems()` — preview, download, reveal, copy, rename/delete theo `writableFiles`.

Library hiện đã là chuẩn và là **reference implementation** cho các trang khác.

---

## 3. Mô hình tương tác

Bốn trạng thái phải tách rời. Hiện code đang trộn chúng.

### 3.1. Active Folder — đang duyệt thư mục nào

- Một giá trị `{ area: PdfFileArea, folder: string }`.
- Chỉ `usePdfDirectory` quản lý; mọi trang dùng chung composable này.
- Click tên folder: đổi Active Folder, tải danh sách file.
- Click chevron: chỉ mở/đóng node, **không** đổi Active Folder (`FolderTree.handleToggle` hiện đã đúng — giữ nguyên).
- Không cho phép chọn nhiều folder. `HeTreeMenu` hiện **luôn render** `UCheckbox` ở mỗi node (`HeTreeMenu.vue:334-343`) và chỉ bỏ qua `node:select` nếu trang không lắng nghe — `FolderTree` không lắng nghe, nên người dùng vẫn thấy checkbox nhưng bấm không có tác dụng. v3 bắt buộc thêm prop `hideCheckbox` (mặc định `false` để trang `administration/routes.vue` không đổi) và `FolderTree` truyền `:hide-checkbox="true"`. Không được coi "checkbox chết" là trạng thái chấp nhận được.

### 3.2. Active Input — tài liệu được chọn để xử lý

- Một giá trị `DocumentSelection | null` (§6).
- Tách khỏi Active Folder: đổi folder không xoá input.
- Chỉ đặt khi người dùng bấm **"Dùng làm đầu vào"** trên row, hoặc **"Dùng thư mục này"** trên folder row (chỉ operation cần folder).
- Không suy ra từ folder đang mở. Không đặt mặc định file đầu tiên khi vào trang — hành vi ở `export.vue:29-39` và `extract.vue:221-224` phải bỏ.
- Đổi operation: nếu input không khớp `allowedAreas`/`acceptedTypes`, giữ input nhưng vô hiệu hoá nút chạy và hiện lý do. Không tự thay file khác.

### 3.3. Preview Target — file đang mở trong cửa sổ riêng

- Hiện do `openPdfPreview()` + route `/pdf/preview` quản lý; giữ nguyên.
- Mở preview không đổi Active Input, không đổi Active Folder.
- Đóng preview không huỷ job extraction (job nằm ở Nitro).

### 3.4. Operation — công cụ hiện tại

- Xác định bởi route; không phải state.
- Cấu hình nằm trong modal, reset khi đóng modal, không reset khi đổi folder.

### 3.5. Ai sở hữu state

| State | Chủ sở hữu | Ghi chú |
|---|---|---|
| Explorer width / collapsed | `WorkspaceShell` + `localStorage` (`pdf.explorer.width`, `pdf.explorer.collapsed`) | đã có |
| Node expand | `FolderTree.expandedIds` + `usePdfDirectory.expandFolder` cache | đã có |
| Active Folder | `usePdfDirectory` | đã có, giữ |
| Active Input | composable mới `usePdfSelection` | **cần thêm** |
| Preview Target | route `/pdf/preview` query | đã có |
| Search/sort/density | `FileBrowser` nội bộ | đã có, không persist |
| Operation config | page/modal nội bộ | đã có |
| Job/progress | `usePdfStudio.jobs` + poll 2500ms ở trang extract | đã có |

Không thêm store mới, không persist selection qua `localStorage`.

---

## 4. Layout workspace

### 4.1. Shell

`WorkspaceShell` giữ nguyên API. Props: `tree`, `currentFolder`, `area`, `loading`, `title`, `selectedKey`, `canCreate`, `rootLabel`, `lazy`; emits `select`, `create`, `rename`, `delete`, `expand`, `search`.

### 4.2. Explorer trái — dùng chung 7 area

Hiện chỉ `library.vue` dựng đủ 7 root (`EXPLORER_AREAS`, `tree`, `expandFolder`, `searchFolders`, `loadAreaRules`). Phần này phải **chuyển nguyên vào composable** `usePdfExplorer()` để 5 trang công cụ dùng lại, thay vì mỗi trang `usePdfDirectory('sources')`.

Hợp đồng `usePdfExplorer()`:

```ts
function usePdfExplorer(): {
  tree: ComputedRef<PdfFolderTreeNode[]>          // 7 root + children lazy-load
  activeArea: Ref<PdfFileArea>
  currentFolder: Ref<string>
  folders: ComputedRef<PdfFolderInfo[]>
  files: ComputedRef<PdfFileInfo[]>
  breadcrumbs: ComputedRef<Array<{ name: string, path: string }>>
  parentFolder: ComputedRef<string | null>
  loading: Ref<boolean>
  rules: (area: PdfFileArea) => { files: boolean, folders: boolean }
  reload: () => Promise<void>
  select: (folder: string, area?: PdfFileArea) => Promise<void>
  expand: (folder: { path: string, area?: PdfFileArea }) => Promise<void>
  searchFolders: (term: string) => Promise<void>
  openCreateFolder: (parent: string, area?: PdfFileArea) => void
  openRename: (item: { name: string, path: string }, isFolder: boolean, area?: PdfFileArea) => void
  confirmDelete: (item: { name: string, path: string }, area?: PdfFileArea) => Promise<void>
}
```

Nguồn dữ liệu:

- `GET /explorer` cho cây cấp 1; `GET /explorer?depth=full` khi search cần khớp sâu.
- `GET /explorer/children?area=&folder=` khi expand node lazy.
- `GET /directory?area=&folder=` cho danh sách file của folder đang mở.
- `GET /workspace` để lấy `writableFiles`/`writableFolders`, thay cho hard-code.

Quy tắc:

- Root luôn `system: true`; không rename/delete (server cũng chặn).
- `word` không có trong 7 area hiển thị; file legacy vẫn mở được nhờ fallback trong `resolveAreaFile`.
- Không hiển thị `checkpoints/` hay `.trash/`.
- `foldersWritable`/`fileDeletable` lấy từ `report.areas`, không đoán theo tên area.

### 4.3. Phải — một FileBrowser

Một instance duy nhất mỗi trang. Thay đổi cần làm trên `FileBrowser.vue`:

1. **Bỏ hành vi click-để-chọn.** Hiện `openFile()` chọn hay preview tuỳ `selectable`, khiến cùng một cú click mang hai nghĩa. Đổi thành:
   - Click tên file → **luôn** `openPdfPreview`.
   - Thêm nút "Dùng làm đầu vào" trên row, chỉ render khi `pickable`.
2. **Thêm prop `pickable`** hoặc slot `file-actions` (đã có slot) để trang cắm nút chọn; bỏ hẳn `selectable`.
3. **Thêm slot `folder-actions`** để folder row nhận nút theo operation ("Ghép folder này", "Tạo PDF từ ảnh", "Dùng thư mục này"). Hiện `FolderRow` chỉ emit `open`/`rename`/`delete`, nên không thể đặt action operation.
4. **Thêm slot `flow-note`** ngay dưới breadcrumb để gắn `PdfDocumentDataFlowNote`.
5. **Giữ nguyên** `readonly`, `foldersWritable`, `deletable`, `trashCount`, `fill`, `listClass`, `fileMenu`.

Không tạo `SplitFileBrowser`, `MergeFileBrowser`, `ImagesFileBrowser`.

### 4.4. Hiển thị

Giữ hai chế độ đang có: list thường và compact. Không thêm grid/details khi chưa đo được nhu cầu. `PDF_PAGE_SIZE = 25` hiện khai báo nhưng không dùng; hoặc dùng cho folder >200 file, hoặc xoá — không để hằng số chết.

### 4.5. Tương tác row

| Vùng | Hành vi |
|---|---|
| Icon/tên file | Mở preview cửa sổ riêng |
| Nút "…" | `fileItems()` — preview, download, reveal, copy, rename, delete theo quyền |
| Right-click | Cùng `fileItems()` (`PdfContextMenu`) |
| Nút operation (nếu có) | Hành động chính của operation trên file/folder đó |
| Checkbox | **Không thêm** ở v3 |

Mọi nút phải hoạt động hoặc disabled kèm `title` giải thích. Ví dụ: export format dữ liệu khi chưa có AI cache phải disabled kèm lý do "Cần chạy Bóc tách trước".

---

## 5. Data Flow Note — nói rõ dữ liệu đi đâu

### 5.1. Component

`PdfDocumentDataFlowNote.vue` trong `app/components/pdf/`. Thuần trình bày: nhận dữ liệu qua props, không tự gọi API, không tự ghép path.

```ts
withDefaults(defineProps<{
  operation: string                 // tên hiển thị của operation
  input: {
    count: number
    label: string                   // "Chưa chọn tệp" | "3 tệp PDF" | "Thư mục: ..." 
    detail?: string                 // "sources/hoa-phat" hoặc "2 folder"
  }
  output: {
    areaLabel: string               // t("pdf.areas.split")
    relativePath?: string           // "" hoặc "<stem>/" nếu đã biết
    openable: boolean               // true khi biết chắc folder đích
  }
  state: 'empty' | 'partial' | 'ready'  // ảnh hưởng màu/icon
}>(), { ... })
```

Emit `openOutput` khi người dùng bấm "Mở thư mục đầu ra". Trang cha quyết định cách điều hướng Explorer.

### 5.2. Nội dung bắt buộc

```text
ĐẦU VÀO                       XỬ LÝ                ĐẦU RA
hoa-phat-2026.pdf       →     Tách trang      →    Trang tách
sources/hoa-phat/                                   split/ (folder)
                                                          [Mở thư mục đầu ra]
```

Bố cục 3 cột ở `md+`, gộp dọc dưới `md`. Không phải flowchart lớn; dùng `panel-flat` hiện có.

### 5.3. Trạng thái đầu vào

| Trạng thái | Nội dung | Nguồn |
|---|---|---|
| Chưa chọn | "Chưa chọn tệp" + tên folder đang duyệt, nhãn rõ là *đang duyệt* | `usePdfExplorer` |
| Một file | Tên file + folder nguồn | `usePdfSelection.selection` |
| Một folder | "Thư mục: `<name>`" + `fileCount` | `usePdfSelection.selection` |
| Nhều file | Chưa hỗ trợ ở v3 → không render nhánh này | — |

Tuyệt đối không hiển thị "toàn bộ folder đang mở" như thể đã chọn.

### 5.4. Trạng thái đầu ra

- Area lấy từ `outputMapping[tool]` của `GET /workspace`; **không** hard-code.
- Nhãn area lấy từ `t("pdf.areas.<area>")`.
- `relativePath` chỉ điền khi server đã trả về hoặc công thức đặt tên đã xác định (§10.2). Nếu chưa xác định, hiện tên area trần — ví dụ `split/` — và vẫn cho bấm "Mở thư mục đầu ra" để mở root area.
- Không hiện absolute path.

### 5.5. Snapshot trước khi chạy

Trước khi gọi API, trang giữ lại trong scope của lần chạy:

- `selection` (`area` + `relativePath` + `kind`)
- nội dung cấu hình của operation
- `overwrite`
- `outputArea` đã resolve

Các thông tin này chỉ để hiển thị kết quả và để "Mở thư mục đầu ra"; không gửi thêm field lạ vào API hiện tại.

---

## 6. Input selection model

### 6.1. Type

Thêm vào `shared/types/pdf.ts` (dùng chung client/server type, không trùng tên khác):

```ts
export interface PdfDocumentRef {
  area: PdfFileArea
  /** Đường dẫn tương đối trong area; "" nghĩa là chính area root. */
  relativePath: string
  name: string
  kind: 'file' | 'folder'
}

export interface PdfSelection {
  mode: 'single-file' | 'folder'
  item: PdfDocumentRef
}
```

Không thêm `multi-file` cho tới khi có API nhận nhiều input.

### 6.2. Composable `usePdfSelection`

```ts
function usePdfSelection(operationId: keyof typeof PDF_OPERATIONS): {
  selection: Ref<PdfSelection | null>
  pickFile: (ref: PdfDocumentRef) => void
  pickFolder: (ref: PdfDocumentRef) => void
  clear: () => void
  compatible: (ref: PdfDocumentRef) => { ok: boolean, reason?: string }
  isValid: ComputedRef<boolean>
}
```

Quy tắc:

- `pickFile` chỉ nhận khi operation khai báo `mode: 'single-file'` và `ref.area` nằm trong `input.areas`.
- `pickFolder` tương tự với `mode: 'folder'`.
- Chọn mới **thay** lựa chọn cũ (single-item). Không có multi-select ở v3.
- `selection` reset khi rời route (page unmount). Không persist.
- Nếu file bị xoá trong lúc đang chọn: lần gọi API sẽ trả `PDF_SOURCE_NOT_FOUND`/`PDF_INPUT_NOT_FOUND`; hiện lỗi và giữ selection để người dùng chọn lại.

### 6.3. Vì sao chưa có Input Picker

Bản nháp đề xuất `OperationInputPicker` cho multi-file. Backend hiện **không** nhận nhiều file cho bất kỳ operation nào (split/rasterize/convert/export/extract đều là 1 tên file; merge/imagesToPdf là 1 folder). Vì vậy picker chưa có nhu cầu thực. Chỉ làm khi thêm API nhận batch — lúc đó picker dùng lại `FolderTree` + `FileBrowser` trong `UModal`, không đổi Explorer ngoài.

---

## 7. Operation metadata

### 7.1. Ranh giới trách nhiệm

| Lớp | Quyết định gì |
|---|---|
| `PDF_OPERATIONS` (client) | nhãn i18n, category, input mode/area, `mappingKey`, cần cấu hình không, sync/async, nút chính |
| `server/modules/pdf/workspace.ts` | area permission, `outputMapping`, validate extension/size |
| Route module | validate tên/path, ghi file, audit |

Client **không** được quyết định quyền hay đích ghi. Không tạo "server registry thứ hai" trong frontend.

### 7.2. Kiểu

```ts
export interface PdfOperationMeta {
  id: string
  titleKey: string
  descriptionKey: string
  category: 'organize' | 'convert' | 'images' | 'extract' | 'export'
  input: {
    mode: 'single-file' | 'folder'
    areas: PdfFileArea[]
    accept: 'pdf' | 'input' | 'image' | 'any'
  }
  output: {
    /** Khoá trong outputMapping của server. */
    mappingKey: 'split' | 'merge' | 'rasterize' | 'imagesToPdf' | 'convertInput' | 'export' | 'extract'
  }
  execution: {
    mode: 'sync' | 'async'
    supportsCancel: boolean
    supportsOverwrite: boolean
  }
  config: 'none' | 'formats' | 'extraction'
  /** Nơi server đặt output; dùng cho Data Flow Note. */
  resultHint: 'folder' | 'file' | 'multi-format'
}
```

`output.area` **không** khai báo trong metadata; đọc từ `outputMapping` của `GET /workspace` để chỉ có một nguồn sự thật.

### 7.3. Operation matrix (chỉ những gì đang chạy)

| id | Trang | Input | Areas | Output mapping | Execution | Config |
|---|---|---|---|---|---|---|
| `split` | `/pdf/split` | single-file | `sources` | `split` | sync | none (tách toàn bộ trang) |
| `merge` | `/pdf/split` | folder | `split` | `merge` | sync | none |
| `rasterize` | `/pdf/images` | single-file | `sources` | `rasterize` | sync | none (`imageScale` từ config) |
| `imagesToPdf` | `/pdf/images` | folder | `images` | `imagesToPdf` | sync | none |
| `convertInput` | `/pdf/import` | single-file | `inputs` (+ legacy `word` đọc) | `convertInput` | sync | none |
| `export` | `/pdf/export` | single-file | `sources` | `export` | sync | formats |
| `extract` | `/pdf/extract` | single-file | `sources` | `extract` | async job | model + preset + formats |

Ghi chú:
- `export` ghi **ba area khác nhau** tuỳ format (xem §10.1). Metadata vẫn trỏ `export` → `office` theo `outputMapping`; Data Flow Note phải hiển thị cảnh báo "PNG → Ảnh PDF, dữ liệu → Dữ liệu trích xuất" thay vì một đích duy nhất.
- `split` và `rasterize` dùng cùng công thức `<documentStem(source)>`; `merge` và `imagesToPdf` dùng `<folder>` + hậu tố cố định.

### 7.4. Vòng đời

1. `idle` — chưa có selection.
2. `selected` — selection hợp lệ với `input` của operation.
3. `invalid` — selection không khớp; nút chính disabled + lý do.
4. `running` — API/job đang chạy; khoá nút chính và cấu hình.
5. `done` — có kết quả; hiện `PdfOperationResult`.
6. `failed` — giữ selection + config; lỗi hiện qua `errorText()`.

Không bịa bước `partial` cho sync operation: server không trả trạng thái một phần trừ `export` (mảng `PdfExportFormatResult`, có `ok` từng format — đó là `partial` thật, được phép hiển thị).

### 7.5. Kết quả

Một component `PdfOperationResult.vue` duy nhất, nhận:

```ts
{
  status: 'success' | 'partial' | 'failed'
  summary: string
  items: Array<{ label: string, ok: boolean, detail?: string }>
  outputArea: PdfFileArea
  outputFolder: string     // "" = area root
  openable: boolean
}
```

Chứa "Mở thư mục đầu ra" (emit), link preview cho file đơn, và danh sách format cho export/extract. Không render lại danh sách file — việc đó thuộc FileBrowser.

---

## 8. Đặc tả từng trang

### 8.1. Home `/pdf`

- Header: title `pdf.title`, description `pdf.description`.
- Tool cards từ `PDF_OPERATIONS` lọc `category`, mỗi card hiện icon + title + description i18n.
- "Thư viện tài liệu" là card riêng, không thuộc operation.
- Banner repair khi `needsRepair`.
- `<details>` cuối trang: `outputMapping`, `maxUploadMb`, `maxPages`, `imageScale`, trạng thái AI models.
- Bỏ bảng pipeline `import → library → split → images → export → extract` khỏi phần chính: nó mô tả thứ tự nội bộ, không phải công việc người dùng chọn.

### 8.2. Library `/pdf/library`

Chỉ hai thay đổi:
1. Chuyển logic explorer sang `usePdfExplorer()`.
2. Bỏ `overwrite` checkbox ở `#footer`: Library không chạy operation nào dùng `overwrite`; hộp kiểm hiện tại không có tác dụng và gây hiểu nhầm.

Giữ: nút split nhanh trên row `sources` (gọi `POST /sources/<name>/split` với `overwrite: true`) — nhưng đổi nhãn thành hành động rõ ràng và thêm confirm nếu folder đích đã tồn tại.

### 8.3. Split & Merge `/pdf/split`

Một trang, hai operation, phân biệt bằng area đang duyệt:

| Active area | Hành động chính trên row |
|---|---|
| `sources` | Nút "Tách trang" trên file → `POST /sources/<name>/split` |
| `split` | Nút "Ghép folder" trên folder → `POST /split/<folder>/merge` |
| `merged` | Không có action mới; chỉ preview/download/xoá như Library |
| khác | Không có action; vẫn xem được file |

Thay đổi so với hiện tại:

- Bỏ hai panel "Split folders" (`split.vue:160-198`) và "Built PDFs" (`split.vue:200-242`). Người dùng mở `split`/`merged` trong Explorer để xem.
- Thêm Data Flow Note phía trên danh sách.
- Bỏ `overwrite` checkbox khỏi footer; chuyển vào modal xác nhận của action (mặc định bật).
- Không có dialog cấu hình page-range: backend không hỗ trợ.

### 8.4. Images `/pdf/images`

| Active area | Hành động |
|---|---|
| `sources` | "Xuất ảnh" trên file → `POST /sources/<name>/images` |
| `images` | "Tạo PDF" trên folder → `POST /images/<folder>/pdf` |
| `merged` | xem kết quả |

- Bỏ panel "Image folders" (`images.vue:156-194`).
- Data Flow Note: `sources` → `images/` hoặc `images/<folder>` → `merged/`.
- Không có DPI/format/quality: `rasterizePdf` chỉ có `imageScale` từ config, luôn PNG.

### 8.5. Import & Convert `/pdf/import`

| Active area | Hành động |
|---|---|
| `inputs` | "Chuyển thành PDF" trên file → `POST /inputs/<name>/pdf` |
| `merged` | xem kết quả |
| `sources` | xem PDF đã tạo nếu convert sang `merged` rồi split |

- Bỏ panel "Converted" (`import.vue:157-187`).
- Upload accept `PDF_INPUT_ACCEPT` (`.png,.jpg,.jpeg,.docx,.xlsx,.csv,.json,.xml`), khớp `isInputName`.
- Không hiển thị format backend không nhận. Hiện `PDF_INPUT_FORMAT_META` có đúng 6 mục khớp `PDF_INPUT_FORMATS`.
- Data Flow Note: `<input>` → `merged/<stem>.pdf`.

### 8.6. Export `/pdf/export`

| Active area | Hành động |
|---|---|
| `sources` | Nút "Xuất" mở modal chọn format |
| `office`/`products`/`images` | xem kết quả |

- Panel formats thường trực → `UModal` (dùng lại `ExportFormatPicker`).
- Data Flow Note liệt kê đích theo format đang tick:
  - `png` → Ảnh PDF (`images/<stem>/`)
  - `docx` → Word & Excel (`office/<stem>.docx`)
  - `xlsx/csv/json/xml` → Dữ liệu trích xuất (`products/<stem>_products.<ext>`) **chỉ khi có AI cache**; nếu chưa có, checkbox disabled + lý do "Cần Bóc tách trước".
- Vẫn dùng kết quả dạng mảng `PdfExportFormatResult` — đây là operation duy nhất có `partial` thật.
- Không có nút "chọn folder đích".

### 8.7. AI Extraction `/pdf/extract`

| Active area | Hành động |
|---|---|
| `sources` | "Bóc tách" mở modal cấu hình |
| `products` | xem kết quả |

- Panel model/preset/formats và panel results (`extract.vue:366-468`, `:532-562`) → modal + `PdfOperationResult`.
- **Giữ** panel Jobs (`extract.vue:470-530`): job là trạng thái async thật, cần thấy cả khi đóng modal. Đây là ngoại lệ có chủ đích, không phải "danh sách file thứ hai".
- Poll `PDF_STUDIO_POLL_MS = 2500` khi có job `running`/`queued`; `onUnmounted` phải clear interval (hiện đã đúng).
- Chỉ một job chạy cùng lúc — server trả `PDF_JOB_RUNNING`.
- Job state mất khi Nitro restart (`new Map()`); UI phải nói rõ "Lịch sử job chỉ trong phiên này".
- Preset lưu `presets.json`; giới hạn theo `PDF_PRESET_LIMIT`.
- Checkpoint dùng `checkpoints/<stem>/<page>.json`, khoá theo tên page — **không** fingerprint theo model/preset/schema. Ghi rõ trong UI bằng một dòng `help` dưới phần model: "Kết quả cache dùng lại theo tên file/trang; đổi model hoặc preset không tự xoá cache."
- Kết quả: `products/<stem>_products.{csv,json,xlsx,docx,xml}` — **cả 5 file trong một lần chạy**, không phụ thuộc checkbox formats. Checkbox formats hiện tại (`outputFormats`) chỉ lưu preference và **không** ảnh hưởng server; phải hoặc bỏ, hoặc nối vào backend. v3 chọn: **bỏ checkbox**, hiển thị "Xuất CSV, JSON, XLSX, DOCX, XML" như thông tin.

### 8.8. Preview `/pdf/preview`

Giữ nguyên. Đã có:
- `iframe` cho PDF.
- `img` cho PNG/JPG, kèm zoom 7 mức (`0.5…3`) và rotate 90° — chỉ bật cho ảnh.
- Bảng CSV/XLSX qua `/inspect`.
- DOCX → HTML qua Mammoth, đã `sanitizeHtml`.
- JSON qua `InputsJsonEditor` read-only.
- XML qua `PreviewText`.
- Fallback "convert" cho DOCX chưa có PDF, và "unsupported".

Chưa có và **không hứa** trong v3: thumbnail PDF, page navigation riêng, text search, fit width/page cho PDF (trình duyệt tự lo), fullscreen, Previous/Next trong tập kết quả.

---

## 9. Component

### 9.1. Kiểm kê trách nhiệm (dùng lại, không move hàng loạt)

| Component | Sở hữu | Không được sở hữu |
|---|---|---|
| `WorkspaceShell` | layout 2 cột, resize, collapse, lưu width | API, operation |
| `FolderTree` | cây, search, expand, context menu node | selection, operation |
| `FileBrowser` | danh sách, toolbar, breadcrumb, empty state | path, mutation, config |
| `FileRow` / `FolderRow` | hiển thị metadata + menu row | store, API |
| `DocumentDataFlowNote` (mới) | hiển thị input → output | resolve path, API |
| `OperationResult` (mới) | tóm tắt kết quả + nút mở đích | danh sách file |
| Form operation (trong modal) | thu thập config | ghi file |
| `PreviewFile` | hiển thị read-only | sửa file |
| Composable | state + typed API | fs |
| Nitro module | validate, permission, ghi file | UI |

### 9.2. File cần thêm

| File | Mục đích |
|---|---|
| `app/composables/usePdfExplorer.ts` | tách explorer 7 area khỏi `library.vue` |
| `app/composables/usePdfSelection.ts` | Active Input |
| `app/utils/pdfOperations.ts` | `PDF_OPERATIONS` metadata |
| `app/components/pdf/DocumentDataFlowNote.vue` | flow note |
| `app/components/pdf/OperationResult.vue` | tóm tắt kết quả |

Nuxt auto-import prefix theo thư mục, nên file `pdf/DocumentDataFlowNote.vue` dùng trong template là `<PdfDocumentDataFlowNote>`, và `pdf/OperationResult.vue` là `<PdfOperationResult>`. Tài liệu dùng tên file khi nói về file và tên tag khi nói về template.

Không di chuyển file hiện có sang thư mục con (`workspace/`, `browser/`...): lợi ích thấp, tạo churn import và làm nhiễu diff. Giữ phẳng `app/components/pdf/`.

### 9.3. Tái sử dụng

- Component đã đáp ứng 70–80% → mở rộng backward-compatible.
- Không tạo wrapper rỗng.
- Không thêm thư viện UI mới; dùng Nuxt UI (`UModal`, `UDropdownMenu`, `UButton`, `UCheckbox`, `UFormField`, `USelect`, `UFileUpload`) và token hiện có.
- Nút chính: `color="primary" variant="soft"` — đúng một nút mỗi bề mặt (AGENTS.md).

---

## 10. Điểm lệch hợp đồng phải xử lý

Đây là những chỗ code hiện **không khớp** với kỳ vọng "một mapping ↔ một đích". Không được che giấu bằng UI.

### 10.1. `outputMapping.export` chỉ đúng một phần

`outputMapping.export = 'office'`, nhưng route `/sources/<name>/export` ghi:

- `png` → `images/`
- `docx` → `office/`
- `xlsx|csv|json|xml` → `products/`

Hệ quả cho v3: Data Flow Note **không** được nói "đầu ra: Word & Excel" khi người dùng tick CSV. Có ba lựa chọn, chọn một và ghi vào plan trước khi code:

| Phương án | Việc phải làm | Đánh giá |
|---|---|---|
| A. Client hiển thị 3 đích theo format | chỉ sửa UI | **khuyến nghị** — không đổi server, không phá dữ liệu |
| B. Đổi `outputMapping.export` thành map theo format | đổi type + route + test | contract change lớn, phải version |
| C. Tách 3 operation riêng | route mới, metadata mới | nhiều việc, chưa cần |

### 10.2. `PdfExportFormatResult` không trả về area

Route trả `{ format, ok, name?, error? }`. `name` là tên file hoặc folder nhưng **không kèm area**, nên client phải biết trước format nào ghi vào area nào. v3: client map tĩnh theo format (bảng §1.9) và đối chiếu `outputMapping` — không đoán từ `name`.

### 10.3. Tên output không trả về trước khi chạy

Server chỉ trả tên sau khi ghi (`{ folder: stem }` với split/rasterize; `{ file: outputName }` với merge/imagesToPdf). Data Flow Note vì thế **không được** hiện tên file đích trước khi chạy, trừ khi client lặp lại đúng công thức server. v3 chọn: hiện **area + folder dự đoán theo công thức đã đọc từ code**, ghi rõ công thức trong `pdfOperations.ts` bằng comment ngắn, và coi server là nguồn đúng khi chạy xong (kết quả dùng `name` server trả).

Nếu công thức trong code đổi, Data Flow Note sẽ sai — vì vậy thêm test đơn vị đối chiếu công thức client với server (§13).

### 10.4. `deleteAreaItem('sources', file)` xoá cả dẫn xuất

`removeSource` xoá file nguồn, `split/<stem>`, `images/<stem>`, `checkpoints/<stem>`, `merged/<stem>_merged.pdf`, và `products/<stem>_products.*`. UI phải nói rõ trong confirm: "Xoá cả kết quả tách/ảnh/dữ liệu liên quan". Hiện `library.vue` chỉ nói "xoá file".

### 10.5. Hai mã lỗi trả 500

`PDF_FOLDER_NAME_REQUIRED`, `PDF_TRASH_ITEM_NOT_FOUND`, `PDF_EXPORT_FAILED` không có trong `PDF_ERROR_STATUS`. v3: thêm ba dòng vào `server/utils/pdfApi.ts` (422/404/422) để client phân loại đúng. Đây là sửa lỗi, không phải đổi contract.

### 10.6. Checkbox `overwrite` ở Library áp cho đúng một action

`library.vue:33` có `overwrite` và `library.vue:192` dùng nó cho nút split nhanh. Nhưng Library là trang duyệt file, không phải trang chạy operation: một checkbox ghi đè nằm ở footer áp cho một nút trên row là quan hệ khó thấy. v3: bỏ checkbox khỏi Library; nút split nhanh mở confirm có checkbox `overwrite` (mặc định bật) và cảnh báo sẽ thay folder đích nếu đã tồn tại. Các trang công cụ giữ checkbox, nhưng đặt ngay trong modal action thay vì footer.

### 10.7. `outputFormats` ở Extract không tới server

`extract.vue` lưu `outputFormats` vào `localStorage` nhưng `startExtraction` không gửi; server luôn ghi cả 5 file. v3: bỏ checkbox và dòng code persist, hiển thị danh sách format như thông tin.

### 10.8. Lazy tree không hiển thị khác biệt với dữ liệu phẳng

`.data/pdf` hiện không có folder lồng sâu, nên cây lazy trông giống cây eager. Không phải bug. Test/verification phải ghi rõ điều này để không "sửa" một hành vi đúng.

---

## 11. Backend giữ nguyên trong v3

### 11.1. Ranh giới

```text
Renderer (Nuxt SPA, ssr:false)
   │ fetch /api/v1/pdf/*
   ▼
Nitro routes (server/api/v1/pdf/*)
   ▼
server/modules/pdf/*
   ├── inspect / paths / security      whitelist area, path an toàn
   ├── workspace                       DESCRIPTORS, outputMapping, report/repair
   ├── directory / library / trash     CRUD, soft delete
   ├── document / merge / raster / images-to-pdf / convert / source-export
   ├── extract/*                        job, preset, checkpoint, provider
   └── audit                            audit.jsonl
   ▼
config.pdf.dir  (.data/pdf)
```

### 11.2. Nguồn sự thật

- `PDF_FILE_AREAS` — whitelist area.
- `DESCRIPTORS` — quyền file/folder, `accept`, `systemRoot`.
- `outputMapping` — tool → area, trả qua `GET /workspace`.
- `safeFileName` / `safeRelativePath` / `safeStem` / `documentStem` / `resolveAreaFile` / `assertInsideRoot`.
- `runPdf` + `pdfHttpStatus` — error code → HTTP.
- `overwriteFlag` — mặc định `true`.

v3 không đổi thành phần nào ở trên, trừ §10.5 (bổ sung 3 mã lỗi còn thiếu).

### 11.3. Không mở rộng backend trong v3

Không thêm plugin loader, registry động, queue thứ hai, database, IPC channel, batch API, output-folder param hay DPI param.

Mọi cải thiện UX phải làm được với route hiện có. Nếu bắt buộc phải có API mới, ghi vào mục "blocked on backend" của plan và **không dựng UI giả**.

### 11.4. Sync và async

- `split`, `merge`, `rasterize`, `imagesToPdf`, `convertInput`, `export`, `docx`: sync, trả JSON một lần.
- `extract`: async — `POST /extract/start` trả job `queued`; `GET /extract/jobs`; `GET /extract/<id>`; `POST /extract/<id>/cancel`.
- Job lưu trong `new Map()` của process (`extract/jobs.ts:42`) ⇒ **mất khi Nitro restart**. UI phải nói rõ điều này; không gọi đó là "history".

### 11.5. Collision và atomic write

Đã có:

- `writeFileAtomic()` ghi `.<name>.tmp` cùng thư mục rồi `rename` — dùng ở upload, split page, raster page, merge, images→PDF, convert, export (docx/rows), PDF→Word, extract export, audit trim.
- Kiểm tra tồn tại trước khi ghi khi `overwrite === false` → `PDF_FOLDER_ALREADY_EXISTS` / `PDF_FILE_ALREADY_EXISTS`.
- Audit `action: 'output'` cho mọi đích ghi.

Chưa có (ghi nhận, không chặn v3): dọn `*.tmp` mồ côi sau crash; test khoá file trên Windows.

---

## 12. Runtime portability — local / Electron / Vercel

> **Đây là chương bổ sung sau khi soát plan "Temporary Workspace + Object Storage + Job Manager".**
> Plan đúng về nguyên tắc nhưng mô tả layout và vài ràng buộc chưa khớp repo. Chương này chốt phiên bản khớp code và xếp đúng thứ tự thi công.

### 12.1. Kết luận trước

| Câu hỏi | Trả lời |
|---|---|
| v3 có làm multi-runtime không? | **Không.** v3 là rebuild UX trên runtime local hiện tại. |
| Plan multi-runtime có đáng làm không? | **Có**, nhưng là **v4**, sau khi v3 xong và có nhu cầu deploy web thật. |
| Có phải viết lại engine? | Không. `server/modules/pdf/*` thuần Node (pdf-lib, pdfjs, docx, exceljs) — dùng lại được. |
| Phần nào phải làm mới? | Lớp storage, temp, job store, và adapter nhận file từ trình duyệt. |

Lý do tách: một thay đổi đổi cả cách lưu file, cách chạy job và cách xác thực sẽ phá vỡ đúng những bất biến mà v3 đang cố bảo toàn. Làm cùng lúc là tự tạo big-bang.

### 12.2. Soát plan: điểm đúng

- Không dùng `.data/pdf` như persistent disk trên Vercel — đúng, `/var/task` chỉ đọc.
- Không truyền file qua `/tmp` giữa các invocation — đúng.
- Không giữ job trong RAM ở production — đúng, và code hiện tại đúng là đang giữ trong `Map`.
- Private Blob cho tài liệu nhạy cảm — đúng nguyên tắc.
- Giới hạn body 4.5 MB ⇒ file lớn phải client-upload trực tiếp — đúng.
- Cleanup hai lớp (`finally` + expiration) — đúng, vì `finally` không chạy khi Function bị kill.
- Không viết hai bộ xử lý PDF — đúng.

### 12.3. Soát plan: bốn điểm sai hoặc thiếu so với repo

**1. Layout đề xuất không phải layout thật.**

Plan vẽ `.data/pdf/input/`, `.data/pdf/output/`, `.data/pdf/tmp/{jobId}/`. Repo dùng 8 area cố định + 2 thư mục nội bộ:

```text
.data/pdf/{sources,inputs,word,split,images,merged,products,office}
.data/pdf/checkpoints   .data/pdf/.trash   .data/pdf/audit.jsonl   .data/pdf/presets.json
```

v4 **không** được đổi sang `input/`/`output/`. Thay vào đó: mỗi area trở thành một "namespace" của storage provider. Trên cloud, `sources/<relativePath>` map thành blob key `sources/<relativePath>`; không có thư mục thật nhưng key tương đương. `checkpoints/` và `.trash/` là namespace nội bộ, không hiển thị.

Chỉ thêm một khái niệm mới: `tmp/<jobId>/` cho scratch — thư mục thật trên local, `/tmp/<jobId>/` trên Vercel. Nó **không** nằm trong area nào và không bao giờ được liệt kê.

**2. Font Word→PDF sẽ hỏng trên Vercel — plan không nhắc.**

`server/modules/pdf/office/font.ts` dò font hệ điều hành: Windows `C:/Windows/Fonts/*.ttf`, Linux `/usr/share/fonts/truetype/{dejavu,liberation,noto}/*.ttf`. Runtime Node của Vercel có thể không có các file này ⇒ `resolveFont()` ném `PDF_FONT_MISSING` ⇒ `convertInput` docx và `docxToPdf` chết.

Điều kiện tiên quyết của v4: đóng gói một font TrueType có glyph tiếng Việt trong repo (ví dụ Noto Sans subset) và cho `PDF_FONT_PATH` trỏ vào đường dẫn bundle. Phải kiểm tra `font.widthOfTextAtSize('ế ộ ữ Đ', 10)` trên chính runtime Vercel, không chỉ trên máy dev.

**3. Rasterize phụ thuộc native canvas — plan không nhắc.**

`pdf-to-img@7` render qua `pdfjs-dist`, mà `pdfjs-dist` khai báo `@napi-rs/canvas` là **optionalDependency**. Nếu Vercel install bỏ optional (hoặc build cho sai platform), `rasterizePdf()` fail và `export png` fail theo.

Điều kiện tiên quyết: khai báo `@napi-rs/canvas` thành dependency tường minh (không dựa optional), và đo bundle size sau build — Nitro bundle Vercel có giới hạn kích thước.

**4. `process.cwd()` và `better-sqlite3` — plan gộp quá nhanh.**

- `config.pdf.dir` mặc định `join(process.cwd(), '.data', 'pdf')`; `TOOLS_UPLOADS_DIR` và đường dẫn binary bundle cũng dùng `process.cwd()`. Trên Vercel `cwd` là `/var/task` (chỉ đọc) ⇒ **mọi** write fail, kể cả `audit.jsonl`.
- `server/modules/chat/store.ts` dùng `better-sqlite3` và ghi vào `process.env.TOOLS_DATA_DIR || join(process.cwd(), '.data')`. Đây là native module + đường dẫn ghi. Plan nói "Database bền vững" nhưng repo chưa có Postgres và `drizzle.config.ts` trỏ schema vào `electron/src/...`. Chưa có hạ tầng DB cloud.

Hệ quả: v4 phải chọn **một** trong hai trước khi code: (a) đưa Postgres/Neon + drizzle cho job metadata (việc lớn), hoặc (b) bản cloud chỉ chạy stateless, không có job history, và chấp nhận mất panel Jobs. Không được giả định `better-sqlite3` chạy được trên Vercel.

### 12.4. Thêm hai điểm plan bỏ sót về vận hành

| Vấn đề | Hiện trạng code | Ảnh hưởng v4 |
|---|---|---|
| Electron chưa đặt `PDF_DATA_DIR` | `electron/main.cjs:78` chỉ set `TOOLS_DATA_DIR`. PDF vẫn dùng `process.cwd()` ⇒ bản cài đặt ghi vào thư mục app | Phải set `PDF_DATA_DIR` = `join(app.getPath('userData'), 'pdf')` **trước** khi import `.output/server/index.mjs` |
| Auth phụ thuộc tm-hub nội bộ | `server/middleware/auth.ts` xác thực JWT; hub mặc định `http://localhost:4000` | Deploy Vercel phải có hub public + `NUXT_PUBLIC_HUB_URL`/`NUXT_HUB_APP_SECRET`; nếu không, mọi route PDF trả 401 |
| `ssr: false` | `nuxt.config.ts` | Vercel cần Nitro preset phù hợp cho API + static SPA; plan đã nhắc, giữ làm checklist |
| Không có `vercel.json` | — | v4 phải thêm cấu hình build/output; không sửa trong v3 |

### 12.5. Kiến trúc v4 (chốt, giữ tinh thần plan)

Nguyên tắc gốc của plan được giữ nguyên và là điều kiện đúng đắn:

> **Không operation nào được phụ thuộc trực tiếp vào đường dẫn filesystem.**
> Operation nhận tài liệu qua **Storage Provider** và trả kết quả qua **Result Writer**.

```text
UI (Nuxt components, giữ nguyên v3)
        │
        ▼
Document Application Layer
  ├── Operation Registry        (metadata dùng chung với v3)
  ├── Input Resolver            (AccountRef → scratch path tạm)
  ├── Job Manager               (persistent store)
  └── Result Collector          (scratch → storage namespace)
        │
        ├──────────────┬──────────────────┐
        ▼              ▼                  ▼
  StorageProvider  TempProvider     JobStore
  ├ local fs       ├ local .data/pdf/tmp  ├ in-memory (dev)
  └ blob private   └ os.tmpdir()          └ Postgres (cloud)

        │
        ▼
Shared Processing Engine  =  server/modules/pdf/*  (không đổi)
```

Interface tối thiểu:

```ts
interface StorageProvider {
  /** Đọc một tài liệu vào đường dẫn scratch. */
  materialize(ref: PdfDocumentRef, dir: string): Promise<string>
  /** Ghi kết quả từ scratch vào namespace area. */
  publish(area: PdfFileArea, relativePath: string, fromPath: string): Promise<void>
  /** Đọc nội dung file (preview/download). */
  read(area: PdfFileArea, relativePath: string): Promise<ReadableStream | Buffer>
  list(area: PdfFileArea, relativePath: string): Promise<PdfFileInfo[]>
  remove(area: PdfFileArea, relativePath: string): Promise<void>
  /** Chỉ dùng cho list/tree; không mở file. */
  stat(area: PdfFileArea, relativePath: string): Promise<{ size: number, modifiedAt: string } | null>
}

interface TempProvider {
  createJobDir(jobId: string): Promise<string>
  cleanup(jobId: string): Promise<void>
}
```

Ràng buộc:

- `PdfFileArea` **không đổi** — 8 area là hợp đồng ổn định giữa UI, storage và engine.
- `outputMapping` **không đổi** — tool vẫn ghi đúng area như §1.9.
- Engine `server/modules/pdf/*` nhận đường dẫn scratch tuyệt đối như hiện tại; lớp application chịu trách nhiệm materialize ra scratch và publish ngược lại. Đây là thay đổi **nhỏ nhất** để engine không biết mình đang chạy trên cloud.
- Không di chuyển `server/modules/pdf` sang `server/modules/document` khi chưa có adapter thật. Đổi tên trước khi có lý do là churn vô ích.

### 12.6. Ranh giới local vs cloud

| Thành phần | Local / Electron | Cloud (Vercel) |
|---|---|---|
| Storage chính | filesystem `.data/pdf/<area>` | private blob `/<area>/<relativePath>` |
| Scratch | `.data/pdf/tmp/<jobId>/` | `os.tmpdir()/<jobId>/` |
| Input người dùng | upload multipart → route giới hạn 200 MB | client upload trực tiếp lên blob, route chỉ cấp token (≤4.5 MB/request) |
| Job metadata | `Map` (mất khi restart) | bảng DB, `expiresAt` |
| Preview | stream `/file?inline=1` | signed URL hoặc route proxy có auth |
| Trash | `.trash/` trên đĩa | namespace `trash/` + `restore` copy ngược |
| Audit | `audit.jsonl` (500 dòng) | bảng/append log, không ghi bytes |
| Cleanup | người dùng xoá / trash | `finally` + cron theo `expiresAt` |

### 12.7. Vòng đời job trên cloud

```text
1. Browser chọn file
2. Client upload → private blob  /<area>/<relativePath>   (token do server cấp)
3. POST /documents/jobs          → tạo job { status: queued, expiresAt }
4. Worker/Function
     materialize → /tmp/<jobId>/input/
     chạy engine
     publish     → blob /<area>/<output>
     finally     → xoá /tmp/<jobId>/
5. GET /documents/jobs/<id>      → outputs + download
6. Cron dọn job hết `expiresAt`: xoá blob output, xoá input, đánh dấu expired
```

Chỉ job dài (OCR, extraction nhiều trang, batch) mới đi đường bất đồng bộ. Split/merge/convert/export nhỏ chạy trực tiếp trong request và dùng scratch + `finally`, **không** tạo job record — đúng như bảng chọn đường chạy trong plan.

### 12.8. Điều kiện vào v4 (definition of ready)

Không bắt đầu v4 khi bất kỳ ô nào còn trống:

- [ ] v3 hoàn tất Phase 0–6, gate xanh.
- [ ] Font tiếng Việt được bundle + test trên Linux runtime.
- [ ] `@napi-rs/canvas` khai báo tường minh + đo bundle size Vercel.
- [ ] Quyết định DB cho job (Postgres) **hoặc** chấp nhận không có job history trên cloud, ghi rõ.
- [ ] Có dịch vụ blob private + cách cấp token upload; xác thực chủ sở hữu job.
- [ ] `PDF_DATA_DIR` được set đúng trong Electron trước khi Nitro import.
- [ ] tm-hub public URL + secret cho môi trường cloud.
- [ ] Chính sách retention viết thành hằng số cấu hình, không hard-code trong code xử lý.

### 12.9. Thứ tự thi công v4 (khi được duyệt)

1. Tách `PathResolver` khỏi engine: engine nhận `inputPath`/`outputDir` tuyệt đối (đã đúng), thêm lớp gọi.
2. `LocalStorageProvider` = hiện trạng, không đổi hành vi. Đây là refactor thuần.
3. `TempProvider` local + dọn `finally`.
4. `JobStore` interface; bản local vẫn là `Map`, thêm `expiresAt` để sau thay bằng DB.
5. Chuyển từng operation sang gọi qua application layer; mỗi operation một commit, chạy regression.
6. Thêm `BlobStorageProvider` + route cấp token upload; deploy preview.
7. Cron/scheduled cleanup + audit.
8. Chỉ khi tất cả xanh mới bật production cloud.

Không gộp bước 5 với 6: nếu cả hai cùng lúc, lỗi ở tầng nào cũng không tách được.

### 12.10. Những gì không làm trong v4 (kể cả khi tiện)

- Không đổi tên area để "cho giống" tài liệu kiến trúc.
- Không gộp `sources` và `inputs`.
- Không đưa ảnh chụp dữ liệu người dùng vào bundle deploy.
- Không lưu tài liệu trong public blob.
- Không dùng chung một DB cho mọi tenant nếu chưa có cột owner.
- Không chạy OCR/extraction lớn trong một HTTP request kéo dài chỉ vì Function cho timeout dài.
- Không viết bộ xử lý PDF thứ hai cho cloud.

---

## 13. Permission

Giữ nguyên `DESCRIPTORS`; UI chỉ phản chiếu.

| Area | Writable files | Writable folders | Root |
|---|---|---|---|
| `sources` | ✓ | ✓ | system |
| `inputs` | ✓ | ✓ | system |
| `word` | ✗ | ✗ | system |
| `split` | ✓ | ✓ | system |
| `images` | ✓ | ✓ | system |
| `merged` | ✓ | ✓ | system |
| `products` | ✓ | ✓ | system |
| `office` | ✓ | ✓ | system |

- Root không rename/delete: `FolderTree.isSystemRoot()` ẩn action; server chặn qua `PDF_INVALID_PATH`.
- `word` chỉ đọc. `POST /word/upload` vẫn tồn tại nhưng không UI nào gọi; **không xoá** route trong v3.
- Xoá đi qua `moveToTrash` → `/trash*` để khôi phục.
- Mọi mutation kiểm tra quyền ở Nitro, kể cả khi UI ẩn.

---

## 14. Test và tiêu chí chấp nhận

### 14.1. Test đơn vị cần thêm

| File | Kiểm tra |
|---|---|
| `tests/unit/pdf_output_names.spec.ts` | Công thức tên client khớp server: `documentStem`, `pageFileName` (prefix + pad), `<folder>_merged.pdf`, `<folder>_from_images.pdf`, `<stem>_products.<ext>` |
| `tests/unit/pdf_operations_meta.spec.ts` | Mọi `mappingKey` trong `PDF_OPERATIONS` tồn tại trong `outputMapping`; mọi `areas` thuộc `PDF_FILE_AREAS`; không operation nào khai báo `multi-file` |
| `tests/unit/pdf_selection.spec.ts` | `pickFile` từ chối area ngoài `input.areas`; `pickFolder` từ chối file; `clear` reset |

Test hiện có phải tiếp tục pass: `pdf_workspace`, `pdf_workspace_repair`, `pdf_area_guard`, `pdf_path_escape`, `pdf_security`, `pdf_atomic_write`, `pdf_audit`, `pdf_audit_output`, `pdf_lazy_tree`, `pdf_url_params`, `pdf_normalize`, `i18n_keys`.

### 14.2. Acceptance — UX

- [ ] `/pdf` hiện công cụ, không hiện 7 area.
- [ ] 5 trang công cụ đều hiện **7 area root** trong Explorer.
- [ ] Explorer không có checkbox folder; chỉ một folder active.
- [ ] Mỗi trang chỉ có **một** `PdfFileBrowser` trong DOM.
- [ ] `split.vue` không còn panel "Split folders"/"Built PDFs"; `images.vue` không còn panel image folders; `import.vue` không còn panel converted; `extract.vue` chỉ còn panel Jobs.
- [ ] Đổi folder không xoá input đã chọn.
- [ ] Mở preview không đổi input.
- [ ] Mỗi trang công cụ có Data Flow Note trước nút chạy.
- [ ] Data Flow Note lấy area từ `GET /workspace`.
- [ ] Form cấu hình nằm trong modal.
- [ ] Không nút nào cho tính năng chưa có (rotate/compress/OCR/merge nhiều PDF/page range).

### 14.3. Acceptance — chức năng

Smoke test với dữ liệu thật trong `.data/pdf`:

- [ ] Upload PDF vào `sources/` (kể cả folder con).
- [ ] Upload input vào `inputs/`.
- [ ] Browse 7 area, expand lazy node, search folder sâu.
- [ ] Tạo/rename/xoá subfolder; root bị chặn ở UI và API.
- [ ] `word/` đọc được, không sửa được.
- [ ] Preview PDF/image/CSV/XLSX/DOCX/JSON/XML.
- [ ] Split → `split/<stem>/page_*.pdf`.
- [ ] Merge `split/<folder>` → `merged/<folder>_merged.pdf`.
- [ ] Rasterize → `images/<stem>/page_*.png`.
- [ ] Images→PDF → `merged/<folder>_from_images.pdf`.
- [ ] Convert input → `merged/<stem>.pdf`.
- [ ] Export: png → `images/`, docx → `office/`, csv/json/xml/xlsx → `products/` (chỉ khi có cache).
- [ ] Extract: job chạy, cancel được, kết quả 5 file trong `products/`.
- [ ] Trash: restore, purge, empty.
- [ ] Report/repair không xoá dữ liệu.
- [ ] Xoá source có confirm nói rõ xoá cả dẫn xuất.

### 14.4. Bảo mật

- [ ] Renderer không import `node:fs`.
- [ ] Không route nào nhận absolute path.
- [ ] `area` qua `parseArea`.
- [ ] `relativePath` qua `safeRelativePath` + `assertInsideRoot`.
- [ ] `../`, `%2e%2e%2f`, junction/symlink bị chặn.
- [ ] Upload kiểm tra extension + size + page count ở server.
- [ ] `POST /directory/delete` với `path: ""` trả `PDF_INVALID_PATH`.
- [ ] Output không ghi đè file nguồn.

### 14.5. Gate bắt buộc trước khi báo done

Theo skill `nuxt-eslint-gate-after-prepare`:

```bash
npx nuxt typecheck > .gate-typecheck.txt 2>&1; echo "TC_EXIT=$?"
grep -c "error TS" .gate-typecheck.txt
ls -l .nuxt/eslint.config.mjs

npx eslint <files touched> > .gate-eslint.txt 2>&1; echo "LINT_EXIT=$?"

pnpm test
```

Lint phải chạy **sau** lần `nuxt typecheck` cuối cùng; nếu `.nuxt/eslint.config.mjs` đổi mtime thì lint lại. Test phải in `n/n specs passed`.

---

## 15. Kế hoạch thực thi v3

Không big-bang. Mỗi phase build/lint/test xanh trước khi sang phase tiếp.

### Phase 0 — Audit và baseline

1. Đọc `AGENTS.md`, `package.json`, `nuxt.config.ts`, `server/modules/pdf/*`, `app/pages/pdf/*`, `app/components/pdf/*`.
2. Đối chiếu với §1; nếu khác, sửa §1 và ghi ngày.
3. Ghi baseline `typecheck`/`lint`/`test` vào `VERIFICATION.md`.

**Exit:** audit khớp code; không đổi hành vi.

### Phase 1 — Home

1. Tạo `app/utils/pdfOperations.ts`.
2. Dựng lại `index.vue`: tool cards + Library card + banner repair + `<details>` kỹ thuật.
3. Bỏ bảng pipeline khỏi nội dung chính.
4. i18n hai locale.

**Exit:** Home dẫn tới 5 trang công cụ + Library; số đếm từ API thật.

### Phase 2 — Explorer dùng chung

1. Tạo `usePdfExplorer()` từ logic của `library.vue`.
2. Chuyển `library.vue` sang dùng nó, không đổi hành vi.
3. Chuyển 5 trang công cụ sang `usePdfExplorer()`.
4. Xác nhận 7 root có ở cả 6 trang.

**Exit:** mọi trang hiện cùng cây; `library.vue` không còn logic explorer riêng.

### Phase 3 — Active Input

1. `PdfDocumentRef`/`PdfSelection` vào `shared/types/pdf.ts`.
2. Tạo `usePdfSelection`.
3. `FileBrowser`: bỏ `selectable`, thêm nút "Dùng làm đầu vào" qua `file-actions`, thêm slot `folder-actions`.
4. `HeTreeMenu`: thêm prop `hideCheckbox`, `FolderTree` truyền `true` (§3.1).
5. Gắn vào `export` và `extract` trước.
6. Bỏ auto-select file đầu tiên.

**Exit:** chọn input ở folder A, đổi sang folder B, input còn nguyên; preview không đổi input.

### Phase 4 — Data Flow Note + Result

1. `DocumentDataFlowNote.vue` + i18n.
2. `OperationResult.vue` + i18n.
3. Gắn vào 5 trang công cụ; đích đọc từ `GET /workspace`.
4. "Mở thư mục đầu ra" điều hướng Explorer tới `outputMapping` area.

**Exit:** mỗi trang nói rõ input → output trước khi chạy.

### Phase 5 — Bỏ panel trùng lặp

Thứ tự: split → images → import → export → extract.

Mỗi trang: chuyển action của panel sang row/folder action; xoá panel; dời form cấu hình vào modal; smoke test cả flow.

**Exit:** không còn `PdfFileRow`/`PdfOutputFolderRow` ngoài `FileBrowser`, trừ panel Jobs của extract.

### Phase 6 — Sửa lệch hợp đồng

1. Thêm 3 mã lỗi còn thiếu vào `pdfHttpStatus` (§10.5).
2. Bỏ `outputFormats` khỏi extract (§10.7).
3. Bỏ checkbox `overwrite` khỏi Library (§10.6).
4. Confirm xoá source nói rõ xoá dẫn xuất (§10.4).
5. Test `pdf_output_names`, `pdf_operations_meta`.

**Exit:** UI không hiển thị sai về đích ghi hoặc tuỳ chọn không có tác dụng.

### Phase 7 — Viewer (tuỳ chọn)

Chỉ làm khi có yêu cầu cụ thể. Đã có: ảnh zoom/rotate, PDF iframe, bảng, DOCX HTML, JSON, XML. Không hứa thumbnail/page-search/Previous-Next khi chưa có backend hỗ trợ.

### Phase 8 — Ngoài v3

OCR, table extraction, form extraction, validation/review, multi-file input, job history. Không nằm trong Done checklist v3.

---

## 16. Tương thích và rollback

- Giữ nguyên URL và toàn bộ route API.
- Không xoá component cũ tới khi mọi trang đã chuyển và regression pass.
- Trang rủi ro giữ bản cũ ở route dev-only trong lúc di trú; không để hai route trùng cho người dùng thật.
- Không chạy migration dữ liệu như phần của deploy UI.
- Buộc đổi contract server thì hỗ trợ cả hai kiểu gọi trong giai đoạn chuyển và ghi vào plan.

---

## 17. Tài liệu cần cập nhật

- `WORKSPACE-AUDIT.md` — inventory thật.
- `WORKSPACE-UPGRADE-PLAN.md` — phase v3 + trạng thái + mục "v4 / multi-runtime" trỏ về §12.
- `VERIFICATION.md` — gate và smoke test.
- Tài liệu này giữ vai trò spec; không tạo thêm `REBUILD-PLAN-v3.md` riêng.

---

## 18. Chỉ dẫn bắt buộc cho AI Coding Agent

1. Đọc tài liệu này và v2 trước khi sửa code.
2. Code là nguồn sự thật; nếu tài liệu sai, ghi lại và chọn cách ít phá vỡ nhất.
3. Làm Phase 0 trước; không sửa hành vi khi chưa có baseline.
4. Kiểm kê `app/components/pdf` + UI dùng chung trước khi tạo mới.
5. Tái sử dụng trước khi tạo; mở rộng backward-compatible khi đủ 70–80%.
6. Ưu tiên ít màn hình, ít panel thường trực, ít danh sách trùng.
7. Explorer là điều hướng: một active folder, không checkbox.
8. Không trộn Active Folder / Active Input / Preview Target.
9. Một FileBrowser mỗi trang.
10. Home và menu theo công việc — nhưng **không** đổi menu tm-hub trong v3.
11. Giữ `.data/pdf`, tên area, permission.
12. Nitro là chủ filesystem; không `fs` ở renderer, không absolute path, không IPC PDF.
13. `outputMapping` là nguồn đúng duy nhất cho đích ghi.
14. Giữ mọi operation đang chạy; không xoá trước khi bản thay thế pass regression.
15. Không bịa API, phần trăm tiến trình, job history, multi-file, hay công cụ tương lai.
16. Không thêm UI library, database, queue, plugin framework.
17. Làm từng phase; sau mỗi phase chạy gate §14.5.
18. Cập nhật plan/verification bằng số liệu thật.
19. Nếu repo khác tài liệu, ghi khác biệt và chọn cách ít phá vỡ.
20. Không dừng ở kế hoạch; sau audit tiếp tục code trong phạm vi phase được giao.
21. **Không bắt đầu multi-runtime (v4) trong lúc làm v3.** §12 là điều kiện vào của v4, không phải việc của v3.
22. Khi làm v4, không đổi `PdfFileArea`, `outputMapping`, route UI hay engine signature. Chỉ thêm lớp storage/temp/job bên dưới.

---

## 19. Prompt khởi động ngắn

> Đọc `docs/pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` (v3) và `docs/pdf/TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md` (v2), sau đó audit `app/pages/pdf/*`, `app/components/pdf/*`, `app/composables/*Pdf*`, `server/modules/pdf/*` trước khi sửa.
>
> Mục tiêu: người dùng vào Document Studio thấy **việc muốn làm**; chọn tài liệu rõ ràng; mỗi operation chỉ hiện tham số nó có; trước khi chạy thấy `Đầu vào → Xử lý → Đầu ra` với đích lấy từ `GET /api/v1/pdf/workspace`; chạy xong mở được thư mục kết quả trong cùng Explorer.
>
> Ràng buộc: giữ `.data/pdf`, 7 area hiển thị, `DESCRIPTORS`, `outputMapping`, mọi route `/api/v1/pdf/*`, route UI `/pdf/*` và menu tm-hub. Không thêm IPC PDF, không thêm DB/queue/library. Mỗi trang chỉ một `PdfFileBrowser`; bỏ panel danh sách file trùng (split folders, merged PDFs, image folders, converted, extract results) sau khi action của chúng đã chuyển sang row/folder action. Tách Active Folder / Active Input / Preview Target.
>
> Làm theo Phase 0 → 6. Sau mỗi phase chạy `npx nuxt typecheck`, `npx eslint <files>`, `pnpm test` theo skill `nuxt-eslint-gate-after-prepare` và ghi kết quả thật vào `docs/pdf/VERIFICATION.md`.
>
> Đa môi trường (Electron/Vercel) là **v4**, đã thiết kế trong §12; không triển khai trong đợt này.

---

## 20. Nguyên tắc cuối

**Người dùng nghĩ bằng công việc. Ứng dụng nghĩ bằng area, permission, path, engine và job.**

Người dùng chỉ cần trả lời bốn câu:

1. Tôi muốn làm gì?
2. Xử lý tài liệu nào?
3. Chọn tuỳ chọn nào?
4. Kết quả nằm ở đâu?

Mọi thứ còn lại — area, tên file đích, overwrite, permission, checkpoint, nơi lưu vật lý — do hệ thống quyết định nhất quán và hiển thị lại bằng ngôn ngữ người dùng.
