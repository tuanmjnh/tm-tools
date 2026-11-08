# TM Document Studio v4 – Unified File Input, Processing & Output Architecture

> **Tài liệu đặc tả triển khai dành cho AI Coding Agent.**
>
> **Định hướng v4:** Người dùng không cần quản lý cây thư mục kỹ thuật. Họ chỉ cần **chọn tài liệu → chọn công việc → cấu hình cần thiết → chọn nơi nhận kết quả**. Ứng dụng chịu trách nhiệm về storage, staging, processing, job tracking, security và cleanup.
>
> **Runtime mục tiêu:** Dev local, Electron Desktop và Web deploy trên Vercel, dùng chung một codebase Nuxt/Nitro và cùng bộ processing engines khi tương thích.
>
> **Đây là bản thay thế định hướng sản phẩm và storage của v3.** Không có nghĩa là xóa ngay code, API hoặc dữ liệu đang chạy. Phải audit, thiết kế compatibility layer, triển khai theo phase, kiểm thử parity rồi mới loại bỏ UI/API cũ.

---

## 0. Chỉ thị quan trọng cho AI Coding Agent

### 0.1. Hãy đọc toàn bộ tài liệu trước khi code

AI phải đọc toàn bộ file này và các tài liệu hiện có liên quan đến TM Document Studio/PDF Studio, tối thiểu gồm:

- `TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` nếu vẫn còn trong repository.
- `TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC-v2.md` hoặc các bản archive tương ứng.
- `WORKSPACE-AUDIT.md`, `WORKSPACE-UPGRADE-PLAN.md`, `VERIFICATION.md` nếu tồn tại.
- `package.json`, `pnpm-lock.yaml`/lockfile đang dùng, `nuxt.config.ts`, `vercel.json`, cấu hình Electron, cấu hình Nitro.
- `electron/` (main, preload, IPC policy, download/session handling).
- Các route `server/api/v1/pdf/**` và module `server/modules/pdf/**`.
- Toàn bộ `app/components/pdf/**`, các component shared bên ngoài khu vực PDF, pages, composables, stores và types.
- Cơ chế TM Hub authentication, AI Relay, config và database hiện có.

Không giả định bất kỳ tên file, API, package hoặc khả năng nào vẫn đúng nếu chưa kiểm tra code thực tế.

### 0.2. Bắt buộc tạo Audit Report trước khi thay đổi

Tạo hoặc cập nhật `docs/document-studio/REBUILD-AUDIT.md` (nếu repository có quy ước docs khác thì theo quy ước hiện có), gồm:

1. Kiến trúc runtime hiện tại của dev local, Electron và Vercel.
2. Nitro hiện chạy ở đâu trong từng runtime và cách renderer gọi API.
3. Cấu hình đường dẫn `config.pdf.dir`, `PDF_DATA_DIR` và nơi dữ liệu thật đang lưu.
4. Danh sách các area/folder hiện tại cùng số lượng/dung lượng file (chỉ đọc metadata, không di chuyển).
5. Component hiện có trong `app/components/pdf` và các component shared có thể tái sử dụng.
6. Danh sách trang/operation hiện có, API hiện có, request/response thực tế.
7. Engine nào đã có, thư viện nào đang dùng, engine nào phụ thuộc filesystem path.
8. Extraction job/checkpoint hiện được lưu ở đâu, có bền vững qua restart không.
9. Auth/user identity hiện có và database/repository hiện có.
10. Build/test baseline local và Vercel hiện tại.
11. Những thay đổi cần làm, rủi ro, compatibility plan và file dự kiến chỉnh sửa.

**Không dừng sau audit.** Sau khi có audit, tiếp tục triển khai theo các phase trong tài liệu. Nếu cần điều chỉnh vì codebase thực tế khác mô tả, ghi rõ bằng chứng và chọn giải pháp ít phá vỡ nhất.

### 0.3. Ý nghĩa “rebuild toàn bộ” trong v4

Được phép thiết kế lại mạnh:

- Information Architecture, navigation và trang Home.
- Luồng chọn file, chọn operation, cấu hình, tiến trình và kết quả.
- Component composition và page structure.
- Document Storage Adapter, Temporary Workspace và Job orchestration.
- Operation Registry và contract input/output.
- Cách build/deploy cho Electron và Vercel.

Không được tự ý phá:

- Dữ liệu người dùng hiện có trong `.data/pdf`.
- Các engine Split/Merge/Rasterize/Convert/Export/AI Extraction đang hoạt động.
- AI Relay của TM Hub, preset, schema, checkpoint và các quy tắc nghiệp vụ đã có.
- Authentication, permission và API contract đang được module khác sử dụng.
- Các tính năng preview/viewer hiện tại.

Chỉ loại bỏ implementation cũ sau khi implementation mới đạt parity, regression tests và có kế hoạch rollback.

### 0.4. Nguyên tắc code

- Tái sử dụng component đúng vai trò; không tạo một bộ component song song nếu component hiện có có thể refactor an toàn.
- Nếu component hiện tại gắn cứng vào cây thư mục/area cũ, tách phần presentation hữu ích và chuyển dần sang component mới; không cố giữ một kiến trúc UI không còn phù hợp.
- Không hard-code đường dẫn máy cá nhân như `D:\Applications\tm-tools`.
- Không để Renderer import `fs`, `path`, `server/**` hoặc truy cập filesystem trực tiếp.
- Không để frontend tự ghép output path.
- Không dùng in-memory map làm nguồn dữ liệu duy nhất cho cloud job state.
- Không để Vercel Function `/tmp` trở thành persistent storage.
- Không đưa API token/Blob token/service key vào client bundle hoặc localStorage.
- Không chạy tác vụ nặng không giới hạn trong một HTTP request.
- Mọi control nhìn thấy phải có hành vi thật; không để nút demo/mock không hoạt động.
- Mọi thay đổi API phải có typed contract, validation và test.

---

# 1. Tuyên bố sản phẩm v4

## 1.1. Vấn đề sản phẩm cần giải quyết

Mô hình workspace v3 làm người dùng phải hiểu các vùng lưu trữ kỹ thuật như `sources`, `inputs`, `split`, `images`, `merged`, `products`, `office`. Các trang cũng có nguy cơ chứa nhiều danh sách file/panel riêng cho input và output. Đây là cách tổ chức thuận tiện cho code ban đầu nhưng không phải trải nghiệm đơn giản cho người sử dụng.

V4 chuyển sang **task-first, file-first, temporary-first**:

- Người dùng bắt đầu bằng việc họ muốn làm.
- Người dùng chọn tài liệu từ bất kỳ vị trí nào mà runtime cho phép.
- Người dùng không cần chuyển file vào một area kỹ thuật trước khi xử lý.
- Người dùng không phải tìm thư mục nguồn hoặc thư mục output của operation.
- Ứng dụng tự staging file vào vùng làm việc phù hợp.
- Kết quả được lưu vào output mặc định hoặc nơi lưu do người dùng chọn.
- Hệ thống tự quản lý metadata, job, temp, retry, retention và cleanup.

## 1.2. Quy trình cốt lõi

```text
CHOOSE
  Chọn file từ máy / kéo thả / chọn từ kho đầu vào đã lưu (nếu có)
       ↓
PROCESS
  Chọn operation → cấu hình → xem tóm tắt input/output → chạy
       ↓
SAVE
  Lưu vào output mặc định / Save As / chọn folder (runtime hỗ trợ)
       ↓
CLEANUP
  Dọn temporary data theo policy; giữ result/history theo retention
```

## 1.3. Những điều người dùng không cần biết

Không đưa những khái niệm này vào luồng thao tác thường ngày:

- `sources/`, `split/`, `merged/`, `products/`, `office/`.
- Absolute path của server.
- Vercel Blob pathname/token.
- `/tmp` hoặc staging directory.
- Checkpoint file.
- Job worker implementation.
- Runtime adapter hoặc provider nội bộ.

Các thông tin kỹ thuật có thể nằm trong trang Activity/Advanced Diagnostics dành cho quản trị viên, không phải UI tác vụ chính.

## 1.4. Ba nguyên tắc giao diện

1. **Choose:** chọn tài liệu rõ ràng, xem file đã chọn và lỗi định dạng/dung lượng ngay.
2. **Process:** công cụ có tên dễ hiểu, cấu hình tối thiểu và Advanced Options chỉ mở khi cần.
3. **Save:** vị trí lưu mặc định rõ ràng, có Save As/Choose Location khi runtime hỗ trợ; không ghi đè bất ngờ.

---

# 2. Runtime Matrix – một codebase, nhiều môi trường

## 2.1. Các runtime được hỗ trợ

| Runtime | Mục tiêu | Persistent file storage | Temporary storage | Output delivery |
|---|---|---|---|---|
| Dev local | Phát triển/test trên máy dev | Local workspace | Local job temp | Local output/download |
| Electron Desktop | Người dùng làm việc trên máy cá nhân | Local workspace do app cấu hình | Local job temp | Native Save As/Download/local output |
| Vercel Web | Web app trên hạ tầng cloud | Private Object Storage | Function `/tmp` cho từng execution | Authenticated download hoặc browser save |
| External Worker (future) | Tác vụ dài/nặng | Object Storage dùng chung | Worker scratch disk | Publish về Object Storage |

## 2.2. Bất biến kiến trúc

- Frontend Nuxt/Vue và Operation Definitions có thể dùng chung.
- Processing engine Node.js dùng chung khi dependency tương thích runtime.
- Storage, temp, queue và file picker là adapter theo runtime.
- Nitro/API là application boundary; không để component gọi SDK Blob, filesystem hoặc Electron API trực tiếp.
- Vercel cloud không dùng filesystem của deployment làm nơi lưu file bền vững.
- Electron local không cần upload file lên cloud nếu người dùng chọn chế độ xử lý local.
- AI calls vẫn đi qua AI Relay hiện tại của TM Hub, không thêm key riêng trong Document Studio.

## 2.3. Runtime Detection

Tạo một runtime configuration service duy nhất. Không rải `process.env.VERCEL`, `window.electron`, `isElectron` hoặc feature detection ở mọi component.

Ví dụ logical contract:

```ts
export type DocumentRuntime = 'local' | 'electron' | 'vercel' | 'worker'

export interface DocumentRuntimeCapabilities {
  runtime: DocumentRuntime
  canReadLocalFilePicker: boolean
  canChooseNativeSavePath: boolean
  canChooseOutputDirectory: boolean
  canUseBrowserSavePicker: boolean
  supportsPersistentLocalStorage: boolean
  supportsCloudObjectStorage: boolean
  supportsAsyncJobs: boolean
  maxUploadBytes: number
  maxInlineProcessBytes: number
}
```

Đây là contract gợi ý. Phải dùng runtime config thực tế và capability detection; không coi User-Agent string là nguồn sự thật duy nhất.

---

# 3. UX & Information Architecture – loại bỏ tree folder khỏi luồng chính

## 3.1. Primary navigation

Tổ chức menu theo việc người dùng muốn làm, không theo folder vật lý.

```text
Document Studio
├── Home
├── PDF Tools
│   ├── Split PDF
│   ├── Merge PDF
│   ├── Compress PDF       (chỉ hiển thị khi đã implement)
│   ├── Rotate PDF         (chỉ hiển thị khi đã implement)
│   └── Organize PDF       (chỉ hiển thị khi đã implement)
├── Convert
│   ├── PDF to Word
│   ├── Word to PDF
│   ├── PDF to Images
│   ├── Images to PDF
│   └── Other formats      (theo capability thực tế)
├── OCR & Extraction
│   ├── OCR                (chỉ hiển thị khi đã implement)
│   ├── Table Extraction   (chỉ hiển thị khi đã implement)
│   └── AI Extraction
├── Export
├── Files / Input Library  (tùy chọn, không bắt buộc)
├── Activity
│   ├── Current Jobs
│   └── History
└── Settings
    ├── Storage Defaults
    ├── Processing Limits
    └── Cleanup & Privacy
```

Không hiển thị tool chưa thực sự hoạt động như một action enabled. Nếu product owner muốn, có thể hiển thị nhóm “Coming soon” nhưng phải phân biệt rõ.

## 3.2. Trang Home

Home trả lời câu hỏi: **“Bạn muốn làm gì với tài liệu?”**

Thành phần:

- Header Document Studio + mô tả ngắn.
- Search tools.
- Các nhóm operation dạng card dễ hiểu.
- Recent operations (nếu metadata có thể lưu bền vững).
- Recent files (chỉ khi có library/persistent input storage; không tự tạo history file từ temp).
- Current jobs đang chạy.

Không hiển thị:

- Cây thư mục kỹ thuật.
- 7 area filesystem.
- Số lượng file theo internal folder làm nội dung chính.
- Các panel quản lý storage phức tạp.

## 3.3. Trang Operation – layout chuẩn

```text
┌──────────────────────────────────────────────────────────────────┐
│ Breadcrumb: Document Studio / PDF Tools / Split PDF              │
│ Icon + Split PDF                                                  │
│ Tách PDF thành từng trang riêng                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  01. CHOOSE FILES                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Drop files here                                             │  │
│  │ [Browse files] [Add more files]                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│  Selected files list                                             │
│                                                                  │
│  02. PROCESSING OPTIONS                                           │
│  Operation-specific short form                                   │
│  [Advanced options]                                               │
│                                                                  │
│  03. OUTPUT                                                       │
│  Default output location / Change destination / Download option  │
│                                                                  │
│  Summary: N files · estimated pages/size if available            │
│                                                 [Start processing]│
└──────────────────────────────────────────────────────────────────┘
```

Không bắt buộc mọi trang phải có chính xác ba card lớn. Có thể dùng một card gọn, section hoặc stepper tùy design system. Nhưng thứ tự và ngữ nghĩa Choose → Process → Save phải nhất quán.

## 3.4. Không dùng Universal Explorer / folder tree trong flow tác vụ

- Loại bỏ cây 7 area khỏi các trang operation chính.
- Không có checkbox select nhiều folder.
- Không yêu cầu người dùng mở `sources/`, `split/`, `products/` để tìm tài liệu.
- Không tạo một FileBrowser kỹ thuật chiếm nửa màn hình cho mọi trang.
- Cho phép chọn file từ bất kỳ đường dẫn nào qua native/browser file picker.
- Cho phép kéo thả file.
- Có thể có Input Library đơn giản để chọn file đã lưu, nhưng đó là nguồn bổ sung, không phải bắt buộc.

Nếu cần một trang quản lý tài liệu, làm nó như một thư viện tìm kiếm/list view đơn giản. Không dùng tree area nội bộ làm điều hướng sản phẩm.

## 3.5. File selection model

Không đồng nhất “file đang preview”, “file đã chọn làm input” và “file gần đây”.

```ts
interface SelectedInputFile {
  clientId: string
  name: string
  size: number
  mimeType: string
  extension: string
  lastModified?: number
  source: 'file-picker' | 'drag-drop' | 'input-library' | 'operation-picker'
  uploadState: 'local' | 'uploading' | 'uploaded' | 'failed'
  storageRef?: StorageObjectRef
  validationErrors: string[]
}
```

- `SelectedInputFile` là frontend view model, không chứa absolute path.
- Preview target là state riêng.
- File selection state sống trong operation page/workspace; không thay đổi khi người dùng mở preview.
- Khi người dùng bỏ file khỏi list, chỉ xóa reference/staging liên quan đến operation hiện tại theo policy, không tự xóa file nguồn gốc trên máy.
- Selection không được giữ vô hạn trong localStorage; File/Blob object có lifecycle riêng và không serializable.

## 3.6. Single/Multi/Folder input

Mỗi operation khai báo rõ:

- `single-file`: đúng một file.
- `multi-file`: nhiều file, có thể cho reorder nếu thứ tự có ý nghĩa.
- `folder-batch`: folder được chọn như một đơn vị, chỉ bật khi runtime hỗ trợ và operation thực sự có semantics xử lý folder.

Không thêm checkbox vào folder tree. Multi-file selection dùng native/browser picker hoặc Operation Input Picker chuyên biệt.

Folder selection trên Web không có mức hỗ trợ đồng đều. Ưu tiên multi-file picker. Chỉ triển khai folder picker khi có fallback rõ ràng (ví dụ chọn nhiều file bằng `webkitdirectory` trong browser hỗ trợ, hoặc chọn file thủ công) và giải thích giới hạn.

## 3.7. Operation Input Picker (future reusable)

Khi operation cần chọn thêm tài liệu từ Input Library hoặc nhiều tài liệu từ kho nội bộ, có thể mở dialog riêng:

- Search/filter.
- Danh sách file, checkbox chỉ ở danh sách file của dialog.
- Không checkbox trên folder tree.
- Có thể đổi folder bằng breadcrumb nếu Input Library có folder.
- Xác nhận selection rồi trả về các file references.

Không xây component này nếu MVP chỉ cần file picker và drag/drop.

---

# 4. Input & Output Experience

## 4.1. Input selection UX

Mỗi operation page có khu vực:

- Drag & Drop.
- Browse files.
- Add more files (nếu multi-file).
- Selected file list.
- Remove from current selection.
- Preview (nếu type được hỗ trợ).
- Hiển thị name, type, size, số trang nếu đã phân tích được.
- Validation errors/warnings.

Không hiển thị đường dẫn tuyệt đối mặc định. Có thể hiển thị relative/display label hoặc source type. Trong desktop, nếu người dùng cần xem vị trí file, dùng action “Show in folder” qua capability có kiểm soát.

## 4.2. Input Library và default input folder

Local/Electron có thể có:

```text
<documentDataRoot>/input/
```

Đây là **kho đầu vào mặc định tùy chọn**, phục vụ Import/Save to Library và chọn lại file đã lưu. Không bắt buộc mọi file người dùng chọn phải được copy vào đây.

Hai mode phải được phân biệt:

1. **Use once:** chọn file bất kỳ và chỉ stage vào job temp để xử lý; không giữ bản sao lâu dài trong input library.
2. **Import to Input Library:** người dùng chủ động lưu bản sao vào folder input để tái sử dụng.

Không tự động duplicate file người dùng khi họ chỉ muốn xử lý một lần.

Cloud runtime có thể cung cấp một Input Library private nếu sản phẩm yêu cầu lưu tài liệu giữa các phiên; nếu không có nhu cầu, chỉ dùng temporary object prefix theo job và không tạo “input library” cloud giả.

## 4.3. Default output folder

Local/Electron:

```text
<documentDataRoot>/output/
```

- Đây là nơi lưu mặc định khi người dùng chọn “Save to default output”.
- Người dùng có thể chọn Save As hoặc vị trí khác.
- Không ghi đè file có sẵn nếu chưa có xác nhận.

Web/Vercel:

- Không có đường dẫn local `output/` trên máy client mà Nitro có thể tự ghi.
- Default behavior là tạo private temporary result trong object storage và cho người dùng Download.
- Nếu browser hỗ trợ File System Access API, có thể ghi vào file/directory handle do user cấp quyền trực tiếp.
- Nếu không hỗ trợ, dùng browser download.
- User phải hiểu dữ liệu cloud có thời hạn; không hiển thị private Blob pathname.

## 4.4. Output destination types

```ts
export type OutputDestination =
  | { kind: 'default-local-output' }
  | { kind: 'save-as-file' }
  | { kind: 'browser-download' }
  | { kind: 'browser-file-handle'; handleId: string }
  | { kind: 'browser-directory-handle'; handleId: string }
  | { kind: 'private-cloud-result' }
  | { kind: 'zip-download' }
```

Contract thực tế phải tránh serialize native file handles trực tiếp vào API/job metadata. `handleId` chỉ là reference nội bộ trong adapter session; không gửi raw handle tới server.

## 4.5. Output UX thống nhất

Trước khi chạy:

- Hiển thị `Output location`.
- Mặc định: `output/` ở local/Electron, `Download after processing` ở Web.
- Có action `Change`.
- Hiển thị collision strategy: Ask before overwrite (default), Rename, Overwrite (chỉ khi user chủ động bật).
- Nhiều artifact: cho phép Save as ZIP hoặc save từng file nếu runtime hỗ trợ.

Sau khi chạy:

- Hiển thị Result Summary.
- Tên artifact, kích thước, định dạng.
- Download/Save As.
- Open/Preview.
- Show in folder nếu local output và có capability.
- Delete result nếu policy cho phép.

Không nói “đã lưu vào máy người dùng” nếu file mới chỉ nằm trên Private Blob. Phân biệt rõ `Ready to download` và `Saved to selected location`.

## 4.6. Local/Electron – Save As và output folder tùy chọn

Ưu tiên khả năng trình duyệt Chromium/HTML file handling nếu hỗ trợ. Khi cần native dialog, chỉ expose capability hẹp qua Electron preload:

- `showSaveDialog`/Save As cho artifact đơn.
- Có thể `showOpenDialog` chọn output directory cho batch export nếu product cần.
- Không expose `fs`, `path`, shell command hoặc arbitrary read/write API cho Renderer.
- Không cho Renderer gửi absolute path tùy ý vào Nitro API.
- Main Process giữ path được người dùng chọn; Renderer chỉ nhận opaque operation/result status hoặc thực hiện download flow được kiểm soát.
- Nếu Main Process phải ghi nhiều artifacts vào folder được chọn, chỉ nhận `jobId` + artifact IDs; server phải xác thực job/artifacts, Main chỉ tải các output đã publish từ endpoint local được xác thực rồi ghi vào destination user-approved.
- Không nhận tên file/path từ client mà không sanitize.
- Dialog native phải mở từ user gesture qua preload allowlist.

Nếu không cần ghi trực tiếp nhiều file vào folder, lựa chọn đơn giản hơn là tạo một ZIP rồi `Save As` một file. Ưu tiên ZIP cho batch output để giảm phức tạp và tạo trải nghiệm cross-platform nhất quán.

**Quan trọng:** native dialog bridge này chỉ là File Access capability. Không chuyển xử lý PDF sang Electron Main và không tạo một processing engine thứ hai.

## 4.7. Web – browser save

Thứ tự fallback:

1. Feature detect `window.showSaveFilePicker()` cho một file.
2. Nếu user chọn folder và `showDirectoryPicker()` tồn tại + user cấp quyền, có thể ghi nhiều artifact theo policy.
3. Nếu API không hỗ trợ hoặc user từ chối permission: dùng standard download.
4. Với nhiều file: ưu tiên tạo ZIP server-side để tải một lần.

Không coi File System Access API là available trên mọi browser. Phải có fallback và test Chromium/Firefox/Safari theo ma trận support mục tiêu.

## 4.8. Output naming

- Sanitize filename.
- Giữ extension phù hợp.
- Xử lý Unicode tên file.
- Không cho `../`, absolute path hoặc reserved characters làm path escape.
- Không dùng tên người dùng để ghép object key trực tiếp.
- Sinh storage key có random ID; fileName chỉ là metadata/display name.
- Collision default = `ask` hoặc generate safe suffix; không overwrite im lặng.
- Nếu operation sinh nhiều file, naming pattern do operation definition khai báo.

---

# 5. Storage Architecture – Local, Electron và Vercel

## 5.1. Phân biệt ba loại storage

1. **Persistent Input Library:** file do user chủ động import/lưu để tái sử dụng.
2. **Temporary Job Storage:** bản staging input, intermediate và output đang xử lý.
3. **Published Result Storage:** output đã hoàn thành, chờ tải xuống hoặc được lưu vào output mặc định.

Không gộp cả ba lifecycle vào một thư mục chung không có metadata.

## 5.2. Local/Electron physical layout đề xuất

Giữ một root do cấu hình hiện tại quyết định (audit `config.pdf.dir` / `PDF_DATA_DIR` trước khi đổi). Định hướng layout mới:

```text
<documentDataRoot>/
├── input/                       # Optional reusable input library
├── output/                      # Default persistent output folder
└── .system/                     # App-managed; never shown as normal user folder
    ├── jobs/
    │   └── <jobId>/
    │       ├── input/            # Staged source copies
    │       ├── working/          # Intermediate files
    │       ├── output/           # Unpublished outputs
    │       └── manifest.json     # Job-local recovery metadata (if appropriate)
    ├── cache/
    ├── thumbnails/
    ├── logs/
    └── cleanup-locks/
```

Rules:

- Không hard-code root.
- Root có thể cấu hình qua setting/environment hiện có.
- Không đưa `.system` vào UI library thông thường.
- Không sửa file nguồn gốc của user.
- Job temp được tạo unique theo `jobId`.
- Chỉ move/copy output sang `output/` sau khi output hợp lệ và user đã chọn destination policy.
- `input/` không bắt buộc nhận mọi file được chọn; chỉ lưu khi user chọn Import/Save to Input Library.
- Dữ liệu v3 cũ trong `sources`, `inputs`, `split`, `images`, `merged`, `products`, `office`, `word`, `checkpoints`, `.trash` phải được giữ an toàn trong giai đoạn migration.

## 5.3. Dev local

- Local adapter dùng Node.js filesystem trong Nitro/server process.
- Storage root lấy từ config.
- Job temp nằm dưới `.system/jobs/<jobId>` hoặc temp root an toàn do cấu hình.
- Có quota check trước khi stage/copy.
- Dùng streaming pipeline thay vì đọc toàn bộ file vào RAM nếu file lớn.
- Cleanup khi success/failure/cancel; startup janitor dọn job temp orphan theo TTL.
- Nếu app bị tắt giữa lúc xử lý, metadata/job state cho phép đánh dấu interrupted và cleanup/resume theo operation support.

## 5.4. Electron Desktop

- Electron đóng vai trò desktop shell, cung cấp native capability hẹp khi cần.
- Nitro local tiếp tục là processing owner nếu đó là kiến trúc thực tế hiện tại.
- File người dùng chọn qua browser file input/drag-drop có thể stage từ `File` object vào local Nitro API.
- Không yêu cầu user copy file vào một area cứng trước xử lý.
- Với file lớn, dùng request streaming/multipart tới local Nitro, không convert thành base64.
- Native Save As/Select Directory có thể đi qua preload bridge đã allowlist; không expose arbitrary filesystem functions.
- Main Process không xử lý PDF; chỉ mở dialog và/hoặc ghi artifact đã được phê duyệt.
- Nếu Nitro local và Electron Main cần trao đổi artifact, dùng local authenticated endpoint + one-time capability, không truyền absolute path tùy tiện qua Renderer.

## 5.5. Vercel Web – không persistent filesystem

Đây là quyết định bắt buộc:

- Vercel Function filesystem là read-only ngoài vùng scratch `/tmp`.
- `/tmp` writable tối đa 500 MB theo docs hiện tại; đây là scratch space, không phải persistent storage.
- Không lưu input/output/job state lâu dài trong `/tmp`.
- Không mong request sau chạy trên cùng Function instance hoặc thấy cùng file `/tmp`.
- Không dùng `.data/pdf` làm persistent disk trên Vercel.
- Không đóng gói tài liệu người dùng vào deployment.
- Persistent file bytes phải nằm trong Object Storage (ví dụ Vercel Blob Private hoặc S3-compatible provider).
- Persistent job metadata phải nằm trong database bền vững.

### 5.5.1. Cloud object key layout

Object storage dùng prefix logic, không phải folder thật:

```text
private-document-studio/
└── <tenantOrUserId>/
    └── jobs/
        └── <jobId>/
            ├── input/<inputId>/<safeDisplayName>
            ├── working/                 # chỉ nếu thực sự cần publish intermediate; mặc định không lưu
            └── output/<artifactId>/<safeDisplayName>
```

Rules:

- Prefix/key do server sinh.
- Không cho client chọn key tùy ý.
- Mọi object private.
- Mọi object phải liên kết với `userId`/tenant, `jobId`, `artifactId` và TTL.
- Không publicize file tài liệu chỉ để tải xuống dễ hơn.
- Không ghi credential vào URL/query string do người dùng nhìn thấy.

### 5.5.2. Vercel Blob Private – lựa chọn ban đầu, không lock-in

Có thể dùng Vercel Blob Private cho cloud staging/result nếu phù hợp với dung lượng, privacy và chi phí.

- Tạo Private Blob store, không dùng Public Blob cho tài liệu user.
- Client upload trực tiếp Blob thông qua token exchange/server callback; server phải authenticate + authorize trước khi cấp token.
- Không gửi file lớn qua Nitro Function request body.
- Sau upload, server verify object metadata (owner/job/key/size/type) trước khi finalize job.
- Download private object phải đi qua route/auth logic phù hợp với phiên bản SDK/API đang dùng.
- Không expose read-write token trong browser.
- Treat blob object as immutable: tạo key mới cho artifact mới, không ghi đè object đang có.

**Cảnh báo vận hành theo docs được kiểm tra ngày 2026-11-06:** Vercel Private Blob docs hiện đánh dấu Private Storage là Beta và khuyến nghị không phục vụ file lớn hơn 100 MB qua Private Blob trừ khi traffic thấp. Vì vậy:

- Dùng Private Blob cho tài liệu nhỏ/vừa và kết quả có traffic thấp khi phù hợp.
- Với artifact lớn, phải benchmark streaming, chi phí Function + transfer, và cân nhắc adapter S3-compatible storage / signed delivery.
- Storage abstraction bắt buộc để có thể đổi provider mà không sửa Operation UI/Engine.
- Trước khi release, kiểm tra lại trạng thái Beta, SDK version và limits chính thức.

### 5.5.3. Local input/output defaults versus cloud temporary prefixes

Local:

```text
input/   # reusable input library, optional
output/  # persistent default output
.system/ # internal temp/jobs/cache
```

Vercel:

```text
Private Blob prefix:
  jobs/<jobId>/input/      # temporary input objects
  jobs/<jobId>/output/     # temporary output objects

Database:
  job metadata, ownership, state, expiry, artifact metadata

Function:
  /tmp/<jobId>/input/
  /tmp/<jobId>/working/
  /tmp/<jobId>/output/
```

Cloud `input/` và `output/` trong ví dụ là prefix theo job, không phải folder persistent cá nhân trên máy client. Chỉ tạo Cloud Input Library nếu sản phẩm thực sự cần tài liệu được lưu để tái sử dụng giữa các phiên.

## 5.6. Storage Provider Interface

Xây storage interface trong server layer. Tên thực tế theo convention codebase; không tạo abstraction quá phức tạp.

```ts
export interface StorageObjectRef {
  provider: 'local' | 'vercel-blob' | 's3-compatible'
  key: string                 // internal opaque key, server-only in normal UI
  ownerId: string
  size: number
  mimeType: string
  checksum?: string
}

export interface DocumentStorageProvider {
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget>
  verifyUploadedObject(ref: StorageObjectRef): Promise<VerifiedObject>
  createReadStream(ref: StorageObjectRef): Promise<NodeJS.ReadableStream>
  putObject(input: PutObjectInput): Promise<StorageObjectRef>
  deleteObject(ref: StorageObjectRef): Promise<void>
  getMetadata(ref: StorageObjectRef): Promise<StorageObjectMetadata>
}
```

Lưu ý:

- Local adapter có thể trả upload URL về local API hoặc ghi stream vào temp.
- Blob adapter có thể dùng direct client upload + server token callback.
- Không buộc mọi provider phải expose cùng primitive nếu provider không hỗ trợ; adapter thực hiện capability mapping.
- `StorageObjectRef.key` tuyệt đối không được coi là file path từ client.
- API client-facing chỉ trả safe reference IDs, display metadata và authorized download routes.

## 5.7. Temporary Workspace Provider

```ts
export interface TemporaryWorkspace {
  create(jobId: string): Promise<TempJobWorkspace>
  cleanup(jobId: string): Promise<CleanupReport>
  getUsage(jobId: string): Promise<TempUsage>
  ensureCapacity(jobId: string, expectedBytes: number): Promise<void>
}

export interface TempJobWorkspace {
  root: string                // server-only path
  inputDir: string
  workingDir: string
  outputDir: string
  cleanup(): Promise<CleanupReport>
}
```

Rules:

- Server-only; không serialize temp absolute path về client.
- `root` được tạo unique với permissions phù hợp.
- Chỉ input đã verify mới stage vào inputDir.
- Output chỉ publish sau validation.
- Cleanup phải chống symlink/path traversal và chỉ xóa bên trong job temp root.
- Không dùng `rm -rf` trên path nhận từ request.
- Không cleanup job đang active nếu chưa có lease/lock.
- Có quota theo job và runtime capability.

---

# 6. Web Upload Architecture – Browser → Private Object Storage

## 6.1. Vì sao không upload file lớn qua Nitro Function body

Vercel Function hiện giới hạn request payload và response payload ở 4.5 MB. Với file lớn hơn, route proxy upload qua Function có thể bị `413 FUNCTION_PAYLOAD_TOO_LARGE`.

Vì thế cloud upload mặc định nên là **direct client upload to Private Blob** hoặc object storage tương đương; Nitro chỉ cấp token có giới hạn và quản lý metadata.

## 6.2. Upload flow

```text
Browser selects File(s)
        ↓
POST /api/v1/documents/jobs
  - authenticate user
  - validate operation & input policy
  - create draft job + input records
        ↓
POST /api/v1/documents/jobs/:jobId/upload-targets
  - authorize job owner
  - generate restricted upload token/target
        ↓
Browser uploads directly to Private Object Storage
        ↓
POST /api/v1/documents/jobs/:jobId/finalize-upload
  - verify uploaded objects
  - check size/type/ownership/key
  - mark inputs ready
        ↓
POST /api/v1/documents/jobs/:jobId/start
        ↓
queue/function/worker
```

Có thể gộp create + target endpoint nếu current Blob SDK flow yêu cầu, nhưng phải giữ logic xác thực/ủy quyền trước khi tạo token.

## 6.3. Upload token security

- Token có TTL ngắn nhất phù hợp SDK.
- `allowedContentTypes` theo operation.
- `maximumSizeInBytes` hoặc giới hạn tương đương nếu SDK/provider hỗ trợ; nếu không, verify size sau upload và có rate/quota controls trước cấp token.
- Pathname/key server-generated; không nhận arbitrary prefix từ client.
- Token payload chỉ chứa job ID, input ID, owner ID hoặc claims cần thiết; không chứa secret.
- `onBeforeGenerateToken` phải authenticate + authorize user/job.
- `onUploadCompleted` hoặc finalize API phải kiểm chứng object thực tế; callback không được coi client-supplied metadata là truth.
- Hạn chế số lượng input files/job.
- Chặn content type không hỗ trợ.
- Kiểm tra extension + magic bytes/content signature phía server.
- Client upload token không được có quyền list/delete toàn store.

## 6.4. Small files

Có thể cân nhắc upload qua Nitro nếu file rất nhỏ và dưới ngưỡng bảo thủ của Function. Tuy nhiên, để giảm nhánh logic, MVP có thể dùng direct upload provider cho tất cả cloud file sizes được hỗ trợ.

Nếu có inline upload route:

- Ngưỡng phải nhỏ hơn 4.5 MB, để chừa overhead.
- Có body size limit rõ.
- Không base64 encode.
- Reject sớm nếu Content-Length vượt limit.

## 6.5. Upload progress và retry

UI phải có:

- Per-file upload progress khi SDK cung cấp.
- Overall upload progress.
- Retry failed upload cho từng file.
- Cancel upload.
- Không start processing nếu input còn `uploading` hoặc `failed`.
- Hỗ trợ resume multipart nếu provider/SDK hỗ trợ; không tự giả định.
- Nếu user đóng tab giữa upload: draft job và partially uploaded object được cleanup theo TTL.

## 6.6. Upload finalize validation

Server kiểm tra:

- Job tồn tại và owner/tenant đúng.
- Input ID thuộc job.
- Object key thuộc đúng prefix/job.
- Object size trong limits.
- MIME/extension/magic bytes hợp lệ.
- Object không bị thay thế ngoài ý muốn.
- Checksum nếu provider hỗ trợ và cần thiết.
- Tổng dung lượng input nằm trong quota.

---

# 7. Processing Pipeline – local và cloud

## 7.1. Shared engine contract

Processing engine không được biết user chọn file từ dialog nào hoặc file nằm ở Blob hay local disk. Engine nhận staged local files do server tạo và một output temp directory do server cấp.

```ts
export interface StagedInputFile {
  inputId: string
  originalName: string
  safeName: string
  mimeType: string
  size: number
  localPath: string            // server-only, never sent to client
}

export interface OperationExecutionContext {
  jobId: string
  ownerId: string
  operationId: string
  inputs: StagedInputFile[]
  workingDir: string           // server-only
  outputDir: string            // server-only
  signal: AbortSignal
  limits: OperationResourceLimits
  reportProgress(progress: OperationProgress): Promise<void> | void
  log(event: SafeOperationLog): void
}

export interface OperationExecutionResult {
  status: 'completed' | 'partial' | 'failed'
  artifacts: LocalOutputArtifact[]
  summary?: Record<string, string | number | boolean | null>
  warnings?: OperationWarning[]
  errors?: OperationError[]
}
```

Không bắt buộc dùng đúng tên type. Nhưng ranh giới phải giữ:

- Storage adapter stage input.
- Engine thực hiện nghiệp vụ.
- Output validator kiểm tra file.
- Storage adapter publish output.
- Job repository cập nhật trạng thái.

## 7.2. Local/Electron processing flow

```text
File Picker / Drag & Drop
      ↓
Renderer File object
      ↓ streaming multipart to local Nitro
Local Job Repository + Temp Workspace
      ↓
Existing PDF/Office/Image/AI engine
      ↓
Validate output artifact(s)
      ↓
Copy/Publish to default output folder OR keep in job result temp
      ↓
Download / Native Save As / Save to chosen local location
      ↓
Cleanup temp copies
```

Không bắt buộc copy file nguồn vào `input/`. Chỉ khi user chọn “Import to Input Library” mới lưu persistent copy.

## 7.3. Vercel cloud processing flow

```text
Browser File
      ↓ direct upload
Private Blob: jobs/<jobId>/input/<inputId>
      ↓
Persistent Job DB: queued
      ↓
Vercel Function / Queue Consumer / Workflow step
      ↓
Download or stream input → /tmp/<jobId>/input
      ↓
Run engine (within runtime budget)
      ↓
/tmp/<jobId>/output
      ↓ validate
Upload artifact → Private Object Storage
      ↓
Job DB = completed + artifact metadata + expiresAt
      ↓
finally cleanup /tmp
      ↓
Authenticated result download
      ↓
Blob cleanup after retention/user deletion
```

Function invocation không được kỳ vọng tồn tại liên tục giữa các bước. Mỗi bước durable phải có input/output reference trong object storage/database.

## 7.4. Processing execution modes

Mỗi operation được phân loại:

- `inline`: tác vụ nhỏ, có giới hạn thời gian/resource rõ; phù hợp request/response.
- `async-function`: tạo job rồi worker/function tiếp nhận, UI poll job.
- `durable-workflow`: nhiều bước/retry/wait, cần state bền vững.
- `external-worker`: file quá lớn, native binaries, thời gian chạy dài hoặc cần disk/RAM vượt Vercel Function.

Không chọn mode chỉ dựa trên tên tool. Chọn dựa trên file size, page count, operation profile và runtime capability.

## 7.5. Operation Runtime Policy

Mỗi operation có resource profile, ví dụ:

```ts
interface OperationResourceLimits {
  maxInputFiles: number
  maxTotalInputBytes: number
  maxSingleInputBytes: number
  maxPages?: number
  maxOutputBytes: number
  maxTempBytes: number
  maxDurationMs: number
  maxConcurrentJobsPerUser: number
  executionMode: 'inline' | 'async-function' | 'durable-workflow' | 'external-worker'
}
```

Giá trị thực tế phải đến từ cấu hình theo runtime/plan, không hard-code một bộ limits cho mọi môi trường.

Nếu job vượt khả năng runtime:

- Không bắt đầu xử lý rồi để timeout.
- Trả error/capability reason dễ hiểu.
- Nếu có external worker adapter thì enqueue sang worker.
- Nếu chưa có worker, yêu cầu giảm kích thước/chia nhỏ hoặc thông báo feature chưa hỗ trợ cloud runtime.

---

# 8. Vercel Deployment Constraints & Strategy

## 8.1. Các giới hạn phải hiểu trước khi triển khai

Tại thời điểm kiểm tra tài liệu chính thức **2026-11-06**, các trang Vercel nêu:

- Function filesystem read-only, có writable `/tmp` scratch space tối đa 500 MB.
- Vercel Function request/response payload limit 4.5 MB.
- Node.js Function memory hiện được ghi nhận: Hobby tối đa 2 GB; Pro/Enterprise tối đa 4 GB.
- Function duration thay đổi theo plan/Fluid Compute/configuration; trang limits hiện nêu Hobby 300s, Pro/Enterprise thường tối đa 800s, extended 1800s đang Beta cho một số runtime/config.
- Vercel Workflows được định vị cho việc execution dài, pause/resume và state qua thời gian dài; Queues là durable event stream có automatic retry và at-least-once delivery, hiện được docs đánh dấu Beta.
- Hobby Cron Jobs chỉ chạy tối đa một lần/ngày; Pro/Enterprise có thể chạy mỗi phút theo docs hiện tại.

**Không đóng đinh các con số này trong logic nghiệp vụ.** Lưu vào runtime capability config, đối chiếu Vercel dashboard/project plan và docs ngay trước deploy vì giới hạn, beta status và pricing có thể thay đổi.

## 8.2. `/tmp` policy

- `/tmp` là scratch cho một Function invocation/instance, không phải persistent volume.
- Không rely on file temp tồn tại ở request tiếp theo.
- Mỗi execution phải có unique workdir.
- Dùng `os.tmpdir()` và `mkdtemp`/random unique directory, không ghép từ user path.
- Có budget tổng input + intermediate + output; không chỉ kiểm input file size.
- Kiểm tra disk space/quota trước khi stage.
- Xóa trong `finally`.
- Có best-effort cleanup khi error/cancel.
- Blob/DB expiration cleanup xử lý orphan cloud artifacts; không dùng Cron để dọn `/tmp` của Function đã kết thúc.

**Ngưỡng vận hành ban đầu (đề xuất, cần benchmark):** đặt scratch budget cho mỗi job thấp hơn giới hạn cứng 500 MB (ví dụ 300–350 MB) để chừa headroom cho runtime/library và concurrent work. Không hard-code con số nếu workload đo thực tế khác.

## 8.3. Không proxy large upload qua Function

- Function payload limit hiện là 4.5 MB.
- File lớn hơn phải upload trực tiếp từ browser tới Object Storage bằng token exchange.
- Không gửi base64; base64 làm tăng dung lượng.
- Không dùng Function response để trả binary artifact lớn nếu có thể stream/download trực tiếp qua cơ chế private delivery phù hợp.

## 8.4. Private Blob size/delivery consideration

Docs Private Blob hiện khuyến nghị tránh serving file trên 100 MB qua Private Blob trừ khi traffic thấp. Vì vậy phải:

- Benchmark file lớn, số lượt tải và chi phí transfer.
- Đặt download size policy.
- Với output lớn, cân nhắc S3-compatible object storage/presigned download hoặc storage provider khác.
- Không biến Private Blob thành provider cố định duy nhất trong domain model.

## 8.5. Function duration và heavy processing

- Không dựa vào maximum duration làm background job engine.
- Nếu operation phù hợp chạy dưới giới hạn thì function xử lý bounded task.
- Nếu multi-step/long-running: dùng durable workflow/queue hoặc external worker.
- Vercel Queues/Workflows nếu chọn phải đặt sau adapter và kiểm tra Beta/plan/SDK support.
- Không đưa native binary/large dependency vào function bundle nếu build size vượt limit.
- Nếu PDF/Office library cần binary/system package, test production Linux runtime, fonts, shared libraries và package tracing.

## 8.6. Suggested cloud deployment topology

MVP cloud:

```text
Vercel Nuxt/Nitro App
  ├── Authenticated API
  ├── Operation Registry
  ├── Job API
  ├── Blob token endpoint
  ├── Small bounded processing Functions
  └── Authenticated result download

Private Object Storage
  └── input/output job artifacts (TTL)

Persistent Database
  └── jobs, inputs, outputs, cleanup state, user ownership
```

Scale-out:

```text
Vercel App/API
      ↓ enqueue
Durable Queue / Workflow
      ↓
Dedicated Node Worker (container/server)
      ↓
Shared Private Object Storage + Database
```

Worker phải có thể chạy cùng operation engine package; không copy/paste engine sang project khác.

## 8.7. Vercel plan caveat

- Cron frequency và function duration phụ thuộc plan.
- Hobby Cron tối đa daily; không thiết kế cleanup dựa vào lịch mỗi 5 phút nếu dùng Hobby.
- Trigger cleanup khi job complete/user deletes và khi user mở Activity/cleanup endpoint (rate limited); Cron chỉ là backstop phù hợp với plan.
- Kiểm tra Vercel Blob pricing/Private Beta/SDK requirements trước khi bật production.
- Không khẳng định toàn bộ OCR/AI/PDF processing “free trên Vercel”; usage, compute, storage và data transfer có chi phí/limits.

---

# 9. Persistent Job Management

## 9.1. Vì sao cần persistent job store

Extraction job hiện tại có thể dùng in-memory state. Cách này không đủ cho cloud production vì Function instance có thể cold start, scale, recycle hoặc request tiếp theo đi vào instance khác.

Cloud job state phải lưu trong database bền vững. Local/Electron có thể dùng database local hiện có hoặc SQLite/JSON repository chỉ sau khi audit persistence hiện tại; không bắt buộc thêm DB cloud vào desktop nếu có giải pháp ổn định sẵn.

Không dùng Redis chỉ vì cần job state nếu database hiện có đã đáp ứng. Queue và database có nhiệm vụ khác nhau:

- Database = nguồn sự thật về job/artifact.
- Queue = vận chuyển công việc và retry/delivery.
- Object Storage = nội dung file.
- `/tmp` = scratch trong lúc xử lý.

## 9.2. Job state machine

Đề xuất:

```text
created
  ↓
uploading
  ↓
queued
  ↓
running
  ↓
publishing
  ↓
completed
```

Nhánh khác:

```text
uploading → failed
queued → cancelled
running → cancel_requested → cancelled
running → partial
running → failed
completed → expired
failed → retrying → queued
```

Không thêm trạng thái chỉ để làm UI phức tạp. State transitions phải server-owned, validated và audit được.

## 9.3. Job record (logical model)

```ts
interface DocumentJobRecord {
  id: string
  ownerId: string
  tenantId?: string
  operationId: string
  operationVersion: string
  status: DocumentJobStatus
  runtime: 'local' | 'electron' | 'vercel' | 'worker'
  configSnapshot: Record<string, unknown>
  inputCount: number
  totalInputBytes: number
  outputCount: number
  progress: {
    totalUnits: number
    completedUnits: number
    failedUnits: number
    currentLabel?: string
  }
  errorCode?: string
  errorMessageSafe?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  expiresAt: string
  cleanupStatus: 'pending' | 'partial' | 'completed' | 'failed'
}
```

Không lưu secret, API key, raw content hoặc absolute local path vào cloud job record.

## 9.4. Input record

```ts
interface DocumentJobInputRecord {
  id: string
  jobId: string
  ownerId: string
  originalName: string
  safeName: string
  mimeType: string
  extension: string
  size: number
  checksum?: string
  storageProvider: string
  storageKey: string
  status: 'pending' | 'uploaded' | 'verified' | 'staged' | 'failed' | 'deleted'
  createdAt: string
  expiresAt: string
}
```

Storage key chỉ server sử dụng; API public không trả token/path cần thiết để truy cập object trái phép.

## 9.5. Artifact record

```ts
interface DocumentArtifactRecord {
  id: string
  jobId: string
  ownerId: string
  fileName: string
  mimeType: string
  size: number
  checksum?: string
  storageProvider: string
  storageKey: string
  status: 'publishing' | 'ready' | 'downloaded' | 'deleted' | 'expired'
  downloadCount: number
  firstDownloadedAt?: string
  lastDownloadedAt?: string
  createdAt: string
  expiresAt: string
}
```

Download không được tự động xóa artifact ngay sau GET. Browser có thể retry, resume hoặc tải lại. Xóa theo retention hoặc explicit user action.

## 9.6. Job repository

```ts
interface DocumentJobRepository {
  createJob(input: CreateDocumentJobInput): Promise<DocumentJobRecord>
  getJob(jobId: string, ownerId: string): Promise<DocumentJobRecord | null>
  updateStatus(jobId: string, transition: JobTransition): Promise<void>
  updateProgress(jobId: string, progress: JobProgress): Promise<void>
  addInput(input: DocumentJobInputRecord): Promise<void>
  addArtifact(artifact: DocumentArtifactRecord): Promise<void>
  listJobs(query: JobListQuery): Promise<DocumentJobRecord[]>
  findExpired(before: Date, limit: number): Promise<ExpiredJobCandidate[]>
}
```

Mọi query theo job/artifact phải scope theo authenticated `ownerId`/tenant. Không tin ownerId do client gửi.

## 9.7. Concurrency, leases và idempotency

- Mỗi job có execution lease/lock có expiry.
- Worker chỉ claim job nếu trạng thái cho phép và lease được acquire.
- Queue delivery có thể at-least-once: executor phải idempotent.
- Mỗi execution step có idempotency key.
- Không publish trùng artifact khi worker retry.
- Nếu publish lại cùng artifact, dùng stable artifact ID hoặc tạo version mới có chủ đích.
- Retry chỉ với transient errors; validation/unsupported errors không retry tự động.
- Retry có exponential backoff + jitter và max attempts.
- Cancellation là cooperative; operation engine phải check AbortSignal giữa units/pages.

## 9.8. Database strategy

- Ưu tiên database bền vững hiện có trong app/organization sau khi audit.
- Nếu chưa có DB phù hợp cho cloud job metadata, thêm một Postgres-compatible database/service được chọn có chủ đích.
- Không tạo một DB riêng cho desktop nếu không cần.
- Không lấy TM Hub làm nơi lưu document binary; TM Hub tiếp tục là Control Plane/Auth/AI Relay theo kiến trúc hiện tại.
- Nếu muốn reuse auth identity từ TM Hub, chỉ dùng stable user/tenant claims qua cơ chế auth đang có; Document Studio vẫn quản lý job/artifact metadata riêng.
- Database schema/migration phải versioned, index expiry/status/owner và có tests.

---

# 10. Cleanup, Retention & Privacy

## 10.1. Dữ liệu nào cần dọn?

| Data | Local/Electron | Vercel Cloud |
|---|---|---|
| Request upload buffer | Release sau stage | Không proxy file lớn; direct upload |
| Job input staging | Xóa sau job/TTL | Private Blob input xóa sau job/retention |
| `/tmp` input | Xóa trong finally | Xóa trong finally, không persistent |
| Intermediate files | Xóa sau publish | Xóa trong finally |
| Output temp | Xóa sau publish/save | Xóa trong finally |
| Published result | Lưu vào output hoặc user Save As | Private Blob TTL / explicit delete |
| Job metadata | Giữ history theo policy | Giữ history theo policy |
| Logs | Metadata-only, rotate | Metadata-only, retention |

## 10.2. Retention policy – default ban đầu đề xuất

Các giá trị dưới đây là defaults cấu hình, không phải hằng số bắt buộc:

| Item | Local | Cloud |
|---|---|---|
| Job temp | Cleanup sau khi kết thúc | `/tmp` cleanup ngay trong invocation |
| Orphan temp | Startup janitor, ví dụ >24h | Không dựa vào instance reuse |
| Input staging | Dọn khi không còn retry cần thiết | Dọn sau completed + short retry window hoặc TTL |
| Published output | Giữ trong output cho đến user xóa | Giữ mặc định 24h; config được |
| Job metadata | Giữ history dài hơn result | Ví dụ 7–30 ngày theo policy |
| Upload draft chưa finalize | Ví dụ 1h | Ví dụ 1h |

Không xóa result chỉ vì user đã bấm Download một lần. User có thể tải lại đến khi hết TTL hoặc xóa chủ động.

## 10.3. Immediate cleanup

Mỗi operation/job phải thực hiện:

```ts
let workspace: TempJobWorkspace | undefined

try {
  workspace = await tempProvider.create(jobId)
  // stage, process, validate, publish
} catch (error) {
  // record safe failure metadata
  throw error
} finally {
  if (workspace) {
    await workspace.cleanup().catch((cleanupError) => {
      // log cleanup failure; do not overwrite original job failure
    })
  }
}
```

Không để cleanup error che mất processing error gốc. Ghi `cleanupStatus` để janitor xử lý lại khi cần.

## 10.4. Orphan cleanup / janitor

- Local: chạy lúc app/server startup và định kỳ trong local runtime; chỉ xóa job temp không active và quá TTL.
- Vercel: dùng database expiry scan + deletion worker/cron/schedule. Cron chỉ là backstop; không phụ thuộc Cron để đảm bảo `/tmp` cleanup.
- Hobby Cron theo docs hiện tại có lịch tối thiểu một lần mỗi ngày, vì vậy thiết kế cleanup phải chấp nhận độ trễ và có lazy cleanup/event cleanup.
- Cleanup endpoint phải được bảo vệ bằng secret/internal auth, không public cho user tùy ý gọi.
- Mỗi batch cleanup giới hạn số job/object để tránh timeout.
- Delete idempotent: object đã xóa không làm cleanup thất bại toàn bộ.
- Ghi audit counters: scanned, deleted, skipped-active, failed.

## 10.5. Download retention behavior

- Job result UI hiển thị thời gian hết hạn.
- Có Download lại cho tới `expiresAt`.
- Có Delete Now.
- Khi result hết hạn, file content bị xóa; job summary có thể giữ theo history retention.
- Download route xác thực user + artifact ownership.
- `Content-Disposition` phải sanitize filename.
- Dùng `Cache-Control: private, no-store` hoặc policy thích hợp cho sensitive docs.
- Không trả URL công khai tồn tại vô thời hạn.

## 10.6. Privacy notice

Web phải nói rõ file được upload lên cloud để xử lý; hiển thị retention và nơi lưu. Không đánh lừa user rằng file chỉ rời khỏi máy trong thời gian cực ngắn nếu file thực tế vẫn được lưu trên Blob tới khi hết TTL.

Local/Electron phải nói rõ input use-once được copy vào temp local, kết quả lưu tại output/địa chỉ user chọn, và temp sẽ được dọn.

---

# 11. Operation Registry & Operation Framework

## 11.1. Registry là metadata nghiệp vụ, không phải filesystem mapping

Operation Registry mô tả:

- Operation ID/version.
- Label/description/icon/category.
- Accepted input formats.
- Input mode/cardinality/order constraints.
- Config schema and defaults.
- Validation rules.
- Output artifact expectations.
- Resource profile/execution mode.
- Capabilities: progress, cancel, preview, batch, partial results.
- UI form component key (safe allowlist; không dynamic import arbitrary path từ server data).

Server Output Mapping/Storage Provider vẫn là nguồn sự thật về storage destination. Không cho Operation Registry frontend quyết định `path.join`.

## 11.2. Suggested metadata type

```ts
interface OperationDefinition {
  id: string
  version: string
  category: 'pdf' | 'convert' | 'image' | 'ocr' | 'extract' | 'export'
  title: string
  description: string
  icon: string
  enabled: boolean
  input: {
    mode: 'single-file' | 'multi-file' | 'folder-batch'
    acceptedExtensions: string[]
    acceptedMimeTypes: string[]
    minFiles: number
    maxFiles: number
    ordered?: boolean
    allowFromInputLibrary: boolean
  }
  configuration: {
    schemaId?: string
    componentKey: string
    hasAdvancedOptions: boolean
  }
  output: {
    artifactMode: 'single' | 'multiple' | 'archive' | 'variable'
    defaultFileNamePattern?: string
    mimeTypes: string[]
  }
  execution: {
    mode: 'inline' | 'async-function' | 'durable-workflow' | 'external-worker'
    supportsProgress: boolean
    supportsCancel: boolean
    supportsPartial: boolean
    resourceProfile: string
  }
}
```

Không bắt buộc dùng toàn bộ fields nếu engine hiện chưa support. Ưu tiên typed schema, không tạo generic metadata framework quá mức.

## 11.3. Operation execution adapter

```ts
interface DocumentOperationExecutor<TConfig = unknown> {
  validateInputs(inputs: VerifiedInput[], config: TConfig): Promise<ValidationResult>
  estimate?(inputs: VerifiedInput[], config: TConfig): Promise<OperationEstimate>
  execute(context: OperationExecutionContext, config: TConfig): Promise<OperationExecutionResult>
}
```

- Parse config bằng Zod/server schema.
- Re-validate input server-side.
- Không tin client MIME/size/name.
- Operation engine chỉ nhận staged paths từ Temp Provider, không nhận raw path request.
- Validate output files (non-empty, expected extension/magic, size, count).
- Publish output chỉ sau validation.

## 11.4. Operation configuration UX

- Common options (output location, overwrite, job label) dùng shared UI.
- Options riêng của operation nằm trong form component riêng.
- Basic options hiển thị mặc định; advanced options đóng mặc định.
- Không hiển thị field không liên quan.
- Config phải snapshot vào job khi start để retry/resume không đổi logic bất ngờ.
- Model/preset/schema IDs phải snapshot version hoặc immutable values theo current architecture.

## 11.5. Initial operations to migrate

| ID | Tool | Input | Output |
|---|---|---|---|
| `pdf.split` | Split PDF | One PDF | Multiple PDF artifacts or ZIP |
| `pdf.merge` | Multiple ordered PDFs or supported page folder | One PDF |
| `pdf.rasterize` | One PDF | Image artifacts / ZIP |
| `pdf.images-to-pdf` | Ordered images | One PDF |
| `document.convert-to-pdf` | One supported Office/input document | One PDF |
| `pdf.export` | One PDF | One/multiple export artifacts |
| `document.ai-extract` | One or more PDFs only if engine supports | Structured artifacts |

Do not claim multi-file support for existing engines until implementation and tests prove it. Initially preserve existing engine cardinality, then expand deliberately.

Future operations (Compress, Rotate, Organize, OCR, Table Extraction, Form Extraction, Validation) must be registered only when implementation exists.

---

# 12. API Design – new unified Document API + legacy compatibility

## 12.1. Principles

- Follow current Nuxt/Nitro route conventions.
- Reuse auth middleware, `runPdf` error conventions or generalized error handling if current structure supports it.
- New public routes should not accept absolute paths.
- Use job ID, input ID, artifact ID and safe references.
- Scope all reads/writes by authenticated owner/tenant.
- Do not expose private storage keys/token unnecessarily.
- Keep `/api/v1/pdf/*` legacy routes available during migration; do not delete before all pages and consumers move.

## 12.2. Suggested API endpoints

Exact route naming must match repository convention; endpoints below are logical contract.

### Operations

```text
GET  /api/v1/documents/operations
GET  /api/v1/documents/operations/:operationId
POST /api/v1/documents/operations/:operationId/validate
```

Returns client-safe operation definitions, allowed input count/types and runtime availability. Does not return storage secrets.

### Job lifecycle

```text
POST   /api/v1/documents/jobs
GET    /api/v1/documents/jobs
GET    /api/v1/documents/jobs/:jobId
POST   /api/v1/documents/jobs/:jobId/start
POST   /api/v1/documents/jobs/:jobId/cancel
POST   /api/v1/documents/jobs/:jobId/retry
DELETE /api/v1/documents/jobs/:jobId
```

### Input upload

```text
POST /api/v1/documents/jobs/:jobId/upload-targets
POST /api/v1/documents/jobs/:jobId/finalize-upload
DELETE /api/v1/documents/jobs/:jobId/inputs/:inputId
```

Provider-specific client upload callback route may be separate.

### Result artifacts

```text
GET    /api/v1/documents/jobs/:jobId/artifacts
GET    /api/v1/documents/jobs/:jobId/artifacts/:artifactId
GET    /api/v1/documents/jobs/:jobId/artifacts/:artifactId/download
DELETE /api/v1/documents/jobs/:jobId/artifacts/:artifactId
POST   /api/v1/documents/jobs/:jobId/artifacts/archive
```

### Defaults/settings

```text
GET   /api/v1/documents/settings
PATCH /api/v1/documents/settings
```

Store per-runtime/user defaults only when safe. Do not persist browser FileSystem handles in cloud DB.

### Internal cleanup/worker routes

```text
POST /api/internal/documents/cleanup
POST /api/internal/documents/workers/claim
POST /api/internal/documents/workers/:jobId/heartbeat
POST /api/internal/documents/workers/:jobId/complete
POST /api/internal/documents/workers/:jobId/fail
```

These routes must not be public unauthenticated endpoints. Prefer signed queue callbacks/private networking/provider SDK if available.

## 12.3. API response contracts

Use common response shape if current project convention permits:

```ts
interface ApiSuccess<T> {
  ok: true
  data: T
  requestId: string
}

interface ApiFailure {
  ok: false
  error: {
    code: string
    message: string
    retryable: boolean
    details?: Record<string, unknown>
  }
  requestId: string
}
```

Do not leak stack traces, local paths, Blob tokens, database errors or secrets.

## 12.4. Error code families

Reuse current codes where semantics match. New code family may include:

- `DOCUMENT_INPUT_REQUIRED`
- `DOCUMENT_INPUT_COUNT_INVALID`
- `DOCUMENT_INPUT_TYPE_NOT_SUPPORTED`
- `DOCUMENT_INPUT_TOO_LARGE`
- `DOCUMENT_TOTAL_SIZE_EXCEEDED`
- `DOCUMENT_UPLOAD_INCOMPLETE`
- `DOCUMENT_UPLOAD_EXPIRED`
- `DOCUMENT_JOB_NOT_FOUND`
- `DOCUMENT_JOB_NOT_OWNED`
- `DOCUMENT_JOB_STATE_INVALID`
- `DOCUMENT_JOB_ALREADY_RUNNING`
- `DOCUMENT_OUTPUT_NOT_READY`
- `DOCUMENT_OUTPUT_EXPIRED`
- `DOCUMENT_OUTPUT_TOO_LARGE`
- `DOCUMENT_STORAGE_UNAVAILABLE`
- `DOCUMENT_TEMP_CAPACITY_EXCEEDED`
- `DOCUMENT_RUNTIME_NOT_SUPPORTED`
- `DOCUMENT_OPERATION_NOT_SUPPORTED`
- `DOCUMENT_PROCESSING_TIMEOUT`
- `DOCUMENT_CLEANUP_FAILED`

Each server code must map to an HTTP status, typed client handling and i18n in all supported locales.

---

# 13. Operation UI Specifications

## 13.1. Home

- Searchable tool cards.
- Group tools by outcome/category.
- Recent jobs only from persistent repository.
- Show active jobs and actions.
- Do not show legacy area tree.

## 13.2. Split PDF

Choose:
- Accept one PDF initially, unless existing engine already supports batch safely.
- Validate magic bytes and page count.
- Show selected file row and optional preview.

Process:
- Default: split all pages.
- Advanced: page range/odd-even only if backend supports; do not present fake options.
- Config output naming.

Save:
- Default output folder locally.
- Browser download / Save As on web.
- Multiple page files default to ZIP for cloud/web.

## 13.3. Merge PDF

Choose:
- Multi-file picker or operation-specific page-folder selection if existing feature depends on split output.
- Display ordered list.
- Reorder by drag handle only in selected-file list (not folder tree).
- Validate all PDFs and page count.

Process:
- Show merge order.
- Optional page rotation/append settings only if implemented.

Save:
- One merged PDF, Save As/output default.

Preserve current merge behavior during first migration. Do not silently replace folder-based merge semantics without regression/compatibility plan.

## 13.4. PDF to Images

Choose one/multiple PDF only if engine supports.

Process:
- DPI/scale.
- Output image format only if supported by engine.
- Page range only if supported.
- Show estimated number of pages/artifacts when metadata available.

Save:
- Multiple images: ZIP by default on Web; local may save into chosen folder if capability supported.

## 13.5. Images to PDF

Choose:
- Multiple images.
- Display thumbnails and order.
- Reorder by drag-and-drop.
- Validate image types and total decoded pixel budget.

Process:
- Page size/orientation/margins only if engine supports.

Save:
- One PDF.

## 13.6. Convert Documents

Choose:
- Accept only formats current backend supports.
- Detect extension and content signature.

Process:
- Show conversion limitations (font/layout/table/image fidelity) where relevant.
- Do not promise lossless Office conversion unless actual engine guarantees it.

Save:
- One PDF or supported output; destination via Output Adapter.

## 13.7. Export PDF

Choose one PDF initially if current endpoint requires one.

Process:
- Format picker.
- Format-specific options.
- Warning for layout/font fidelity where appropriate.

Save:
- One or multiple artifacts; zip when multiple and web fallback.

## 13.8. AI Extraction

Choose:
- PDF input as currently supported; multiple only after engine supports.

Process:
- AI connection/model via current TM Hub AI Relay catalog.
- Preset, description, sample.
- Schema version.
- Output formats.
- Preview/calibration before large batch when practical.
- Page selection only if engine supports.
- Explain usage/estimated pages.

Execution:
- Persist job state in DB/repository in cloud.
- Preserve current checkpoint/resume implementation until robust fingerprinting exists.
- Checkpoint key must eventually include source hash + operation version + schema/preset/model/config fingerprint; do not reuse stale checkpoint after material config changes.
- Do not silently fall back to wrong category/price/data if extraction is uncertain.

Result:
- List structured artifacts.
- Preview supported formats.
- Download individual files or ZIP.
- Allow review status if review module exists.

AI calls must continue through TM Hub relay. Do not store provider API keys in Document Studio.

## 13.9. OCR / Table / Review – future

Build separate operation pages sharing the same Choose/Process/Save shell:

- OCR: source preview + OCR config + recognized text/artifacts.
- Table Extraction: PDF/table preview + extracted grid + validation.
- Form Extraction: detected fields + structured JSON.
- Validation/Review: editable grid, source traceability, approval/reject.

Do not put future tools in active navigation until implemented.

---

# 14. Component Architecture

## 14.1. Audit and reuse current components

Audit `app/components/pdf/**` first. Candidate roles reported in v2/v3 include `FileBrowser.vue`, `FileRow.vue`, `FileActions.vue`, `PreviewFile.vue`, `PreviewTable.vue`, `PreviewText.vue`, `ExportFormatPicker.vue`, `PresetSampleEditor.vue` and dialogs. Verify current code.

The previous components `WorkspaceShell`, `FolderTree`, `HeTreeMenu` may no longer be used in the primary processing flow. Do not force their reuse if the tree UI is removed. They may remain temporarily for legacy Library or be archived/deleted only after no remaining consumers and tests confirm.

## 14.2. Suggested component map

```text
app/components/document-studio/
├── layout/
│   ├── OperationPageShell.vue
│   └── OperationStepHeader.vue
├── input/
│   ├── DocumentDropzone.vue
│   ├── DocumentFilePicker.vue
│   ├── SelectedDocumentList.vue
│   ├── SelectedDocumentRow.vue
│   ├── DocumentValidationMessage.vue
│   └── OperationInputPicker.vue       # when required
├── output/
│   ├── OutputDestinationPicker.vue
│   ├── OutputDestinationSummary.vue
│   ├── ResultArtifactList.vue
│   └── ResultArtifactRow.vue
├── operation/
│   ├── OperationCard.vue
│   ├── OperationSearch.vue
│   ├── OperationConfigSection.vue
│   └── OperationAdvancedOptions.vue
├── jobs/
│   ├── JobProgressPanel.vue
│   ├── JobStatusBadge.vue
│   ├── JobResultSummary.vue
│   └── JobActivityList.vue
└── viewer/
    └── (reuse current viewer; add type-specific renderer only as needed)
```

This is a target organization, not a mandate to move every existing component. Follow current naming conventions and avoid component churn without value.

## 14.3. Shared composables/services

```text
app/composables/document/
├── useDocumentFiles.ts
├── useDocumentOperation.ts
├── useDocumentUpload.ts
├── useDocumentOutput.ts
├── useDocumentJob.ts
├── useDocumentRuntime.ts
└── useDocumentPreview.ts
```

Responsibilities:

- `useDocumentFiles`: selected File objects, validation, remove/reorder.
- `useDocumentOperation`: operation metadata/config and validation state.
- `useDocumentUpload`: upload flow, progress, retry/cancel.
- `useDocumentOutput`: destination choice and save/download behavior.
- `useDocumentJob`: start, poll, cancel, retry, status.
- `useDocumentRuntime`: runtime capability facade.
- `useDocumentPreview`: preview state/window integration.

Avoid a single giant Pinia store. Use local page state unless cross-page persistence/share is necessary.

## 14.4. Component boundaries

Presentation components:
- Receive typed props.
- Emit user events.
- Do not call filesystem or provider SDK.

Composables/application services:
- Call typed API and runtime adapters.
- Manage lifecycle and state.

Nitro modules:
- Authentication/authorization.
- Job repository.
- Storage and temp provider.
- Operation executor.
- Publish/cleanup.

Electron preload:
- Minimal native picker/save capabilities only.
- No generic filesystem methods.

## 14.5. Design system

- Reuse TM Tools current UI library/tokens.
- Keep current theme, typography and icon system unless product owner approves a redesign.
- Use clear primary CTA, readable labels and short descriptions.
- Keep Advanced Options collapsed by default.
- Avoid multi-column dense technical panels for simple tasks.
- Provide loading, empty, validation, failed, cancelled, complete and expired states.
- Support keyboard focus and accessible labels.
- Ensure layout works at Electron target window dimensions and web responsive breakpoints.

---

# 15. Electron Native File Capability – security boundary

## 15.1. Do not expose arbitrary filesystem API

Allowed narrowly scoped capabilities may include:

- `selectInputFiles` (only if HTML file picker is insufficient).
- `showSaveDialog`.
- `selectOutputDirectory` (only if batch folder export is implemented).
- `savePublishedArtifact` or `savePublishedArtifacts` using job/artifact IDs.
- `revealSavedFile` for a file path created by the app, not arbitrary shell input.

Never expose:

- `readFile(path)` generic API.
- `writeFile(path, data)` generic API.
- `delete(path)` generic API.
- arbitrary `openPath` from renderer.
- shell execution.
- arbitrary filesystem traversal.

## 15.2. IPC payload rules

- Use allowlist in existing `electron/ipcPolicy.cjs` / preload architecture.
- Validate all input schemas on Main Process.
- Native dialog must be initiated by a user gesture.
- Main keeps native absolute paths private.
- Renderer receives safe result or opaque ID only.
- If Main writes artifacts into chosen directory, accept only jobId/artifactIds generated by server, not arbitrary content/path.
- Validate user chose the destination directory; prevent path traversal in artifact file names.
- Use atomic writes (`.partial` then rename) where feasible.
- Handle disk full, permission denied, duplicate names and interrupted downloads.

The existing “no PDF IPC” rule from v2 applied to moving PDF filesystem ownership into Electron. V4 may add narrowly scoped desktop file-picker/save bridge if required, but **Nitro/processing layer remains the owner of operation execution and local job storage**. Do not introduce a second PDF engine in Main.

---

# 16. Security & Validation

## 16.1. Authentication and ownership

- Every cloud job belongs to authenticated user/tenant.
- `ownerId` comes from authenticated session/claims, never request body.
- Check ownership on every job, input, artifact, download and delete endpoint.
- Admin/support access must be an explicit RBAC permission and audit logged.
- Do not let a guessed job ID expose another user's files.

## 16.2. Upload validation

Validate both client metadata and server content:

- Extension allowlist per operation.
- MIME allowlist.
- Magic bytes/file signature where possible.
- File non-empty.
- Max file size, count and total job size.
- Max pages/document count.
- Archive recursion/decompression limits if ZIP input supported.
- Image dimension/pixel limits to prevent decompression bombs.
- PDF page count and malformed/encrypted PDF behavior.
- Reject path-like filenames and sanitize display/download name.
- Do not execute macros, embedded scripts or arbitrary file content.

MIME and extension are not proof of file content.

## 16.3. Temp/storage isolation

- Every job has a unique root/key prefix.
- Different users/jobs cannot address each other's temp/object keys.
- Object keys are server generated.
- Local temp path is resolved under an application-owned temp root.
- Prevent symlink/junction escape when staging/cleanup.
- Do not trust user-supplied absolute paths.
- Cleanup only paths whose realpath is inside the job temp root.

## 16.4. Resource exhaustion controls

- Rate limit job creation and token generation.
- Per-user concurrent job limit.
- Per-user storage quota.
- Per-job input count/bytes/temp bytes/output bytes/duration/page count.
- Limit AI provider calls/pages and retries.
- Backpressure/queue for expensive operations.
- Reject unsupported size rather than crash process.
- Monitor memory and temp disk usage.

## 16.5. Secrets

- Vercel Blob read/write token server-only.
- Database URL server-only.
- TM Hub credentials remain server-side.
- Client upload token is restricted, short lived and scoped.
- Never log auth headers, API keys, document body/text or sensitive metadata.

## 16.6. Malware scanning

MVP must at least validate types/signatures and limits. If public multi-user deployment accepts untrusted documents at scale, evaluate malware scanning/quarantine before enabling broad upload. Do not execute embedded active content during preview/conversion.

---

# 17. Error Handling, Progress and Results

## 17.1. User-facing errors

Use clear messages:

- “This file type is not supported by this tool.”
- “The selected files exceed the current size limit.”
- “Upload was interrupted. Retry this file.”
- “The document could not be processed. Your original file was not changed.”
- “The result expired. Run the operation again.”
- “The selected output location is not writable.”

Do not show raw stack trace, local absolute server path or provider internals.

## 17.2. Progress model

For simple synchronous operation:
- Loading state and completion response.
- Do not fake percent if engine cannot report true progress.

For async operation:
- Queued / Uploading / Processing / Publishing / Complete.
- Numeric progress only if meaningful.
- Page/file counters where available.
- Current stage label.
- Cancel only if executor/provider supports cooperative cancellation.
- Poll with backoff or use existing realtime mechanism if already present.

## 17.3. Result summary

Common result presentation:

- Status: Completed / Partial / Failed.
- Input count.
- Output artifact count.
- Processing summary.
- Warnings/errors by file/page when supported.
- Output artifact rows.
- Download all as ZIP if multiple.
- Save As / Save to default output.
- Preview/open.
- Expiration time on cloud.
- Delete now.

## 17.4. Partial success

Some batch jobs may complete a subset of inputs. Use `partial` only if artifacts are valid and the operation contract allows partial results. Show successes and failures explicitly; do not report total success if one file failed.

---

# 18. Build & Deploy on Vercel

## 18.1. Build strategy

- Keep one codebase and lockfile.
- Keep Nuxt/Nitro unless audit proves incompatible.
- Determine Vercel adapter/preset from current project configuration and supported Nitro/Vercel integration version; do not guess or replace it without checking official compatibility.
- Keep Electron build scripts separate from Vercel deployment scripts.
- Ensure cloud build excludes local user data and dev temp directories.
- Ensure server-only dependencies are not imported into client bundle.
- Check external/native dependency packaging and fonts.
- Add a CI job that runs typecheck/lint/unit/integration/build for local and Vercel target.

## 18.2. Vercel environment variables – logical list

Names must match app conventions after audit. Suggested categories:

```env
DOCUMENT_RUNTIME=vercel
DOCUMENT_STORAGE_PROVIDER=vercel-blob
DOCUMENT_TEMP_PROVIDER=vercel-function-tmp
DOCUMENT_JOB_REPOSITORY=postgres

BLOB_READ_WRITE_TOKEN=...       # server only
DATABASE_URL=...                # server only

DOCUMENT_MAX_FILE_BYTES=...
DOCUMENT_MAX_JOB_BYTES=...
DOCUMENT_MAX_TEMP_BYTES=...
DOCUMENT_OUTPUT_RETENTION_HOURS=24
DOCUMENT_INPUT_RETENTION_MINUTES=60
DOCUMENT_JOB_HISTORY_DAYS=14
```

Do not commit `.env` or secrets. Vercel project must have Production/Preview/Development environment values explicitly configured. Use separate stores/prefix namespaces for Preview and Production.

## 18.3. Vercel storage setup

If Vercel Blob Private chosen:

1. Create a Private Blob store.
2. Add server-side read/write token to required Vercel environments.
3. Install a compatible `@vercel/blob` SDK version based on current official docs; Private Storage docs at time of research specify a minimum version. Verify latest before install.
4. Implement authenticated client upload token route.
5. Implement server-side private download route/stream.
6. Test ownership checks, token scope, object deletion and expiration.
7. Benchmark file sizes and transfer charges.

If Private Blob limits/costs don't fit, select S3-compatible provider through same interface.

## 18.4. Database setup

- Use existing DB if fit.
- Cloud job metadata must be persistent.
- Add migrations/indexes for ownerId/status/expiresAt/jobId/artifactId.
- Ensure transactions or compare-and-swap for job transitions/leases.
- Local/Electron may use local adapter, but cloud may not use JSON files in deployment as a DB.

## 18.5. Vercel Cron/Schedules

- Use scheduled cleanup as backstop only.
- Verify current plan limits: docs currently indicate Hobby Cron once per day; Pro/Enterprise can run per minute.
- If the required cleanup interval is shorter than Hobby supports, use event-driven deletion/TTL provider feature or another scheduler; do not assume an hourly Cron works on Hobby.
- Cleanup route must verify `CRON_SECRET` or equivalent.
- Make cleanup idempotent and bounded.

## 18.6. Vercel Queues/Workflows

- Keep queue provider behind `DocumentQueue`/`WorkflowAdapter`.
- Vercel Queues and Workflows have current plan/feature status that may change; check documentation and pricing before implementation.
- Queues provide durable message delivery and can redeliver; handlers must be idempotent.
- Workflow is appropriate for multi-step durable pipelines; don't use it for every tiny operation.
- For a first implementation, use only if cloud jobs require background reliability; otherwise start with bounded Functions and persistent job metadata.
- Provide a worker fallback for operations exceeding Vercel runtime limits.

## 18.7. External Worker compatibility

Worker service receives only job references, not raw client absolute paths:

```json
{
  "jobId": "...",
  "operationId": "pdf.split",
  "attempt": 1
}
```

Worker obtains input from authenticated private object storage, stages locally, executes shared engine, publishes output, updates repository and cleans scratch. It must not depend on Vercel Function `/tmp` or in-memory state.

---

# 19. Legacy Data & API Migration

## 19.1. Existing v3 folders must be preserved

Existing data may include:

```text
.data/pdf/
├── sources/
├── inputs/
├── word/
├── split/
├── images/
├── merged/
├── products/
├── office/
├── checkpoints/
├── .trash/
└── audit.jsonl
```

V4 target is simpler:

```text
<documentDataRoot>/
├── input/
├── output/
└── .system/
```

But **do not rename/delete old data at first startup**.

## 19.2. Migration strategy

Phase migration:

1. Inventory legacy files and estimate storage.
2. Backup/manifest existing structure.
3. Keep old directories read-only during first v4 deployment if necessary.
4. Add import/migration action to move/copy legacy reusable inputs into new `input/` only when user chooses or when migration policy is explicit.
5. Existing completed outputs may be copied into `output/` only if safe and not duplicated.
6. Keep original legacy locations until parity and verification.
7. Update API references/metadata.
8. Provide rollback plan.
9. Remove old area folders only in a separate release after confirmation, backup and no remaining references.

Do not blindly merge `sources/` and `inputs/` contents. Do not treat `word/` read-only legacy data as writable without an explicit policy decision.

## 19.3. Legacy API compatibility

- Keep `/api/v1/pdf/*` routes while old pages, viewer and extraction workflows still call them.
- Add new `/api/v1/documents/*` API facade for new operations/jobs/storage.
- New facade can call existing PDF modules internally.
- Do not duplicate PDF algorithms.
- Migrate one operation at a time.
- Once no consumers remain and tests pass, deprecate legacy endpoints in a later cleanup release.

## 19.4. Compatibility adapter for current engines

Some existing engines may expect `area + fileName` rather than staged absolute file path. Do not let new UI depend on that old storage model.

Create a server-only adapter that:

- Accepts verified staged input from new job service.
- Provides the engine's expected input abstraction or safely stages into a temporary compatibility area.
- Calls existing engine without changing algorithm initially.
- Captures output into job temp.
- Publishes via new storage provider.

Refactor engine path dependencies gradually. All absolute paths remain server-side.

---

# 20. Observability & Audit

Record safe metadata events:

- `job-created`
- `upload-started`
- `upload-completed`
- `upload-rejected`
- `job-queued`
- `job-started`
- `job-progress`
- `job-completed`
- `job-partial`
- `job-failed`
- `job-cancelled`
- `artifact-published`
- `artifact-downloaded`
- `artifact-deleted`
- `cleanup-started`
- `cleanup-completed`
- `cleanup-failed`

Log:
- requestId, jobId, operationId, ownerId/tenantId (subject to privacy policy), runtime, size/count, durations, safe error code.

Do not log:
- document text/body.
- full private object URL/token.
- API keys or cookies.
- arbitrary local absolute paths in cloud logs.

Metrics:
- upload bytes/time/failures.
- processing duration by operation.
- temp peak bytes.
- output bytes.
- job queue age.
- retry count.
- cleanup delay/orphan count.
- storage usage per owner/tenant.

---

# 21. Testing Strategy & Acceptance Criteria

## 21.1. Unit tests

- Operation Registry validation.
- Input mode/cardinality validation.
- File type/signature validation.
- Safe filename generation.
- Output naming/collision policy.
- Job state transition rules.
- Job ownership checks.
- Idempotency/lease logic.
- Retention/expiry calculations.
- Storage provider mapping.
- Temp cleanup containment/path safety.

## 21.2. Integration tests – local

- Select one file from outside app workspace.
- Process as use-once without copying into input library.
- Import a copy into `input/` only when explicitly requested.
- Process output into default `output/`.
- Save result to another local location through supported adapter.
- Handle duplicate output name.
- Handle disk full/permission denied.
- Kill/restart app and clean orphan temp safely.
- Verify original source unchanged.

## 21.3. Integration tests – Vercel/cloud

- Authenticated create job.
- Unauthorized token request rejected.
- Direct upload with allowed type/size.
- Oversized upload rejected before processing.
- Upload callback/finalize verifies object belongs to job/user.
- Process using `/tmp` and publish output to private storage.
- A second Function invocation can read job status/artifacts from persistent DB/storage without relying on same instance.
- Private download requires authentication/ownership.
- Other user cannot read/delete artifact by changing job/artifact ID.
- Expired artifact download returns clear expired state.
- Cleanup handles missing/already-deleted object.
- Function termination leaves job recoverable and does not report false completion.
- Temp budget enforcement works.

## 21.4. Electron tests

- File picker can select files outside app data directory.
- Drag/drop works.
- File content is staged through safe API; no arbitrary path endpoint.
- Save As opens native dialog when adapter supports it.
- Batch output ZIP saves to user-selected location.
- Native bridge only exposes allowlisted operations.
- Renderer cannot call generic fs APIs.
- User cancels dialog; UI handles cancel without creating false failure.

## 21.5. UX regression tests

- User can identify tool from Home.
- No folder tree required to process a file.
- Input selection is clear.
- Selected list shows correct files and validation.
- Advanced options collapsed by default.
- Output destination and retention are clear.
- Progress and result are understandable.
- No operation creates duplicate file panels.
- Viewer opens and returns to operation without losing selection.
- Responsive layout works at target desktop/browser dimensions.

## 21.6. Existing feature regression

At minimum re-test:

- PDF import/upload.
- Split PDF.
- Merge PDF (including current folder-based workflow if still used).
- PDF to Images.
- Images to PDF.
- Office/Input to PDF.
- PDF export (all currently supported formats).
- AI Extraction.
- Model selector through TM Hub AI Relay.
- Presets/schema/sample.
- Existing checkpoint/resume semantics.
- Existing preview window and file renderers.
- Existing error codes/i18n.

## 21.7. Definition of Done

**Implementation status (2026-11-06):** phases 0–4 complete and verified;
phases 5–9 implemented in code with the caveats below. Evidence lives in
[`docs/document-studio/TEST-VERIFICATION.md`](../document-studio/TEST-VERIFICATION.md),
not in this checklist. A box below is only checked when a run in this workspace
proved it.

| Item | State | Note |
| --- | --- | --- |
| Operation Home without folder browsing | ✅ | `/document-studio` |
| Uniform input selection | ✅ | one `useDocumentFiles` for every tool |
| No tree required | ✅ | v4 pages have no tree |
| Picker + drag/drop from anywhere | ✅ (static) | interactions not visually verified |
| Use-once does not persist to the library | ✅ | spec `document_local_runtime` |
| Configurable default in/out dirs | ✅ | `PDF_DATA_DIR`, `TOOLS_DATA_DIR` |
| Choose another output location | ⚠️ local only | cloud always delivers by download |
| Web fallback download | ✅ | signed route / 302 |
| ZIP for multi-artifact output | ❌ | not implemented; artifacts download one by one |
| Cloud files private and owner-scoped | ✅ (unit) | no live bucket |
| `/tmp` scratch only | ✅ | `scratch.ts`, `mkdtemp` per invocation |
| Durable cloud job metadata | ✅ (unit) | Postgres repository never ran live |
| Large uploads bypass the Function | ✅ (unit) | presigned PUT / multipart intent |
| Cleanup on success/failure/cancel + orphans | ✅ | local janitor + cloud sweep |
| Cloud retention and delete | ✅ | `RETENTION-CLEANUP.md` |
| Engines reused, not duplicated | ✅ | executors call v3 engines |
| Legacy data preserved | ✅ | nothing moved or deleted |
| Vercel deploy smoke test | ❌ | **no Preview deployment was run** |
| Security: traversal, cross-user, public exposure | ✅ (unit + smoke) | foreign download → 404 |
| UI regression | ⚠️ | pages 200, no visual pass |

- [ ] User can start from operation Home without browsing internal folders.
- [ ] All operation pages use the same input selection model.
- [ ] No tree folder UI is required in normal processing flow.
- [ ] File picker and drag/drop support input from arbitrary user-accessible locations.
- [ ] Use-once does not silently persist user file into Input Library.
- [ ] Default local input/output directories are configurable and created safely.
- [ ] User can choose another output location where runtime supports it.
- [ ] Web fallback downloads correctly when browser save picker unsupported.
- [ ] Multi-artifact output can be downloaded as ZIP.
- [ ] Cloud files are private and scoped to user/job.
- [ ] Vercel `/tmp` is used only as scratch.
- [ ] Job metadata is durable in cloud.
- [ ] Uploads larger than Function payload limit bypass Function body via direct object storage upload.
- [ ] Job temp cleanup works on success/failure/cancel and orphan cleanup is available.
- [ ] Cloud result retention and delete behavior are clear.
- [ ] Existing engines are reused, not duplicated.
- [ ] Legacy data is preserved; migration is explicit and reversible.
- [ ] Vercel build/deploy smoke test passes with actual runtime dependencies.
- [ ] Security tests verify no path traversal, cross-user access or public artifact exposure.
- [ ] UI regression and existing PDF feature regression pass.

---

# 22. Implementation Roadmap – build in executable phases

## Phase 0 – Audit & feasibility (mandatory)

- Read v3 docs and repository.
- Map existing operations and current input/output assumptions.
- Verify all current Nuxt/Nitro/Electron/Vercel runtime details.
- Verify available database and auth identity.
- Verify current PDF/Office/image libraries and native dependencies.
- Record Vercel limits that affect actual operations.
- Build a capability matrix by operation/runtime.

**Exit:** audit report + operation matrix + no data changes.

## Phase 1 – Domain contracts & adapters

- Define `DocumentOperationDefinition`, `SelectedInputFile`, `StorageObjectRef`, `DocumentJob`, `DocumentArtifact`, `OutputDestination`.
- Define Storage Provider interface.
- Define Temporary Workspace interface.
- Define Job Repository interface.
- Define File Access/Output Delivery adapter interface.
- Add runtime capability service.
- Add unit tests.

**Exit:** contracts compile and are tested; existing pages still work.

## Phase 2 – Local runtime foundation

- Create/configure `input/`, `output/`, `.system/jobs/` under existing configured data root.
- Do not delete legacy areas.
- Implement local stage-once upload from browser File/stream.
- Implement safe local temp workspace and quota checks.
- Implement local output publishing.
- Implement local job repository using current durable storage choice.
- Implement startup orphan temp cleanup.

**Exit:** a test operation can process a file selected anywhere on the machine without requiring legacy source area.

## Phase 3 – Unified UI foundation

- Build new task-first Home.
- Build shared operation page shell.
- Build Dropzone/File Picker/Selected File List.
- Build Output Destination Picker.
- Build Operation Summary and result list.
- Keep current design system.
- Reuse current preview component/window.
- Remove folder tree from operation flow; keep legacy Library page temporarily if useful.

**Exit:** one operation page (Split PDF) fully uses new UX; old routes remain reachable.

## Phase 4 – Operation Registry & migrate first PDF tools

Migrate in sequence:
1. Split PDF.
2. Merge PDF.
3. PDF to Images.
4. Images to PDF.
5. Convert input to PDF.
6. Export PDF.

For each operation:
- Register definition.
- Validate input.
- Configure operation form.
- Execute existing engine via adapter.
- Publish output.
- Test local + Electron.

**Exit:** all existing non-AI PDF operations work without tree navigation and without duplicate file panels.

## Phase 5 – Cloud Storage & durable Job foundation

- Choose/add DB provider after audit.
- Implement cloud Job Repository.
- Implement Private Object Storage adapter.
- Implement direct upload token endpoint.
- Implement finalize/verify.
- Implement cloud temp `/tmp` provider.
- Implement private artifact publication/download/delete.
- Implement cleanup metadata/expiry logic.

**Exit:** authenticated small/medium test file upload-process-download works on Vercel; job state survives separate Function invocations.

## Phase 6 – Vercel runtime processing & deployment

- Configure Nitro/Vercel runtime based on current repo.
- Confirm packages and bundle size.
- Implement bounded function operation execution.
- Implement direct cloud upload for large files.
- Enforce per-operation runtime capability/resource policy.
- Implement cron/scheduled cleanup backstop; do not depend on it for immediate cleanup.
- Add deployment smoke tests.

**Exit:** Vercel Preview and Production-like environment can execute supported operations with cleanup and privacy verified.

## Phase 7 – AI Extraction migration

- Preserve AI Relay/model selector/preset/schema.
- Stage files through Storage Provider.
- Move cloud job state from in-memory to persistent repository.
- Preserve checkpoint/resume while adding safe fingerprinting.
- Implement progress and artifact publication.
- Validate AI results before export.

**Exit:** same extraction workflow runs local and cloud where runtime/resource policy allows.

## Phase 8 – Activity, retention, cleanup, and external worker abstraction

- Current jobs/history UI.
- Retry and cancel semantics.
- Retention setting.
- Artifact delete.
- Orphan cleanup.
- Queue adapter if needed.
- External worker provider for heavy tasks.

**Exit:** job lifecycle and cleanup reliable after process interruption/redeploy.

## Phase 9 – Legacy retirement & advanced tools

- Migrate optional legacy Library data.
- Remove old Explorer UI from operation routes after parity.
- Deprecate old API routes after consumer audit.
- Add OCR/Table Extraction/Compress/Rotate only as separate registered operations.
- Add Batch Templates/Workflow only when core flows are stable.

**Exit:** v4 is primary product and legacy compatibility is intentionally reduced with documented release notes.

---

# 23. Suggested repository organization (target, adapt to existing conventions)

Do not create every directory mechanically. Use only what is needed and follow existing `server/modules/pdf` conventions.

```text
app/
├── pages/document-studio/
│   ├── index.vue
│   ├── tools/
│   │   ├── split.vue
│   │   ├── merge.vue
│   │   ├── images.vue
│   │   ├── convert.vue
│   │   ├── export.vue
│   │   └── ai-extract.vue
│   ├── activity/
│   │   ├── index.vue
│   │   └── [jobId].vue
│   └── settings.vue
├── components/document-studio/
│   ├── input/
│   ├── output/
│   ├── operations/
│   ├── jobs/
│   └── viewer/
└── composables/document/

server/
├── api/v1/documents/
├── modules/document/
│   ├── operations/
│   ├── storage/
│   ├── temporary/
│   ├── jobs/
│   ├── upload/
│   ├── output/
│   ├── security/
│   └── cleanup/
└── modules/pdf/              # Existing PDF engines retained during migration

electron/
├── main/
├── preload/
└── ipcPolicy.cjs             # Only narrow native file capabilities if required

shared/
└── types/document/
```

If project uses different `pages` or `components` conventions, adapt. Do not move existing route files until the new page works and route compatibility is planned.

---

# 24. Runtime capability and resource policy examples

Values are illustrative; calibrate through audit and load testing.

```ts
interface RuntimePolicy {
  runtime: 'local' | 'electron' | 'vercel' | 'worker'
  maxFileBytes: number
  maxTotalInputBytes: number
  maxInputFiles: number
  maxTempBytes: number
  maxOutputBytes: number
  maxInlineDurationMs: number
  allowAsyncJobs: boolean
  allowExternalWorker: boolean
}

interface OperationResourceProfile {
  operationId: string
  estimatedMemoryMultiplier: number
  estimatedTempMultiplier: number
  perPageCost?: number
  requiresNativeBinary?: boolean
  cloudAllowed: boolean
  workerRecommended: boolean
}
```

Rules:

- `maxTempBytes` must consider input + intermediate + output together.
- A raster operation can expand one PDF into many images; input size alone is not enough.
- OCR memory and image resolution may dominate PDF size.
- ZIP/archive extraction must limit uncompressed size and entry count.
- AI extraction includes provider timeout/rate/quota and page count.
- If cloud runtime doesn't have capacity, do not silently fall back to Local path or process in request.

---

# 25. Settings UX

Settings should remain small and user-oriented.

## 25.1. Storage Defaults

Local/Electron:

- Default Input Library folder.
- Default Output folder.
- Remember last output destination.
- Ask before overwrite.
- Open output folder after completion (optional).

Web:

- Default behavior: Download.
- Prefer browser Save Picker when available.
- Cloud temporary retention notice.
- Storage usage/cleanup controls only if cloud input library exists.

Do not present server `/tmp` path or Blob prefix to end user.

## 25.2. Cleanup & Privacy

- Default result retention.
- Delete result now.
- Clear temporary data (only inactive jobs).
- Clear history (does not delete artifacts unless separately confirmed).
- Explain difference between clear history and delete files.

## 25.3. Advanced diagnostics

For development/admin only:
- Runtime detected.
- Storage provider status.
- Temp usage/limit.
- Job ID/request ID.
- Cleanup state.
- Worker/queue health.

Do not show raw paths/secrets in ordinary user UI.

---

# 26. Documentation deliverables required from AI

At minimum, update/create:

1. `docs/document-studio/REBUILD-AUDIT.md`
2. `docs/document-studio/ARCHITECTURE-v4.md`
3. `docs/document-studio/STORAGE-RUNTIME-MATRIX.md`
4. `docs/document-studio/OPERATIONS-CATALOG.md`
5. `docs/document-studio/API-CONTRACTS.md`
6. `docs/document-studio/MIGRATION-PLAN.md`
7. `docs/document-studio/VERIFICATION.md` → **replaced by `TEST-VERIFICATION.md`** (2026-11-06); the phases 0–4 file is archived
8. `docs/document-studio/DEPLOY-VERCEL.md` → **replaced by `VERCEL-DEPLOYMENT.md`** (2026-11-06); the pre-guide draft is archived because it proposed MongoDB + Vercel Blob

Added by the completion guide §16:

9. `docs/document-studio/CLOUD-ARCHITECTURE.md`
10. `docs/document-studio/RETENTION-CLEANUP.md`
11. `docs/document-studio/LEGACY-RETIREMENT.md`
12. `.env.example` with placeholder names only
13. `migrations/postgres/0001_document_studio.sql` + `migrations/postgres/README.md`

Keep each document consistent with implementation. Do not mark features done unless tests/evidence exist.

Archive index: [`docs/archive/2026-11-06-document-studio-v4-phase5/README.md`](../archive/2026-11-06-document-studio-v4-phase5/README.md).

---

# 27. Prompt khởi động cho AI Coding Agent

Copy prompt dưới đây cùng file v4:

```text
Hãy đọc toàn bộ TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md và audit codebase hiện tại trước khi sửa.

Mục tiêu: rebuild TM Document Studio theo trải nghiệm Choose → Process → Save. Người dùng chọn file từ bất kỳ vị trí nào, chọn operation, cấu hình tối thiểu và lưu kết quả ở output mặc định hoặc vị trí do họ chọn. Không yêu cầu người dùng duyệt cây thư mục kỹ thuật. Không dùng Universal Explorer/7-area tree làm giao diện chính của operation.

Bắt buộc hỗ trợ cùng codebase cho dev local, Electron Desktop và Web deploy Vercel. Local/Electron dùng filesystem adapter; Vercel dùng Private Object Storage + persistent Job Database + /tmp chỉ làm scratch. Không bao giờ coi Vercel /tmp là persistent storage. File upload lớn phải direct-upload object storage vì Vercel Function request body limit; token cấp upload phải authenticate/authorize và scope theo job/user. Output cloud phải private và download phải kiểm tra owner.

Giữ Nitro/API là application/processing boundary. Electron chỉ cung cấp native file picker/save capability hẹp qua preload khi cần; không chuyển PDF engine sang Electron Main, không expose arbitrary fs/path/shell cho Renderer. Web phải có fallback khi File System Access API không hỗ trợ: standard download hoặc ZIP cho nhiều artifacts.

Tạo Audit Report trước; kiểm kê tất cả component trong app/components/pdf, pages, composables, server/modules/pdf, API, Electron, auth/database, AI Relay, build/deploy. Reuse engine hiện tại; không viết lại thuật toán Split/Merge/Rasterize/Convert/Export/AI nếu chưa có lý do. Giữ dữ liệu legacy .data/pdf; không rename/delete/move tự động. Tạo compatibility adapter và migration có kiểm soát.

Triển khai tuần tự Phase 0–9 của tài liệu. Sau mỗi phase: typecheck/lint/test/build, chạy smoke test local/Electron/Vercel target tương ứng, cập nhật tài liệu và checklist. Không dừng ở kế hoạch. Không đánh dấu DONE nếu chưa có bằng chứng. Nếu giới hạn Vercel khiến operation không phù hợp, đánh dấu cần external worker thay vì giả vờ xử lý được.
```

---

# 28. Official technical references (checked 2026-11-06)

AI phải kiểm tra lại các tài liệu này ngay trước khi thêm package, bật tính năng hoặc deploy vì limits, Beta status, API và pricing có thể thay đổi.

1. Vercel Functions Limits: https://vercel.com/docs/functions/limitations
   - `/tmp` scratch filesystem; 4.5 MB request/response payload; memory/duration/package limits.
2. Vercel Function Runtimes: https://vercel.com/docs/functions/runtimes
   - Runtime filesystem read-only ngoài `/tmp`, `/tmp` scratch tối đa 500 MB.
3. Vercel Blob Private Storage: https://vercel.com/docs/vercel-blob/private-storage
   - Private store, access control, private delivery and size/traffic considerations; current page identifies Private Storage as Beta.
4. Vercel Blob Client Uploads: https://vercel.com/docs/vercel-blob/client-upload
   - Direct client upload for files over Function payload limit; token exchange; server must authenticate/authorize before token generation.
5. Vercel Queues: https://vercel.com/docs/queues
   - Durable messages, consumer retries, at-least-once delivery; feature status may be Beta.
6. Vercel Cron Job Usage/Pricing: https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing
   - Hobby and Pro/Enterprise scheduling frequency/precision.
7. Electron dialog API: https://www.electronjs.org/docs/latest/api/dialog
   - Native open/save dialogs and defaultPath/options.
8. MDN File System API: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
   - Browser file/directory handles and secure-context requirements.
9. MDN showOpenFilePicker: https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
   - Limited availability; must feature-detect and provide fallback.

### Verified platform notes for this specification

- Vercel Functions have read-only filesystem with writable `/tmp` scratch space up to 500 MB (per current runtime docs).
- Vercel Function request/response payload limit is 4.5 MB (per current limits docs).
- Direct Vercel Blob client upload is documented for files larger than 4.5 MB and requires server-side authentication/authorization before upload token issuance.
- Vercel Private Blob documentation currently describes the feature as Beta and says serving files larger than 100 MB through Private Blob is not recommended unless traffic is low. Benchmark or use another private object storage provider for large results.
- Vercel Function duration/memory values vary by plan, Fluid Compute, runtime version and feature availability. Do not hard-code a promise that every operation will run on Hobby/Pro.
- Hobby Cron is currently limited to once per day; cleanup must be event-driven and idempotent, with Cron as a backstop rather than the only cleanup method.
- Electron native dialog API runs in Main Process. Keep native path handling behind a narrow preload capability.
- Browser File System Access methods require feature detection and user permission; standard download is mandatory fallback.

---

# 29. Final architecture decisions to preserve

1. Product experience is **Choose → Process → Save**.
2. No technical folder tree in the normal processing workflow.
3. Users may choose files from any location accessible to their runtime.
4. User may choose output location where runtime/browser grants it; otherwise browser download is the fallback.
5. Local default folders are `input/` (optional reusable library) and `output/` (default persistent result destination); `.system/` is internal.
6. Use-once input is temporary staging, not silently copied into persistent Input Library.
7. Vercel uses Private Object Storage for file persistence, database for job state and `/tmp` only for scratch.
8. Do not rely on Vercel Function instance reuse or `/tmp` persistence across invocations.
9. Large cloud uploads bypass Function request body via authenticated direct upload.
10. Output artifacts remain private and user-owned; download/delete enforce ownership.
11. Cleanup has immediate `finally` plus idempotent orphan/expiry cleanup.
12. Storage Provider, Temp Provider, Job Repository, Queue/Worker and File Access are adapters.
13. Existing PDF engines and TM Hub AI Relay are reused through compatibility adapters.
14. Electron native bridge is restricted to file selection/save; processing remains in Nitro/shared engine.
15. V4 is not complete until local/Electron/Vercel runtime tests and legacy-data preservation checks pass.

**Kết quả cuối cùng cần đạt:** Người dùng không phải hiểu cấu trúc lưu trữ nội bộ. Họ chỉ thấy công việc cần làm, tài liệu đã chọn, tùy chọn cần thiết và kết quả có thể lưu/tải xuống. Toàn bộ độ phức tạp của filesystem, cloud storage, `/tmp`, job, worker và cleanup được hệ thống xử lý phía sau.
