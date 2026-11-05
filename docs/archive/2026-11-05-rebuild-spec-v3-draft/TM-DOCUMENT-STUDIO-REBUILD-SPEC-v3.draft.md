# TM Document Studio – Product, UX & Architecture Rebuild Specification (v3)

> **Tài liệu giao trực tiếp cho AI Coding Agent.**
>
> Mục tiêu của v3 là thiết kế lại trải nghiệm và tổ chức lại phần mềm quản lý/xử lý tài liệu trong TM Tools theo hướng **đơn giản, dễ hiểu, task-first, ít màn hình trùng lặp và dễ mở rộng**.
>
> Đây là một đợt **rebuild về sản phẩm, UI và cấu trúc frontend/operation**, không phải lý do để xóa dữ liệu hiện tại, thay filesystem, thay Nitro bằng Electron IPC hoặc viết lại các engine đang hoạt động mà chưa có bằng chứng cần thiết.
>
> **Nguyên tắc ưu tiên:** người dùng nhìn vào là biết chọn việc cần làm; hệ thống tự tìm đúng nơi đọc/ghi dữ liệu; người dùng không phải hiểu cấu trúc kỹ thuật của các folder để sử dụng công cụ.

---

## 0. Tuyên bố định hướng và phạm vi v3

### 0.1. Vấn đề cần giải quyết

Cấu trúc hiện tại đã có các thành phần và chức năng quan trọng, nhưng trải nghiệm đang có xu hướng phản ánh cấu trúc kỹ thuật bên trong:

- Người dùng phải hiểu nhiều area/folder như `sources`, `inputs`, `split`, `images`, `merged`, `products`, `office`.
- Một số trang vừa hiển thị file nguồn, vừa có thêm panel kết quả hoặc folder output riêng, làm một trang có nhiều danh sách file cạnh tranh nhau.
- Người dùng phải hiểu công cụ đang đọc từ area nào và ghi sang area nào.
- Cấu hình, chọn input, xem output, theo dõi job chưa được trình bày theo một mô hình thống nhất.
- Logic của từng trang dễ bị gắn chặt vào một area hoặc một cấu trúc UI cụ thể.
- Khi thêm OCR, Table Extraction, Word/Excel tools, Validation hoặc workflow, nguy cơ tiếp tục nhân bản page/component tăng lên.

### 0.2. Kết quả sản phẩm cần đạt

TM Document Studio phải trở thành một ứng dụng có cách dùng đơn giản:

1. Người dùng bắt đầu bằng **việc muốn làm**, không phải bằng việc phải tìm đúng folder kỹ thuật.
2. Hệ thống hướng dẫn người dùng chọn tài liệu đầu vào đúng loại.
3. Mỗi operation chỉ hiển thị những tùy chọn cần thiết cho operation đó.
4. Trước khi chạy, người dùng nhìn thấy rõ **Đầu vào → Cách xử lý → Đầu ra**.
5. Sau khi chạy, người dùng có thể xem kết quả, mở vị trí lưu và tiếp tục thao tác.
6. Các công cụ dùng chung Explorer, File Browser, Viewer, selection model, output mapping và operation framework.
7. Người dùng không cần biết `sources/`, `split/`, `products/` là gì để sử dụng được công cụ.

### 0.3. Những gì được rebuild

- Information Architecture và menu điều hướng của Document Studio.
- Trang Home/Tool Launcher.
- Layout và composition của các trang operation.
- Cách chọn input và cách hiển thị output.
- Universal Explorer và Universal File Browser.
- Operation Registry/metadata contract.
- Input Picker chuyên biệt cho operation cần nhiều file hoặc folder.
- Cách hiển thị configuration, progress, result và lỗi.
- Cách tổ chức component frontend trong `app/components/pdf`.
- Các trang cũ được chuyển dần sang kiến trúc mới và giữ route tương thích trong quá trình chuyển đổi.

### 0.4. Những gì KHÔNG được tự ý rebuild

- Không thay `config.pdf.dir` hoặc workspace vật lý hiện tại nếu không có lý do được chứng minh.
- Không đổi tên/gộp/xóa các area đang tồn tại.
- Không xóa dữ liệu người dùng hoặc tự động di chuyển dữ liệu.
- Không chuyển filesystem ownership từ Nitro sang Electron Main.
- Không tạo Electron IPC mới cho các thao tác PDF/document.
- Không thay TM Hub AI Relay bằng API key riêng trong app.
- Không viết lại toàn bộ PDF engine, extraction engine, preset, checkpoint hoặc viewer trước khi audit implementation.
- Không thay Nuxt, UI framework, state management, package hoặc build architecture chỉ vì muốn tổ chức lại code.

> **Diễn giải “đập đi xây lại”:** được phép thiết kế lại mạnh tay trải nghiệm, page composition, luồng thao tác và ranh giới component; nhưng phải bảo toàn dữ liệu, server contracts và các chức năng đang chạy cho đến khi phiên bản thay thế đạt parity và regression test.

---

## 1. Bối cảnh kỹ thuật hiện tại – baseline cần xác minh

Các thông tin sau được kế thừa từ tài liệu v2 và phải được AI xác minh lại trong repository trước khi code. Nếu code thực tế khác, ghi rõ bằng chứng và cập nhật audit; không đoán.

### 1.1. Runtime và filesystem ownership

- Nuxt SPA (`ssr: false`) chạy trong Electron.
- Nitro server của chính app là privileged filesystem owner.
- Renderer gọi API `/api/v1/pdf/*` qua cơ chế fetch/auth hiện có.
- Electron chỉ là desktop wrapper; `electron/ipcPolicy.cjs` không cấp kênh PDF filesystem.
- Không thêm IPC channel cho PDF/document trừ khi audit chứng minh một capability desktop-specific bắt buộc phải đi qua IPC. Các thao tác filesystem thông thường vẫn phải qua Nitro.

### 1.2. Workspace vật lý hiện tại

Workspace root lấy từ `config.pdf.dir`, có thể override bằng `PDF_DATA_DIR`. Không hard-code đường dẫn máy phát triển như `D:\Applications\tm-tools`.

Cấu trúc kế thừa từ v2:

```text
.data/pdf/
├── sources/       # PDF gốc người dùng upload
├── inputs/        # non-PDF input: docx/xlsx/csv/json/xml/images
├── word/          # legacy DOCX, read-only
├── split/         # PDF pages / split outputs
├── images/        # rasterized page images
├── merged/        # merged PDFs / image-to-PDF / converted PDFs
├── products/      # extraction outputs (CSV/JSON/XLSX/DOCX/XML)
├── office/        # Office/export files
├── checkpoints/   # internal extraction checkpoints; never expose in Explorer
└── .trash/        # internal soft-delete storage; never expose as ordinary area
```

Visible Explorer tree currently has seven areas:

1. `sources`
2. `inputs`
3. `split`
4. `images`
5. `merged`
6. `products`
7. `office`

`word` is a legacy read-only area and is not a visible eighth Explorer root. `checkpoints` and `.trash` are internal.

**Do not create `input/`, `01-sources/`, `compress/`, `convert/`, `extraction/` or `exports/` folders just to match an abstract design.** Continue using existing registry and output mapping. A future new area requires a deliberate change to the server whitelist/registry and tests.

### 1.3. Existing server architecture to preserve

Likely existing modules (verify names and locations):

- `server/modules/pdf/paths.ts`
- `server/modules/pdf/security.ts`
- `server/modules/pdf/workspace.ts`
- `server/modules/pdf/directory.ts`
- `server/modules/pdf/inspect.ts`
- `server/modules/pdf/library.ts`
- `server/modules/pdf/trash.ts`
- `server/modules/pdf/audit.ts`
- `server/modules/pdf/extract/*`
- `server/utils/pdfApi.ts` (`runPdf` and PDF error mapping)

The server registry/output mapping is the source of truth for permissions and output destinations. The frontend must not independently construct output paths.

### 1.4. Existing UI/component baseline to preserve/reuse

Audit actual repository before assuming exact names. v2 reported these existing components under `app/components/pdf`:

- `WorkspaceShell.vue`
- `FolderTree.vue`
- `shared/HeTreeMenu.vue`
- `FileBrowser.vue`
- `FileRow.vue`
- `FileActions.vue`
- `FolderRow.vue`
- `OutputFolderRow.vue`
- `ContextMenu.vue`
- `ExportFormatPicker.vue`
- `FolderModal.vue`
- `RenameModal.vue`
- `TrashModal.vue`
- `PreviewFile.vue`
- `PreviewTable.vue`
- `PreviewText.vue`
- `PresetSampleEditor.vue`

Existing pages reported:

- `/pdf` overview
- `/pdf/library`
- `/pdf/split`
- `/pdf/images`
- `/pdf/import`
- `/pdf/export`
- `/pdf/extract`
- `/pdf/preview`

Existing composables/state reported include `usePdfStudio`, `usePdfDirectory`, `openPdfPreview` and local page/browser state. Verify exact paths and contracts.

### 1.5. Existing operations to preserve

- PDF upload to `sources/`.
- Non-PDF upload to `inputs/`.
- Legacy `word/` read compatibility.
- Split PDF → `split/`.
- Merge split folder → `merged/`.
- Rasterize source PDF → `images/`.
- Images → PDF → `merged/`.
- Convert input document → PDF → `merged/`.
- Source PDF export → `office/`.
- AI extraction → `products/`.
- Existing extraction presets/model selection/checkpoint/resume/job polling.
- Existing preview window and MIME-specific preview flow.
- Existing folder CRUD permissions, soft-delete/trash, audit log and workspace repair.

Do not remove an operation just because its page is redesigned.

---

## 2. Product Information Architecture – task-first, not folder-first

### 2.1. Core rule

**The main navigation must be organized by what the user wants to do, not by the internal filesystem layout.**

Do not make `sources`, `split`, `images`, `merged`, `products`, `office` the primary navigation menu. These are storage areas and should primarily be visible inside the Explorer/Library.

### 2.2. Proposed primary navigation

Keep the existing TM Tools app navigation. Within the Document Studio module, use a compact structure:

```text
Document Studio
├── Home
├── Tools
│   ├── Organize PDF
│   │   ├── Split PDF
│   │   ├── Merge PDF
│   │   ├── Rotate PDF       (future; do not show as active until implemented)
│   │   └── Compress PDF     (future; do not show as active until implemented)
│   ├── Convert Documents
│   ├── Images from PDF
│   ├── OCR & Extract Data
│   │   ├── OCR              (future unless already implemented)
│   │   ├── Extract Tables   (future unless already implemented)
│   │   └── AI Extraction
│   └── Export
├── Files
│   └── Document Library
├── Activity
│   ├── Processing Jobs
│   └── History              (only show capabilities that exist)
└── Settings
    ├── Workspace           (current report/repair capabilities)
    └── Processing Defaults (future)
```

Rules:

- Home and Tools are the task entry points.
- Files/Library is for browsing and managing stored documents.
- Activity is for seeing work performed and current jobs; do not imply that sync operations have persistent history if they do not.
- Settings contains defaults and workspace health, not normal file operations.
- Do not expose unfinished/future tools as enabled navigation items. They may appear in a clearly labeled “Coming later” group only if product owner requests it.
- Preserve existing routes during migration. New navigation can point to current route aliases until each page is replaced.

### 2.3. Home – “What would you like to do?”

Home must be immediately understandable to a first-time user. It should not be a technical dashboard with area counts as its primary content.

Recommended layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Document Studio                                               │
│ Bạn muốn làm gì với tài liệu hôm nay?                         │
│                                                              │
│ [ Search a tool... ]                                          │
│                                                              │
│ QUICK ACTIONS                                                 │
│ [ Split PDF ] [ Merge PDF ] [ Convert ] [ Extract data ]      │
│                                                              │
│ TOOLS                                                         │
│ ┌────────────────────┐ ┌────────────────────┐                 │
│ │ Organize PDF       │ │ Convert documents  │                 │
│ │ Tách, ghép...      │ │ PDF, Word, Excel   │                 │
│ └────────────────────┘ └────────────────────┘                 │
│ ┌────────────────────┐ ┌────────────────────┐                 │
│ │ OCR & Extract      │ │ Export              │                 │
│ │ Text, tables, AI   │ │ CSV, XLSX, DOCX...  │                 │
│ └────────────────────┘ └────────────────────┘                 │
│                                                              │
│ RECENT DOCUMENTS / RECENT ACTIVITY (only if real data exists) │
│                                                              │
│ [ Open Document Library ]                                    │
└──────────────────────────────────────────────────────────────┘
```

UI requirements:

- Use simple Vietnamese labels in the Vietnamese locale; keep concise English labels only where the app's existing i18n convention requires them.
- Cards must communicate **action + benefit**, not internal implementation terms.
- Tool search filters actual registered/available tools.
- Quick actions are shortcuts to operation pages, not duplicated operation implementations.
- Recent documents/activity must be backed by real data. Do not hard-code demo items.
- Avoid excessive dashboard cards, charts and empty statistics.
- Keep the main CTA obvious and make Library easy to reach.

### 2.4. Tool detail pages

Every operation route must have:

- One clear page title.
- One-sentence explanation of the task.
- A prominent “Choose files” / “Choose folder” input action when there is no input yet.
- A compact selected-input summary.
- Only relevant configuration controls.
- A visible output destination note.
- One primary action (Run/Start/Convert/Export).
- Progress/result/error area after execution.

Avoid exposing internal area names as the primary UX. Friendly labels should be translated from server-provided area metadata or i18n keys.

---

## 3. The core interaction model – Explorer, Browser, Input, Preview

The most important simplification in v3 is to separate four things that are currently easy to confuse.

### 3.1. Active Folder

The folder the user is currently browsing in the Explorer.

- Only one active folder at a time.
- Clicking a folder navigates to it and updates the one file list.
- Clicking a chevron only expands/collapses the tree node.
- No checkbox selection on folders.
- No Ctrl/Shift multi-folder selection.
- Folder context menu only exposes permitted actions.

### 3.2. Active Input

The document(s) or folder explicitly selected as input to the current operation.

- Independent of Active Folder.
- Must not be inferred from the folder currently being browsed.
- Must not disappear merely because the user navigates to another folder.
- Input policy depends on the operation: single file, multiple files or folder.
- For a single-file operation, selecting another file replaces the previous input.
- For multi-file/folder operations, use a task-specific Input Picker (see §6), not checkboxes on the Explorer tree.
- Show selection count and file names clearly.

### 3.3. Preview Target

The file currently open in the preview window.

- Independent of Active Folder and Active Input.
- Opening preview must not silently change or clear the operation input.
- Closing preview must not cancel a running operation.
- Use the existing preview window route/flow.

### 3.4. Operation Context

The currently opened tool/operation and its configuration.

- Changing folder must not change the selected operation.
- Changing operation must validate whether the current input is compatible.
- If incompatible, show a clear message and request a new input; do not silently substitute another file.

### 3.5. State ownership

| State | Owner |
|---|---|
| Explorer width/collapsed | Existing workspace preference persistence |
| Expanded tree node IDs | Explorer/tree state |
| Active Folder | Shared workspace navigation state or page-level route state |
| Active Input | Operation input state; independent from tree navigation |
| Preview Target | Preview window state/route params |
| Search/sort/density | FileBrowser state; persist only if current app convention supports it |
| Operation config | Operation page/dialog state |
| Job/progress | Existing extraction job state; future common job model only when needed |

Do not create duplicate sources of truth in local component state, Pinia and server at the same time.

---

## 4. Universal Workspace layout

### 4.1. Keep the two-side layout

All file-centric operation pages and Library use the same outer shell:

- Left: Universal Document Explorer.
- Right: File/Operation Workspace.

Keep the existing splitter, resize, collapse, persisted width and dark design system unless audit identifies a concrete problem.

### 4.2. Left side – Universal Explorer

The Explorer is for navigation only.

It always presents the same seven visible area roots as Library:

- PDF gốc (`sources`)
- Tệp đầu vào (`inputs`)
- Trang tách (`split`)
- Ảnh PDF (`images`)
- PDF ghép (`merged`)
- Dữ liệu trích xuất (`products`)
- Word & Excel (`office`)

Rules:

- No folder checkboxes.
- No multi-folder selection.
- One active folder highlighted at a time.
- Expand/collapse state is separate from active folder.
- Keep lazy loading by node; do not eagerly load every descendant at startup.
- Search may use a full-depth server query when required, then reveal the matching path.
- Root system folders cannot be renamed, moved or deleted.
- Subfolder operations follow the existing server permission descriptors.
- Do not show `word`, `checkpoints` or `.trash` as normal tree roots unless the existing product explicitly requires a separate system/trash view.
- Folder creation should be placed in the Explorer header or permitted context menu, not shown as a permanent action on every root if that adds clutter.

### 4.3. Right side – one Universal File Browser

One FileBrowser is used everywhere. It receives data/metadata and emits events; it must not own filesystem API calls.

Standard order:

1. Page/operation header (title + one short description).
2. Current-folder breadcrumb and folder context.
3. File toolbar: search, sort, density, refresh; filters only when implemented and useful.
4. Selected-input summary and Data Flow Note (for operations; Library may omit operation flow).
5. Single file/folder listing.
6. Small operation status/result area when applicable.

Do not create parallel lists such as separate “Source Files”, “Split Folders” and “Merged Files” panels in the same page. The user navigates to the appropriate area in the one Explorer; the same FileBrowser shows its contents.

### 4.4. FileBrowser display modes

For initial rebuild:

- Keep current list view and comfortable/compact density.
- Do not implement grid/details merely for visual completeness.
- Grid thumbnails may be added later for image-heavy workflows.
- Avoid pagination/virtualization until measurement shows folder listing performance requires them; if required, implement at the FileBrowser data boundary without changing operation contracts.

### 4.5. File row interaction

- Preserve existing preview-on-name behavior if that is current user expectation, but provide a separate clear “Use as input” action on operation pages.
- Do not make a row click ambiguously both preview and select input.
- Primary action should be contextual and obvious; secondary actions go into More menu.
- Row menus must respect file type, area descriptor and operation capabilities.
- Do not display actions that are unavailable; when a disabled action is useful for discoverability, show a concise reason.

---

## 5. Data Flow Note – always explain where data comes from and goes

### 5.1. Component

Create or adapt `DocumentDataFlowNote.vue` under `app/components/pdf/operations/` (or the closest existing component convention). It is a compact presentational component. It must not resolve filesystem paths by itself.

### 5.2. Required content

For an operation, show three logical stages:

```text
INPUT                  OPERATION                 OUTPUT
3 selected PDFs   →    Split into pages     →    Split folder
sources/project/       page range: All           split/project/
```

The operation itself may be shown as a small label or icon; do not turn this into a large flowchart.

### 5.3. Input states

- No input: “Chưa chọn tài liệu đầu vào”. Show current folder only as the browsing location, never as selected input.
- One file: show filename, type and source folder.
- Multiple files: show count, optionally first few names, and “View selection”.
- Folder input: clearly label “Toàn bộ thư mục” or the actual folder scope and explain whether subfolders are included.
- Mixed sources: show “N files from M folders” and allow the user to inspect the selection.

### 5.4. Output states

- Output area is resolved from server `outputMapping`/operation metadata, not assembled from arbitrary frontend strings.
- Show human-friendly area label and relative destination path.
- Include “Open output folder” action that navigates the Explorer to the output location.
- Do not expose absolute workspace paths in ordinary UI.
- If operation has dynamic output subfolder, obtain it from a validated server response or the operation's deterministic naming contract.
- If output cannot be resolved, block execution or show an explicit unsupported state; never guess a destination.

### 5.5. Snapshot before execution

When the user starts an operation, the request/job should retain a snapshot of:

- operation ID/version;
- input references (`area` + `relativePath` + file/folder kind);
- relevant operation config;
- output mapping key / resolved output area;
- overwrite/collision preference;
- selected model/connection/preset/schema where applicable.

For legacy sync operations, add only the minimum metadata supported by current contracts. Do not invent a persistent job database as part of the UI rewrite.

---

## 6. Operation Input Picker – no checkbox tree

### 6.1. Why it exists

Some operations naturally need multiple files or a folder. That does not justify turning the global Explorer into a bulk-selection UI.

Use a dedicated picker only when an operation requires it.

### 6.2. Picker behavior

- Open as modal or side drawer, depending on current UI primitives and space.
- Reuse the same folder tree and file-list components where practical.
- The tree remains single-active-folder navigation; no folder checkboxes.
- File selection controls appear only in the file list inside the picker.
- Show selection count and selected items in a compact tray.
- Allow remove/clear selection.
- Respect the operation's allowed area, MIME type and input mode.
- Folder selection is an explicit action such as “Use this folder”, not a tree checkbox.
- If multiple folders are allowed, users add them explicitly through a button; do not implement implicit parent/child checkbox propagation.
- Confirm selection returns typed `DocumentReference[]` to the operation page.

### 6.3. Do not implement until a real operation needs it

Keep current single-file selection behavior for existing operations unless a backend operation already supports multiple input files. Build the picker when introducing Merge-many-files, batch OCR or multi-document extraction, not as a prerequisite for all pages.

---

## 7. Operation Architecture – common framework, specialized forms

### 7.1. Separation of responsibilities

- **Operation Registry:** describes each operation's UX/input requirements and capabilities.
- **Server Workspace Registry:** current authoritative area permission and output mapping definitions.
- **Operation Page:** composes shared workspace and operation-specific controls.
- **Configuration Form/Dialog:** captures operation-specific settings.
- **Nitro API/Module:** validates and executes the operation.
- **Result Presenter:** explains generated outputs and failures.

Do not duplicate server permission/output mapping rules in frontend. Frontend metadata is for UX; server remains authoritative.

### 7.2. Operation definition – target conceptual type

Adapt to the repository's existing shared types; this is not a command to create an overlapping type system.

```ts
interface DocumentOperationDefinition {
  id: string
  titleKey: string
  descriptionKey: string
  category: 'organize' | 'convert' | 'images' | 'extract' | 'export'

  input: {
    mode: 'single-file' | 'multi-file' | 'folder'
    allowedAreas: PdfFileArea[]
    acceptedTypes: string[]
    maxItems?: number
    allowSubfolders?: boolean
  }

  output: {
    mappingKey: string
    area: PdfFileArea
  }

  execution: {
    mode: 'sync' | 'async'
    supportsProgress: boolean
    supportsCancel: boolean
  }

  capabilities: {
    requiresConfig: boolean
    supportsOverwrite: boolean
    supportsPreview: boolean
  }
}
```

Important:

- Server `outputMapping` remains the source of truth for output area/path.
- The operation definition must not become a second server registry with different values.
- Prefer deriving UI metadata from existing types/API when possible.
- Keep the registry small and declarative. Do not build a plugin marketplace or dynamic code loader.

### 7.3. Initial operation matrix

Only mark operations as available if their implementation exists and is tested.

| Operation ID | User-facing name | Input mode | Current input area(s) | Output area | Current execution |
|---|---|---|---|---|---|
| `split` | Tách PDF | single-file | `sources` | `split` | sync |
| `merge` | Ghép PDF | folder (current implementation) | `split` | `merged` | sync |
| `rasterize` | Chuyển PDF thành ảnh | single-file | `sources` | `images` | sync |
| `imagesToPdf` | Tạo PDF từ ảnh | folder (current implementation) | `images` | `merged` | sync |
| `convertInput` | Chuyển tài liệu thành PDF | single-file | `inputs` / legacy `word` read path | `merged` | sync |
| `export` | Xuất dữ liệu từ PDF | single-file | `sources` | `office` | sync |
| `extract` | Bóc tách bằng AI | single-file | `sources` | `products` | async extraction job |

Do not claim merge-many-independent-PDFs is supported unless code/API confirms it. The current merge contract is folder-of-split-pages according to v2.

### 7.4. Operation lifecycle

Standard lifecycle for every operation page:

1. `idle` – no input selected.
2. `input-selected` – compatible input is selected.
3. `configuring` – user is editing operation options, if needed.
4. `ready` – all required fields validate.
5. `running` – request/job is executing.
6. `success` – outputs are available.
7. `partial` – some inputs succeeded and some failed (future multi-input support).
8. `failed` – operation failed; retain input/config so user can correct and retry.

Use existing status vocabulary/contracts where they already exist. Do not force sync routes to invent persistent job statuses in this phase.

### 7.5. Result presentation

After completion, show a compact result panel:

- Success/partial/failure status.
- Number of generated files/pages where known.
- Output folder and “Open output folder”.
- Preview/Open result for supported formats.
- Download/export where supported.
- Error details with stable `PDF_*` code translated through existing i18n.

Do not keep a permanent second output file list on the operation page. The output files appear in the same FileBrowser when user opens the output folder.

---

## 8. UI specification for each current tool

### 8.1. Home (`/pdf` or the current Document Studio landing route)

Purpose: help the user choose a task quickly.

Required:

- Title: Document Studio / Xử lý tài liệu.
- Search tools.
- Primary action cards grouped by user intent.
- Quick actions for common tasks.
- Recent files/activity only if backed by real data.
- Link to Document Library.

Do not show technical area registry as the main Home experience. A small workspace health indicator may live in Settings/secondary status.

### 8.2. Document Library (`/pdf/library`)

Purpose: manage and browse all files.

- Universal Explorer left.
- One FileBrowser right.
- Upload controls appropriate to current area.
- New subfolder where permission allows.
- Preview/download/rename/soft-delete according to descriptor.
- Search/sort/density.
- Trash modal remains reachable using existing flow.
- No operation configuration form in Library.
- No fake input/output flow note unless user launches a task from Library.

### 8.3. Split PDF (`/pdf/split`)

- Same two-side Workspace Shell.
- Explorer can navigate all seven areas.
- If active folder is in `sources`, FileBrowser shows source PDFs and provides “Split” action / “Use as input”.
- If active folder is in `split`, show split output folders/pages and provide “Merge this folder” where permitted.
- If active folder is in `merged`, show completed PDFs.
- Do not render independent “Split folders” and “Merged PDFs” file-list panels alongside the main FileBrowser.
- Split config dialog only shows options supported by backend. Current implementation splits all pages; page-range/odd-even is future until implemented.
- Flow note: source PDF → split output destination.

### 8.4. Merge PDF (`/pdf/merge` or compatible tab/route)

- Can be a dedicated route or a clear sub-operation within Organize PDF; choose one after inspecting current routing conventions.
- Current operation input is a split-pages folder unless backend is explicitly extended.
- When browsing `split`, folder row exposes “Merge folder”.
- Folder open shows page PDFs in order.
- If the operation supports custom ordering later, build an operation-specific ordering list with drag/drop; do not drag folders in the global Explorer.
- Output is `merged/` from server mapping.

### 8.5. Images from PDF (`/pdf/images`)

- When browsing `sources`, PDF rows expose Rasterize.
- When browsing `images`, show image files/folders in the same FileBrowser.
- Folder row may expose “Create PDF” if supported by current API.
- Do not keep a separate “Image folders” panel.
- Future raster config may include DPI, format and quality only when server engine supports the options.
- Output mapping: `images` for rasterization; `merged` for images-to-PDF.

### 8.6. Import & Convert (`/pdf/import` or renamed Convert Documents)

- User sees a simple “Choose document” / upload action.
- Input area is `inputs`; legacy `word` remains read-only compatibility.
- FileBrowser lists compatible inputs and contextual Convert to PDF action.
- Output goes to `merged` under current mapping.
- Preserve input extension/MIME validation and upload limits.
- Explain unsupported formats clearly; do not show file types the backend cannot process.

### 8.7. Export (`/pdf/export`)

- User chooses one source PDF.
- Configuration dialog shows available formats from actual backend capabilities.
- Show destination `office/` before execution.
- Keep current `ExportFormatPicker` if it can be reused.
- Result appears in `office/` and can be previewed/downloaded through common FileBrowser.
- Show fidelity warnings where conversion may lose layout/images/tables; warnings must be grounded in actual converter limitations.

### 8.8. AI Extraction (`/pdf/extract`)

- Source selection through common workspace and explicit “Use as input”.
- Model/connection, preset, schema and export formats remain available.
- Use a focused configuration dialog or step panel for advanced settings; do not place a long permanent form under the file list.
- Preserve TM Hub AI Relay integration.
- Preserve current extraction job endpoints and checkpoint behavior until separately upgraded.
- Clearly warn that current checkpoint reuse is based on the existing identity described in v2 and is not yet fingerprinted by preset/model/schema; do not imply cache validity across config changes.
- Output `products/`; later user can navigate to `products/` to inspect it or use Export to create office formats.
- Never auto-assign a guessed category when extraction cannot determine it; use review-needed state if supported by schema/result model.

### 8.9. Future OCR / Table Extraction / Review

Do not put unfinished operations into active navigation or fake working buttons.

When implemented, each gets a specialized center workspace:

- OCR: source viewer + recognized text panel.
- Table Extraction: source viewer + editable table grid + table structure controls.
- Form Extraction: document viewer + field/value inspector.
- Validation: data grid + rule failures.
- Review: original extracted value vs edited value + approve/reject status.

They reuse the same Explorer, file APIs, viewer and operation framework.

---

## 9. Component architecture and reuse policy

### 9.1. Mandatory audit first

Before modifying components:

1. Inspect all files under `app/components/pdf`.
2. Inspect shared UI components outside that folder (layout, dialog, drawer, table, select, dropdown, tooltip, toast, icon, upload, progress, empty state).
3. Inspect current pages and composables.
4. Build an inventory: component, responsibility, props/emits/slots, used by, reusable status, recommended action.
5. Identify duplicate responsibilities and page-specific file lists.

Do not assume component names from this document are exact; the repository is the truth.

### 9.2. Suggested conceptual component groups

Use existing folder conventions. The following is a target responsibility map, not a mandatory mass file move:

```text
app/components/pdf/
├── workspace/
│   ├── WorkspaceShell.vue          # existing, retain and refine
│   ├── FolderTree.vue               # existing, retain and refine
│   └── shared/HeTreeMenu.vue        # existing tree primitive
│
├── browser/
│   ├── FileBrowser.vue              # existing single file list
│   ├── FileRow.vue                  # existing
│   ├── FolderRow.vue                # existing
│   ├── FileActions.vue              # existing
│   └── ContextMenu.vue              # existing
│
├── operations/
│   ├── DocumentDataFlowNote.vue     # new if not already present
│   ├── OperationInputSummary.vue    # new only if reusable need exists
│   ├── OperationInputPicker.vue     # future, only when multi/folder picker needed
│   ├── operation-specific forms/    # split/merge/export/extract config
│   └── result presenters/           # small reusable result summaries
│
├── viewer/
│   ├── PreviewFile.vue              # existing MIME dispatcher
│   ├── PreviewTable.vue             # existing
│   └── PreviewText.vue              # existing
│
└── jobs/
    └── progress/result components   # reuse current extraction UI first
```

Do not move all existing components just to match this diagram. Reorganize only when it improves clear ownership and can be done without broad import churn.

### 9.3. Component boundaries

| Component | Owns | Must not own |
|---|---|---|
| `WorkspaceShell` | 2-side layout, splitter, collapse | file API, operation logic |
| `FolderTree` | tree display, active folder, expand/search | file selection, operation execution |
| `FileBrowser` | current folder listing presentation, search/sort/density, row events | filesystem paths, API mutation logic, operation config |
| `FileRow` | file metadata display and row actions | global selection store, server calls |
| `DocumentDataFlowNote` | display input/output summary | path resolution, API calls |
| `OperationInputPicker` | task-scoped input selection | global Explorer navigation state |
| Operation config form | collect/validate config | direct filesystem write |
| Preview renderer | read-only document presentation | modify original file |
| Composable/page controller | state and typed API calls | raw filesystem access |
| Nitro modules | authoritative validation, permission, output and execution | UI concerns |

### 9.4. Reuse before create

- Reuse current `WorkspaceShell`, `FolderTree`, `HeTreeMenu`, `FileBrowser`, `FileRow`, `FileActions`, folder/context modals, preview components and `ExportFormatPicker` where suitable.
- If an existing component covers 70–80% of a need, extend it backward-compatibly before creating a parallel component.
- Do not create `PdfSplitFileBrowser`, `PdfMergeFileBrowser`, `PdfImagesFileBrowser`, etc.
- Operation-specific forms are allowed because their configuration semantics differ.
- Use the existing UI framework/design tokens. Do not add a new UI library or design system.
- Avoid wrapper-only components with no meaningful layout or logic responsibility.
- Every visible control must work, or be disabled with a clear reason. No fake demo controls.

---

## 10. Frontend state and contracts

### 10.1. Shared document reference

Use current shared types if suitable. Conceptual shape:

```ts
interface DocumentReference {
  area: PdfFileArea
  relativePath: string
  name: string
  kind: 'file' | 'folder'
}
```

This is a logical reference, not a filesystem absolute path and not a new database ID.

### 10.2. Input selection model

```ts
interface OperationInputState {
  mode: 'single-file' | 'multi-file' | 'folder'
  items: DocumentReference[]
}
```

Rules:

- `single-file`: exactly one file required.
- `multi-file`: one or more explicit file references; selection occurs in operation picker/file selection UI.
- `folder`: exactly one explicitly selected folder; recursion behavior must be stated (current folder only or include descendants).
- No operation may infer that every file in the active folder is selected.
- Changing active folder does not clear selected input automatically.
- If selected file is deleted/moved externally, revalidate before running and show an actionable error.

### 10.3. Operation metadata

Prefer types/API already in the repository. Do not create a second registry that conflicts with `server/modules/pdf/workspace.ts`.

A light frontend definition may describe:

- operation ID and i18n labels;
- category;
- input mode and accepted area/MIME;
- whether configuration is required;
- sync/async presentation;
- capability flags for progress/cancel/overwrite;
- server mapping key reference.

Server remains authoritative for:

- allowed areas and MIME/extension validation;
- folder/file write permissions;
- output area/path mapping;
- collision behavior;
- filesystem path resolution.

### 10.4. Avoid global state bloat

- Keep active folder/navigation separate from active operation input.
- Keep preview target separate.
- Keep operation config local to its route/dialog unless user explicitly saves a reusable template.
- Do not persist a file selection across unrelated tools without a clear UX reason.
- Preferences such as Explorer width/collapse can keep existing localStorage keys.

---

## 11. Backend and API architecture

### 11.1. Preserve the Nitro boundary

```text
Nuxt Renderer
    │ fetch /api/v1/pdf/*
    ▼
Nitro API routes
    ▼
Existing server/modules/pdf/*
    ├── workspace registry / output mapping
    ├── security / path resolution
    ├── directory / library / trash / audit
    ├── split / merge / raster / convert / export
    └── extraction / job state / checkpoint
    ▼
config.pdf.dir (.data/pdf)
```

No renderer `fs` imports. No arbitrary absolute path endpoints. No new Electron IPC for ordinary document operations.

### 11.2. Server remains source of truth

- `PDF_FILE_AREAS` whitelist remains authoritative.
- `DESCRIPTORS` / permission rules remain authoritative.
- `outputMapping` in `workspace.ts` remains authoritative.
- `safeFileName`, `safeRelativePath`, `resolveAreaFile` and root containment checks remain authoritative.
- Existing `runPdf` and `PDF_*` error mapping conventions remain.

### 11.3. Do not over-abstract the backend

The goal is easier code management, not a large framework. Do not introduce a generic plugin loader, arbitrary dynamic operation code, a second queue system or a second filesystem abstraction without a concrete need.

A small operation metadata registry on the frontend is acceptable. Actual operation execution continues through the existing Nitro routes/modules.

### 11.4. Sync and async execution

Keep current execution semantics during the UX rebuild:

- Existing split/merge/raster/convert/export routes remain sync unless load testing proves they must become async.
- AI extraction keeps the current async job API/status model.
- Do not force every operation into a new persistent job table in v3.
- Define a consistent UI presentation adapter for sync responses and async job status.
- A future worker/queue can be added behind the operation API without redesigning the UI.

### 11.5. Output collision and atomic write

Current overwrite/collision behavior must remain compatible. Do not silently change overwrite defaults.

Known gap from v2: atomic write for all generated outputs is not confirmed. Treat atomic temp-write + rename as a separate backend hardening task:

- Write temp file within the same destination area when safe.
- Flush/close then rename into final destination.
- Clean temp on error/startup recovery.
- Never overwrite a source file as an operation output.
- Test Windows file-lock behavior.

Do not block the entire UI rebuild on atomic write, but record and prioritize it explicitly.

---

## 12. File and folder permissions

Preserve the policy from the existing server descriptor, not a new frontend-only policy.

- Area roots are system-managed and immutable: no rename/move/delete.
- Subfolders can be created/renamed/deleted where `writableFolders` allows.
- File operations follow `writableFiles` and operation-specific permission.
- Legacy `word` remains read-only.
- `checkpoints` and `.trash` are not normal Explorer areas.
- Source documents must not be modified by processing operations.
- Deletion uses current soft-delete/trash flow.
- Every mutation is validated on Nitro, even if the UI hides the action.
- Continue path traversal, symlink/junction containment, extension and file size protections.

Do not add folder checkboxes. Do not allow a root operation by passing an empty relative path to rename/delete endpoints.

---

## 13. Universal Document Viewer

Keep the existing preview window and renderer dispatch. Improve it as a separate phase, not as a prerequisite to the new task-first navigation.

Current formats/behavior from v2 must be verified:

- PDF iframe/renderer.
- PNG/JPG image preview.
- CSV/XLSX through table preview.
- DOCX through Mammoth-generated HTML.
- JSON editor/view.
- XML/TXT text view.

Future enhancements:

- PDF thumbnails, page navigation, zoom, fit width/page, text search where text layer exists, rotate view, fullscreen.
- Image zoom/fit/rotate view.
- XLSX sheet navigation and larger table handling.
- Previous/Next within a provided result set.
- Better empty/loading/error/unsupported states.

Preview is read-only. Use existing file/inspect API; do not create a second filesystem access path.

---

## 14. Error, progress and result UX

### 14.1. Error messaging

- Preserve stable `PDF_*` error codes.
- Map server errors to localized messages using the existing i18n convention.
- Show a short human-readable message first; technical code/details may appear in expandable details for troubleshooting.
- Errors must not clear input/config automatically.
- Distinguish user-correctable validation errors, file-not-found, permissions, collision, provider rate limit/timeout and internal failure.

### 14.2. Progress

- Sync operations: show button loading and a local progress/working state only if measurable. Do not invent percentage progress.
- Async extraction: continue using actual job status and page counters.
- Cancel only when backend supports it.
- Closing preview or navigating to another folder must not cancel an operation.

### 14.3. Result state

One consistent result summary pattern:

- Status and short summary.
- Output location.
- Open output folder.
- Preview or open generated file.
- Download where supported.
- Details/errors where partial or failed.

The result summary is not a second permanent file browser. The single FileBrowser remains the way to browse the output area.

---

## 15. Internationalization and accessibility

- All user-facing labels use existing i18n files (`vi` and `en` at minimum if that is current repo convention).
- Do not hard-code Vietnamese strings in shared generic components if the project uses i18n keys.
- Area labels map from existing `pdf.areas.*` keys.
- Operation labels/descriptions use stable i18n keys.
- Icon-only buttons have tooltip/aria-label.
- Keyboard focus and escape behavior work in dialogs/drawers.
- Tree navigation supports keyboard operation if current tree primitive supports it; do not remove accessibility behavior during refactor.
- Respect the existing dark theme/tokens, typography, spacing and icon convention.

---

## 16. Performance requirements

- Lazy-load Explorer nodes. Do not recursively fetch the entire workspace at app startup.
- Load file metadata only for the current folder.
- Do not load file binary content for ordinary listing.
- Preview uses the existing endpoint/streaming behavior.
- Debounce folder/tool searches.
- Avoid rendering very large folder trees at once; use server search or tree virtualization only if measurements justify it.
- Avoid adding watchers, polling or global subscriptions that remain active after page unmount.
- Keep UI responsive during server processing; long work must not run on the renderer main thread.
- Do not add Redis/BullMQ or a new persistent queue unless a separate scalability requirement is approved.

---

## 17. Testing and acceptance criteria

### 17.1. Product/UX acceptance

- [ ] A first-time user can identify the main action from Home without understanding folder internals.
- [ ] Main navigation is task-first, not a list of storage areas.
- [ ] Library remains the file-management destination.
- [ ] All seven visible area roots appear in the same Explorer on all workspace/operation pages.
- [ ] Explorer has no folder checkboxes and only one active folder.
- [ ] Tree expansion and active folder state are independent.
- [ ] One FileBrowser is used on each workspace page.
- [ ] Split/Images pages no longer show parallel source/output file lists.
- [ ] Active Folder, Active Input and Preview Target are independent.
- [ ] Changing folder does not silently clear or replace Active Input.
- [ ] No folder is treated as selected input unless the operation explicitly selected folder mode.
- [ ] Operation pages show a clear input/output flow before execution.
- [ ] Output location is derived from server mapping.
- [ ] Each operation has only relevant configuration controls.
- [ ] No fake controls or misleading progress percentages.

### 17.2. Functional regression

Smoke-test existing flows:

- [ ] Upload PDF to `sources/`.
- [ ] Upload non-PDF input to `inputs/`.
- [ ] Browse all seven visible areas.
- [ ] Create/rename/delete permitted subfolders.
- [ ] Root folder mutation is blocked by UI and API.
- [ ] Legacy `word/` remains readable and immutable.
- [ ] Preview all currently supported formats.
- [ ] Split PDF.
- [ ] Merge split-pages folder.
- [ ] Rasterize PDF.
- [ ] Images to PDF.
- [ ] Convert input document to PDF.
- [ ] Export PDF.
- [ ] AI extraction with current connection/model/preset flow.
- [ ] Checkpoint/resume behavior remains unchanged unless separately upgraded.
- [ ] Trash/restore/purge behavior remains correct.
- [ ] Workspace report/repair remains safe.

### 17.3. Security regression

- [ ] Renderer has no direct filesystem access.
- [ ] No endpoint accepts arbitrary absolute file paths.
- [ ] `area` passes whitelist validation.
- [ ] `relativePath` passes safe normalization and root containment.
- [ ] Traversal and encoded traversal are rejected.
- [ ] Symlink/junction escape is rejected/ignored according to existing protections.
- [ ] File extension/size/MIME is validated server-side.
- [ ] Root area cannot be renamed/deleted through direct API calls.
- [ ] File output does not overwrite source documents.

### 17.4. Technical quality

- [ ] Baseline tests/build are recorded before changes.
- [ ] Typecheck/lint/test commands pass, or known pre-existing failures are documented.
- [ ] No duplicate FileBrowser/Explorer implementation is introduced.
- [ ] Shared components remain presentation-focused.
- [ ] Pages call typed composables/API, not raw filesystem code.
- [ ] i18n keys added for both supported locales.
- [ ] No data migration runs unless explicitly justified and backed up.

---

## 18. Rebuild execution plan

Do not attempt one risky big-bang rewrite that removes the old pages before the new implementation works. Rebuild the user experience in slices while keeping a rollback path.

### Phase 0 – Repository audit and baseline

1. Read project instructions (`AGENTS.md` if present), package scripts, Nuxt config, Electron wrapper, Nitro routes/modules and UI conventions.
2. Inventory all `app/components/pdf` components and shared UI components.
3. Map every current route to its existing page/component/API.
4. Record existing filesystem layout and sample file counts without modifying files.
5. Record baseline typecheck/lint/test/build and smoke-test results.
6. Create/update `docs/pdf/WORKSPACE-AUDIT.md`.
7. Create/update `docs/pdf/WORKSPACE-REBUILD-PLAN-v3.md` with exact file-level plan.

**Exit:** audit completed; no production behavior changed yet.

### Phase 1 – New task-first Home and navigation

1. Redesign `/pdf` as a simple tool launcher.
2. Group tools by user intent.
3. Add tool search only over available/implemented operations.
4. Keep Library as a distinct destination.
5. Keep old route URLs working.
6. Do not implement fake recent activity.

**Exit:** users can identify and open existing operations from Home; all old operation URLs still work.

### Phase 2 – One universal workspace shell

1. Reuse/refine `WorkspaceShell`.
2. Make every operation page request the same seven-area Explorer data, not only its local area tree.
3. Keep lazy loading per node.
4. Keep no folder checkboxes.
5. Establish one Active Folder state model.
6. Ensure the FileBrowser displays the active folder's contents.

**Exit:** Library and every current tool page show the same seven visible roots and one consistent file list.

### Phase 3 – Separate navigation, input and preview states

1. Define/refine `DocumentReference` using current shared types.
2. Introduce operation-scoped Active Input state.
3. Keep Preview Target separate.
4. Add explicit row action “Use as input” where appropriate.
5. Add selected-input summary.
6. Ensure folder navigation does not change selected input.

**Exit:** the user can browse another folder or preview a different file without silently changing the selected operation input.

### Phase 4 – Data Flow Note and result pattern

1. Implement/adapt `DocumentDataFlowNote.vue`.
2. Resolve output from the existing server mapping/report.
3. Show the correct input mode and selected items.
4. Add “Open output folder” using safe area/relative folder navigation.
5. Standardize small success/error result summary.

**Exit:** every current operation page clearly communicates input and output destinations.

### Phase 5 – Simplify existing operation pages

Migrate one operation at a time:

1. Split/Merge.
2. Images/Rasterize/Images-to-PDF.
3. Import/Convert.
4. Export.
5. AI Extraction.

For each:

- Remove duplicate file-list panels only after the common FileBrowser can show the same data/actions.
- Preserve current APIs and output mapping.
- Keep operation-specific forms.
- Test before migrating the next page.

**Exit:** all current tools work through the same workspace and no duplicate file lists remain.

### Phase 6 – Operation metadata and extensibility

1. Introduce a small frontend operation definition only if it reduces duplicated page logic.
2. Link metadata to existing output mapping keys.
3. Keep server permission/output as authority.
4. Standardize sync/async presentation adapters.
5. Do not build a dynamic plugin loader or new queue in this phase.

**Exit:** a new operation can be added by registering its metadata, page/configuration and Nitro route/module without modifying Explorer/FileBrowser.

### Phase 7 – Viewer improvements

1. Improve PDF viewer controls.
2. Improve image viewer.
3. Improve spreadsheet sheet navigation.
4. Add Previous/Next only when preview is opened from a known result collection.
5. Keep DOCX/JSON/text viewer paths.

**Exit:** existing file formats retain current preview support and approved enhancements work.

### Phase 8 – Future document intelligence

Only after the core workspace is stable:

- OCR Studio.
- Table Extraction.
- Form Extraction.
- Validation and Review.
- Multi-file Input Picker for operations that truly need it.
- Batch execution and persistent job history when justified.
- Processing templates/workflows.

Do not include unfinished items in the current Done checklist.

---

## 19. Backward compatibility, rollout and rollback

- Keep current route aliases while migrating pages.
- Keep current Nitro endpoints and request/response contracts unless a change is necessary and documented.
- Do not delete old components until all pages using them have migrated and regression tests pass.
- If the new page is risky, keep the old route/page available behind a development-only route or feature flag; do not expose confusing duplicate routes to normal users.
- Avoid retaining two permanently maintained implementations. The old implementation is a temporary migration fallback only.
- Do not run file migration as part of UI deployment.
- If a server contract must change, support old and new callers during the transition or migrate all consumers atomically with tests.

---

## 20. Documentation deliverables

Update/create under `docs/pdf/` following repository conventions:

- `WORKSPACE-AUDIT.md` – actual code/component/API audit.
- `WORKSPACE-REBUILD-PLAN-v3.md` – phase status, touched files and decisions.
- `OPERATION-CATALOG.md` – list of implemented operations, input modes, output mapping keys, execution mode and capabilities.
- `UI-FLOWS.md` – Home → choose operation → choose input → configure → run → result.
- `VERIFICATION.md` – tests and manual smoke-test evidence.

Do not create duplicate documents if equivalent files already exist; update the existing document and link it.

---

## 21. Mandatory instructions for the AI Coding Agent

1. Read this entire v3 document and the current v2 specification before editing.
2. Treat current repository code as the final source of truth; the spec is a target, not proof that code exists.
3. Start with Phase 0 audit and a baseline. Do not skip it.
4. Inspect all existing components in `app/components/pdf` and shared UI components before creating new ones.
5. Reuse existing components when they fit. Extend backward-compatibly where practical.
6. The user explicitly wants a simpler experience. Prefer fewer screens, fewer permanent panels, fewer duplicate lists and clear labels over adding configuration surfaces.
7. No folder checkbox selection. The Explorer is navigation-only with one active folder.
8. Do not conflate Active Folder, Active Input and Preview Target.
9. One FileBrowser per workspace page. Do not create parallel input/output file lists.
10. Organize the Home and main navigation by user tasks, not filesystem areas.
11. Keep the physical workspace and current area names/permissions unless a verified reason requires a separate approved change.
12. Nitro remains filesystem owner. No renderer `fs`, no arbitrary absolute paths, no PDF IPC channels.
13. Keep server `outputMapping` authoritative. Never hard-code destination paths in individual pages.
14. Preserve all existing operations and data. Do not remove a feature before its replacement passes regression.
15. Do not invent API capabilities, progress percentages, job history, multi-file support or future tools.
16. Do not add a new UI library, database, job queue or plugin framework without evidence and explicit technical justification.
17. Implement incrementally. After each phase, run relevant typecheck/lint/test and manual smoke tests.
18. Update the phase plan and verification report with actual results, not optimistic claims.
19. If the repository contradicts the spec, document the difference and choose the least destructive implementation; do not silently force the code to match an inaccurate assumption.
20. Do not stop after producing a plan. After audit, continue implementing the agreed phases within the task scope.

---

## 22. Short kickoff prompt

> Hãy rebuild TM Document Studio theo tài liệu `TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md`. Mục tiêu là đơn giản hóa toàn bộ trải nghiệm: người dùng chọn **việc muốn làm**, chọn tài liệu, cấu hình ngắn gọn, nhìn thấy rõ đầu vào/đầu ra và chạy xử lý. Main navigation phải task-first, không phản ánh tên folder vật lý. Mọi operation dùng chung một Universal Explorer (7 area, không checkbox folder) và một FileBrowser; không duy trì các panel danh sách file trùng lặp. Tách Active Folder, Active Input và Preview Target. Tận dụng tối đa component tại `app/components/pdf` và UI component sẵn có. Nitro tiếp tục là filesystem owner; giữ nguyên `.data/pdf`, registry, permission, `outputMapping`, API và dữ liệu hiện tại. Bắt đầu bằng Phase 0 audit + baseline, sau đó thực hiện từng phase; không chỉ lập kế hoạch và không xóa code cũ trước khi thay thế đã đạt regression.

---

## 23. Final product principle

**The user should think in tasks. The application should think in folders, permissions, paths, engines and jobs.**

Người dùng chỉ cần biết:

1. Tôi muốn làm gì?
2. Tôi muốn xử lý tài liệu nào?
3. Tôi muốn chọn tùy chọn nào?
4. Kết quả sẽ nằm ở đâu?

Những khái niệm kỹ thuật còn lại phải được hệ thống xử lý phía sau một cách nhất quán, an toàn và có thể mở rộng.
