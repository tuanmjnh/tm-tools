# TM Tools — Document Studio Standardization Specification v5

> **Tài liệu kiến trúc chuẩn hóa dành cho AI Coding Agent.** Đây là đích kiến trúc thống nhất cho Document Studio: một workspace tài liệu, một thư viện `input` / `output`, một Operation Registry, một Format Registry, một Job Pipeline và các Storage Adapter theo runtime.
>
> **Repository:** `tuanmjnh/tm-tools`  
> **Hub dependency:** `tuanmjnh/tm-hub` + `tuanmjnh/tm-hub-client`  
> **Baseline GitHub main đã rà soát:** 2026-11-08.

| Repository | Reviewed main commit | Ý nghĩa |
|---|---|---|
| `tuanmjnh/tm-tools` | [`52929df3bcef52da2f3c5af2e9c2eb0cca74a28f`](https://github.com/tuanmjnh/tm-tools/commit/52929df3bcef52da2f3c5af2e9c2eb0cca74a28f) | Document Studio v4, API/jobs/storage, Activity, Settings, legacy PDF pages còn song song |
| `tuanmjnh/tm-hub` | [`e1b0fba313a09f1e13bf16229e33516c2d72d019`](https://github.com/tuanmjnh/tm-hub/commit/e1b0fba313a09f1e13bf16229e33516c2d72d019) | Storage Gateway và tài liệu tích hợp đã cập nhật trên main |
| `tuanmjnh/tm-hub-client` | [`9eeb0d646893668d30402a0f2a2bdddb6fc87cf3`](https://github.com/tuanmjnh/tm-hub-client/commit/9eeb0d646893668d30402a0f2a2bdddb6fc87cf3) | SDK có namespace `storage`, package version `1.1.0` |

---

## 0. Chỉ thị bắt buộc cho AI Coding Agent

### 0.1. Đọc và đối chiếu tài liệu trước khi sửa code

Đọc tối thiểu các tài liệu sau trong `tm-tools`:

- `docs/document-studio/ARCHITECTURE-v4.md`
- `docs/document-studio/API-CONTRACTS.md`
- `docs/document-studio/OPERATIONS-CATALOG.md`
- `docs/document-studio/MIGRATION-PLAN.md`
- `docs/document-studio/PHASE-STATUS.md`
- `docs/document-studio/STORAGE-RUNTIME-MATRIX.md`
- `docs/document-studio/LEGACY-RETIREMENT.md`
- `docs/document-studio/TEST-VERIFICATION.md`
- `docs/pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md`
- `docs/TM-TOOLS-HUB-STORAGE-INTEGRATION.md`

Đối chiếu code thật tại `app/pages/document-studio/**`, `app/pages/pdf/**`, `app/components/document-studio/**`, `app/components/pdf/**`, `app/composables/useDocument*.ts`, `app/composables/usePdf*.ts`, `server/modules/document/**`, `server/modules/pdf/**`, `server/api/v1/documents/**`, `server/api/v1/pdf/**`, `shared/types/document/**` và `shared/types/pdf.ts`.

Các file v4 hiện có là **nền tảng phải kế thừa**, không phải code cần thay toàn bộ. Nếu code khác tài liệu, code và test hiện hành là nguồn sự thật; ghi rõ chênh lệch trước khi sửa.

### 0.2. Tài liệu này thay đổi điều gì?

Tài liệu v5 **thay thế định hướng Information Architecture, thư viện file, format/operation extensibility và quy tắc hợp nhất legacy** của v4. Tài liệu này không xóa bỏ những quyết định v4 vẫn đúng:

- Nuxt/Nitro một codebase cho local, Electron, Vercel và worker.
- Document Job API, ownership, idempotency, artifact manifest, Postgres cho cloud job metadata.
- Local/Electron dùng filesystem; cloud dùng TM Hub Storage Gateway hoặc R2 override.
- Hub App Secret và provider credentials chỉ ở server.
- Vercel `/tmp` là scratch, không phải persistent storage.
- Không xóa dữ liệu hay legacy API trước khi migration/parity được xác minh.

Nếu tài liệu cũ nói AI Extraction vẫn phải giữ `/pdf/extract` hoặc Library phải giữ trong `/pdf/library`, đó là **trạng thái chuyển tiếp v4**, được thay bằng mục tiêu v5 sau khi hoàn tất compatibility migration.

### 0.3. Không được làm

1. Không xây lại Connections Registry, AI Relay hoặc Storage Gateway của TM Hub.
2. Không đưa `NUXT_HUB_APP_SECRET`, provider key, signed download grant, object key hoặc server absolute path vào browser/client state.
3. Không duy trì hai job framework độc lập cho Document Studio và AI Extraction sau migration.
4. Không thêm thư mục user-facing theo từng operation/format như `pdf/`, `excel/`, `word/`, `json/`, `split/`, `products/`.
5. Không hard-code danh sách provider/model; phải lấy catalogue động từ Hub AI Relay.
6. Không hiển thị operation/conversion pair là khả dụng nếu chưa có executor và capability tương ứng.
7. Không `rename`, `rm -rf`, ghi đè hoặc di chuyển dữ liệu legacy một lần không có dry-run, checksum, migration ledger, backup và rollback.
8. Không chuyển AI Extraction sang Vercel Function inline chỉ vì đã đưa page vào `document-studio`; runtime capability phải dựa trên bằng chứng engine/worker.

---

# 1. Sản phẩm đích

## 1.1. Định nghĩa

**Document Studio là một hệ thống quản lý và xử lý tài liệu đa định dạng**, trong đó PDF chỉ là một nhóm operation và format, không còn là cấu trúc gốc chi phối toàn bộ app.

Người dùng thực hiện một luồng nhất quán:

```text
CHỌN TÀI LIỆU
  Chọn từ thiết bị / kéo-thả / Input Library / Output Library
       ↓
CHỌN CÔNG VIỆC
  Split / Merge / Convert / Extract / Export / các operation được hỗ trợ
       ↓
CẤU HÌNH
  Chọn định dạng đích, model AI, prompt preset, options theo operation
       ↓
XỬ LÝ
  Validate → stage → create job → execute → publish artifacts
       ↓
NHẬN KẾT QUẢ
  Xem trực tiếp / mở bằng ứng dụng hệ điều hành / tải về / lưu vào Output
```

## 1.2. Hai thư viện user-facing duy nhất

Trong Document Studio, người dùng chỉ thấy hai thư viện gốc:

- **Input**: tài liệu đầu vào được người dùng lưu để tái sử dụng.
- **Output**: kết quả xử lý đã xuất bản, đồng thời có thể được chọn làm input cho operation tiếp theo.

Không còn các vùng user-facing `sources`, `inputs`, `word`, `split`, `images`, `merged`, `products`, `office`.

Điểm quan trọng: `input` và `output` là **vai trò thư viện**, không phải giới hạn định dạng. Cả hai có thể chứa PDF, DOCX, XLSX, CSV, JSON, XML, PNG, JPG và các định dạng được đăng ký về sau.

Một file trong Output vẫn được phép đưa vào một operation mới như input mà không bắt buộc phải copy sang Input. Nếu người dùng chọn “Save to Input Library”, ứng dụng mới tạo/copy một bản trong Input.

## 1.3. Luồng UX nhất quán

Các operation page phải giữ cùng thứ tự ngữ nghĩa:

1. Choose files.
2. Processing options.
3. Output format / destination.
4. Summary + Start.
5. Result artifacts + preview/open/download.

Không cần ép mọi operation dùng cùng một form chi tiết. Operation-specific options được render theo `configuration.componentKey` hoặc schema component đã đăng ký.

---

# 2. Information Architecture và page structure

## 2.1. Cây route chuẩn

```text
/document-studio
  /                         Home: tìm operation và recent activity
  /library                  Thư viện thống nhất: Input | Output
  /activity                 Job history, progress, artifact actions
  /settings                 Runtime, storage, limits, retention, defaults
  /tools/[slug]             Trang dùng chung cho operation đã đăng ký
```

Các route operation hiện có như `/document-studio/tools/split`, `/merge`, `/images`, `/convert`, `/export` được giữ tương thích qua slug mapping hoặc route redirect. Không tạo một page Vue mới cho từng tổ hợp định dạng.

`/document-studio/tools/[slug]` chỉ resolve `slug` trong Operation Registry client-safe. Nếu slug không hợp lệ hoặc operation không được runtime hỗ trợ, hiển thị trạng thái unavailable rõ ràng; không mount một form giả.

## 2.2. Cấu trúc thư mục frontend mục tiêu

```text
app/
  pages/
    document-studio/
      index.vue
      library.vue
      activity.vue
      settings.vue
      tools/
        [slug].vue

  components/
    document-studio/
      layout/
        DocumentStudioShell.vue
        OperationPageShell.vue
        OperationStepHeader.vue
      library/
        LibraryTabs.vue
        LibraryToolbar.vue
        DocumentFileList.vue
        DocumentFileRow.vue
        DocumentFilePreview.vue
        DocumentFileActions.vue
      activity/
        ActivityJobList.vue
        ActivityJobRow.vue
        ActivityArtifactList.vue
        ActivityArtifactActions.vue
      operations/
        OperationConfigRenderer.vue
        FileSelectionPanel.vue
        OutputOptionsPanel.vue
        ResultArtifacts.vue
        configs/
          PdfSplitConfig.vue
          PdfMergeConfig.vue
          ConvertConfig.vue
          ExportFormatsConfig.vue
          AiExtractionConfig.vue

  composables/
    useDocumentApi.ts
    useDocumentFiles.ts
    useDocumentRun.ts
    useDocumentLibrary.ts
    useDocumentActivity.ts
    useDocumentRuntime.ts

  domain/
    document-studio/
      operation-catalog.ts
      format-catalog.ts
      conversion-matrix.ts
      route-map.ts
      types.ts
```

Đây là target structure; AI được phép điều chỉnh theo convention thực tế của repo nhưng phải giữ nguyên phân lớp và trách nhiệm. Không tạo folder rỗng chỉ để giống cây ví dụ.

### Quy tắc page

- `pages/` chỉ chịu trách nhiệm route, đọc slug/query, lấy dữ liệu và ghép component.
- Không đặt logic xử lý file, mapping định dạng, gọi Storage Gateway, prompt builder hoặc executor trong page `.vue`.
- `tools/[slug].vue` là page router chung; specialized component nằm dưới `components/document-studio/operations/configs/`.
- `library.vue`, `activity.vue`, `settings.vue` nằm cùng root `document-studio`, không nằm trong `pdf/`.
- Các component PDF có thể được tái sử dụng/refactor, nhưng component tổng quát không còn phụ thuộc `PdfFileArea` hay `pdfDirs`.

## 2.3. Cấu trúc backend mục tiêu

Không cần refactor toàn bộ backend trong một commit. Dần chuyển từ các file flat hiện tại sang nhóm chức năng:

```text
server/modules/document/
  core/
    contracts.ts
    operations.ts
    dispatcher.ts
    runner.ts
    jobs.ts
    output.ts
    validation.ts
  formats/
    registry.ts
    mime.ts
    detection.ts
    conversion-matrix.ts
  operations/
    pdf/
      split.executor.ts
      merge.executor.ts
      rasterize.executor.ts
      images-to-pdf.executor.ts
      export.executor.ts
    convert/
      convert.executor.ts
    extract/
      ai-extract.executor.ts
      model-catalog.ts
      prompt-presets.ts
      checkpoint.ts
  storage/
    local-storage.ts
    hub-storage.ts
    r2-storage.ts
  runtime/
    runtime.ts
    runtime-context.ts
    scratch.ts
  migration/
    legacy-pdf-migration.ts
    migration-ledger.ts
```

Không bắt buộc chia file ngay khi bắt đầu. Có thể để `server/modules/document/operations.ts`, `executors.ts`, `runtime.ts` hiện tại làm façade trong giai đoạn transition. Mọi executor mới phải đăng ký qua một registry duy nhất; không thêm route handler xử lý conversion riêng lẻ.

---

# 3. Bốn registry phải tách biệt

Đây là điểm quan trọng nhất để mở rộng lâu dài.

## 3.1. Format Registry — “hệ thống biết những định dạng nào?”

Mỗi format có một ID chuẩn, extension, MIME, nhóm và khả năng kiểm tra/preview:

```ts
interface DocumentFormatDefinition {
  id: string                 // pdf, docx, xlsx, csv, json, xml, png...
  labelKey: string
  category: 'document' | 'spreadsheet' | 'structured-data' | 'image' | 'archive' | 'other'
  extensions: string[]
  mimeTypes: string[]
  preview: {
    browser: boolean
    desktop: boolean
    viewer: 'pdf' | 'image' | 'table' | 'text' | 'office' | 'none'
  }
  detection: {
    inspectExtension: boolean
    inspectMime: boolean
    inspectSignature: boolean
  }
}
```

Format Registry không tuyên bố rằng có thể convert giữa hai format bất kỳ. Format được nhận diện khác với format được xử lý.

## 3.2. Operation Registry — “người dùng muốn làm gì?”

Ví dụ `pdf.split`, `pdf.merge`, `document.convert`, `document.ai-extract`, `document.export`.

Operation definition giữ metadata và cấu hình:

```ts
interface DocumentOperationDefinition {
  id: string
  slug: string
  version: string
  category: string
  titleKey: string
  descriptionKey: string
  icon: string
  input: {
    acceptedFormatIds: string[]
    minFiles: number
    maxFiles: number
    ordered: boolean
    allowFromInputLibrary: boolean
    allowFromOutputLibrary: boolean
  }
  configuration: {
    componentKey: string
    schemaVersion: number
    defaults: Record<string, unknown>
  }
  outputs: {
    formatIds: string[] | 'user-selectable'
    artifactMode: 'single' | 'multiple' | 'variable' | 'archive'
  }
  execution: {
    mode: 'inline' | 'async' | 'worker'
    supportsProgress: boolean
    supportsCancel: boolean
    supportsPartial: boolean
  }
  runtimePolicy: Record<string, unknown>
}
```

Mở rộng kiểu type trong `shared/types/document/index.ts`; không để `string` tùy ý mà không validate. Nếu cần giữ `DocumentOperationId` union hiện tại, tiếp tục mở rộng union đồng bộ với registry và tests.

## 3.3. Conversion Matrix — “cặp source → target nào thực sự được hỗ trợ?”

Conversion là đồ thị có hướng. Mỗi cạnh phải khai báo executor/strategy cụ thể:

```ts
interface DocumentConversionDefinition {
  id: string                 // e.g. spreadsheet.xlsx-to-docx
  sourceFormat: string       // xlsx
  targetFormat: string       // docx
  operationId: string        // document.convert
  strategy: 'binary' | 'layout' | 'structured-data' | 'ocr' | 'ai-assisted'
  executorId: string
  configSchemaVersion: number
  runtimes: string[]
  limitations: string[]
  enabled: boolean
}
```

Không suy ra conversion bằng cách nhìn thấy một extension trong `acceptedExtensions`. Một conversion pair chỉ hiện trong UI khi server catalogue trả về `available: true` và có executor thực thi.

## 3.4. Executor Registry — “code nào thực hiện?”

Mỗi operation hoặc conversion strategy có executor độc lập, tuân theo `DocumentOperationExecutor` và `OperationExecutionContext` hiện tại. Executor không được tự quyết định storage root hoặc gửi file trực tiếp lên Hub. Nó chỉ đọc `VerifiedInput` từ workspace và ghi vào `workspace.outputDir`; publish/artifact manifest do Job Pipeline đảm nhiệm.

## 3.5. Không gộp 4 registry vào một danh sách

- Format Registry không chứa page route.
- Operation Registry không chứa provider credentials hoặc storage paths.
- Conversion Matrix không hardcode UI component.
- Executor Registry không đọc trạng thái component hoặc gọi `$fetch`.

`/api/v1/documents/operations` cần expose catalogue đã sanitize cho UI, kèm runtime capability và conversion matrix phù hợp. Server là nguồn sự thật cho khả dụng; client catalogue chỉ cung cấp metadata/i18n.

---

# 4. Chuẩn hóa Input / Output và storage

## 4.1. User-visible directory model

Local và Electron:

```text
<DocumentDataRoot>/
  input/                     # reusable source library
  output/                    # all published results and generated files
  .system/                   # hidden application-managed data
    jobs/
      <jobId>/
        input/               # staged copies/references for one job
        working/             # intermediate files
        output/              # uncommitted executor output
        manifest.json
    checkpoints/             # AI extraction checkpoints
    presets/                 # prompt presets or migrated presets.json
    trash/                   # reversible deletes before purge
    audit/                   # audit events/logs
    migrations/              # migration ledger and reports
    temp/                    # bounded scratch
```

Chỉ `input/` và `output/` hiển thị trong Library. `.system/` không xuất hiện trong file picker, breadcrumb, output destination selector hoặc navigation.

## 4.2. Logical cloud namespace

Cloud Storage object được phân loại bằng logical namespace tương đương:

```text
<app namespace>/document-studio/input/<opaque-object-id>
<app namespace>/document-studio/output/<opaque-object-id>
```

Có thể thêm metadata `libraryRole: input | output`, `jobId`, `operationId`, `sourceArtifactId`, `originalName`, `relativeFolder`, `checksumSha256`, `createdAt`; không encode user ID/email hoặc physical bucket path vào client model.

Hub Storage Gateway sở hữu provider bucket/credential; tm-tools chỉ lưu `objectId` và metadata nghiệp vụ. Không xây thêm Hub bucket abstraction trong frontend.

## 4.3. Định nghĩa Input/Output thống nhất trong code

Tạo một domain type chung, tránh `PdfFileArea` cho Document Studio:

```ts
type DocumentLibraryRole = 'input' | 'output'

interface DocumentLibraryItem {
  id: string
  role: DocumentLibraryRole
  name: string
  formatId: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  updatedAt?: string
  relativeFolder?: string
  checksumSha256?: string
  origin: 'upload' | 'generated' | 'imported' | 'legacy-migrated'
  source?: {
    legacyArea?: string
    legacyRelativePath?: string
    jobId?: string
    operationId?: string
    artifactId?: string
  }
  capabilities: {
    preview: boolean
    openInDesktop: boolean
    download: boolean
    useAsInput: boolean
    rename: boolean
    delete: boolean
  }
}
```

`role` luôn là input hoặc output; `formatId` xác định loại nội dung. Đừng tạo `PdfFileInfo`, `PdfFileArea` hoặc `area` values riêng cho v5 pages.

## 4.4. Luồng chọn file

Một operation nhận file từ:

- Browser file picker / drag & drop.
- Electron native picker (nếu runtime adapter có).
- Input Library.
- Output Library (chọn một file kết quả làm source cho công việc mới).

`SelectedDocumentFile` là client view model, không chứa absolute path, app secret, storage key hoặc signed download URL. Server tạo `VerifiedInput` sau khi upload/materialize đã được xác minh.

## 4.5. Quy tắc upload và publish

1. Validate extension + MIME + signature khi có.
2. Validate file count, per-file size, aggregate size, operation-specific limits.
3. Local/Electron: stage vào `.system/jobs/<jobId>/input/`; không bắt buộc sao chép vào Input Library.
4. Cloud: API tạo upload intent, browser PUT trực tiếp qua short-lived upload grant, gọi complete; Hub kiểm tra object bằng HEAD trước khi manifest dùng được.
5. Executor ghi output trong job scratch.
6. Publisher lưu artifacts vào Output Library/local Output hoặc Hub/R2 object storage và commit manifest.
7. Cleanup scratch trong `finally`; không xóa input gốc nếu người dùng chưa yêu cầu.

Không proxy file lớn qua Vercel Function body khi đã có direct upload grant.

## 4.6. Không còn `input` và `inputs`

Nguồn chuẩn duy nhất là `input` (số ít) và `output` (số ít). Không tạo alias API mới `/inputs` hoặc thư mục `inputs/` trong v5.

Trong giai đoạn tương thích:

- API cũ `/api/v1/pdf/inputs/**` và code `word/` vẫn có thể phục vụ legacy clients.
- Adapter đọc legacy có thể dịch `sources|inputs|word` → logical `input`; `split|images|merged|products|office` → logical `output`.
- Tất cả page/API mới dùng `input` / `output`.
- Chỉ xóa legacy path sau khi migration report, checksum, consumer audit và parity tests đều PASS.

---

# 5. Page và hành vi từng khu vực

## 5.1. Home `/document-studio`

- Search operation.
- Nhóm theo loại công việc: PDF, Convert, Extract, Export, Image/Data.
- Chỉ show operation và conversion pair mà server capability báo khả dụng.
- Recent activity lấy từ Document Jobs, không từ Map hoặc PDF job store cũ.
- Không hiển thị cây thư mục kỹ thuật hoặc nhiều library area.

## 5.2. Library `/document-studio/library`

Có hai tab gốc: **Input** và **Output**.

Mỗi tab dùng chung `DocumentFileList`/`DocumentFileRow`; hỗ trợ search, filter format, sort date/name/size, select file, preview/open/download, rename (nếu được phép), delete/restore, “Use in operation”.

Không dùng cây folder theo operation. Có thể hỗ trợ logical subfolder do người dùng tự tạo trong `input/` hoặc `output/`, nhưng navigation luôn nằm dưới một trong hai root. Nếu có folder, folder là metadata/path tương đối, không phải vùng lưu trữ loại mới.

File từ Output có thể dùng trực tiếp làm input. Không auto-copy file giữa hai root.

## 5.3. Activity `/document-studio/activity`

- Nguồn dữ liệu duy nhất: Document Job Repository/Document API.
- Filter: all, queued/running, completed, partial/failed/cancelled, expired.
- Job row hiển thị operation, thời gian, status/progress, input summary, output count.
- Artifact row có action rõ ràng: **Open / Preview / Download / Reveal in folder / Copy path / Delete** tùy runtime + capability.
- Không gán cùng một hành động cho “preview” và “download”.

### Local/Electron open behavior

Khi `runtime` là local/Electron và `artifact.localPath` có giá trị:

- Action chính **Open** gọi `openLocalPath(artifact.localPath)`; Electron main mở bằng OS default handler.
- Action **Show in folder** gọi `revealLocalPath(artifact.localPath)`.
- Copy path chỉ hiện ở desktop.
- PDF/image có thể vẫn có action Preview trong viewer nội bộ nếu đã được hỗ trợ; Open OS là action riêng.
- Không gọi `/download?inline=1` như một giải pháp giả cho mọi MIME type.

### Browser/cloud behavior

- Preview nội bộ chỉ cho MIME đã whitelist và viewer thực sự hỗ trợ.
- PDF/image/text/table có viewer tương ứng thì dùng authenticated artifact route/preview component.
- Office file hoặc định dạng không có browser viewer: Download; không tuyên bố preview.
- Signed Hub download grant không bao giờ trả về page; server stream bytes qua authenticated route.
- Không expose `localPath` trong cloud response.

## 5.4. Settings `/document-studio/settings`

Giữ các cấu hình đang có: runtime, storage driver status, default output destination, limits, retention, cleanup capability. Bổ sung default library behavior nếu cần. Không cho người dùng chỉnh các bí mật Hub/provider trong Document Studio.

---

# 6. AI Extraction phải trở thành operation của Document Studio

## 6.1. Không làm thêm trang AI độc lập

`document.ai-extract` hiện đã có definition trong Operation Registry nhưng bị lọc do chưa có v4 executor; route vẫn là `/pdf/extract`. V5 phải chuyển operation này sang `/document-studio/tools/extract` (slug `extract`) thông qua `tools/[slug].vue` và `AiExtractionConfig.vue`.

Không duy trì một UI mới và một UI legacy chạy song song mãi. Trong transition, `/pdf/extract` chỉ redirect về `/document-studio/tools/extract`; API legacy tiếp tục làm adapter tới engine mới cho tới khi consumer audit xác nhận không còn caller.

## 6.2. Phải giữ đầy đủ tính năng cũ

AI Extraction page cần có:

- Chọn source document từ thiết bị, Input Library hoặc Output Library nếu format được hỗ trợ.
- Model picker động từ các AI connections đã được cấp quyền trong TM Hub.
- Thông tin provider, connection name, model ID/display name.
- Chọn prompt preset, tạo mới, chỉnh sửa, xóa, đặt tên/description/sample.
- Tùy chỉnh instructions theo từng run nếu cần (không sửa preset gốc trừ khi Save).
- Chọn export formats: CSV, XLSX, JSON, XML, DOCX; chỉ bật format có exporter và dữ liệu phù hợp.
- Force reprocess / reuse checkpoint.
- Overwrite policy / collision policy.
- Job progress, cancel, retry (khi operation cho phép), kết quả từng artifact và lỗi theo trang/chunk.

Không bỏ `AiProvidersModelSelect` nếu component còn tương thích; nếu cần refactor props thì tạo adapter/component mới, không xóa trải nghiệm chọn provider/model.

## 6.3. Model/provider source

Tái sử dụng logic hiện có tại `server/modules/pdf/extract/models.ts` và `server/utils/aiRelay.ts`:

- Tải catalogue từ TM Hub AI Relay.
- Không hardcode provider list hoặc model IDs.
- Chỉ hiển thị connection/model được Hub báo có thể dùng và hỗ trợ phương thức input của extraction (vision hoặc text).
- Khi start job, server phải revalidate `connectionId + modelId` theo catalogue/connection grants hiện tại; không tin giá trị client gửi.
- Provider credentials nằm trong TM Hub; tm-tools chỉ gửi relay request thông qua server.

## 6.4. Prompt preset model

Giữ tương thích dữ liệu hiện tại `{id,name,description,sample,updatedAt}` và giới hạn hiện hành: name 80, description 6000, sample 16000 ký tự, tối đa 40 preset.

Có thể nâng schema theo version, nhưng phải hỗ trợ đọc preset v1:

```ts
interface AiExtractionPresetV1 {
  id: string
  name: string
  description: string
  sample: string
  updatedAt: string
}

interface AiExtractionConfigV2 {
  presetId?: string | null
  systemInstruction?: string
  taskInstruction?: string
  sampleOutput?: string
  outputSchemaId: string
  temperature?: number
  maxRetries?: number
  checkpointPolicy: 'reuse-valid' | 'force-reprocess'
}
```

`systemInstruction`/`taskInstruction` là gợi ý schema; mapping sang `PdfExtractInstructions` cũ phải có adapter rõ ràng. Không gộp sample output vào JSON schema hoặc thay đổi schema sản phẩm âm thầm.

Preset phải lưu ở `.system/presets/` trên local/Electron hoặc persistent DB/object-backed config store trên cloud. Không lưu preset cloud vào Vercel `/tmp`.

## 6.5. Export format selection

Giữ những format được hỗ trợ trong engine hiện tại: `csv`, `xlsx`, `json`, `xml`, `docx`; bổ sung `pdf` hoặc format khác chỉ khi executor thực sự hỗ trợ.

Hiện exporter dùng cached extraction rows cho CSV/XLSX/JSON/XML và DOCX được xử lý riêng theo pipeline hiện có. Catalogue phải biểu thị lý do không khả dụng khi không có rows/schema/cache; UI không bật checkbox giả rồi để executor thất bại mơ hồ.

## 6.6. Job/Checkpoint integration

- Dùng chung `DocumentJobRecord`, `DocumentJobRepository`, `DocumentJobView`, `DocumentArtifactView`, `DocumentError` và `/api/v1/documents/**`.
- Không tạo một `AiExtractionJobsMap` làm nguồn dữ liệu duy nhất.
- Tái sử dụng engine tại `server/modules/pdf/extract/provider.ts`, prompt builder, normalization, checkpoint fingerprint, export writer.
- Job config snapshot lưu `connectionId`, model ID, preset ID/version, prompt fingerprint, output schema version, formats, force/overwrite flags; không lưu provider secrets.
- Checkpoint fingerprint phải gồm source content SHA-256, page/chunk count, schema version, normalized prompt, preset version, connection ID, model ID và extractor version.
- AI job dài phải có durable queue/worker hoặc execution model được hỗ trợ. Local/Electron có thể chạy process local theo runtime policy. Không bật Vercel Function cho AI extraction dài hạn; cần external worker/durable job lease + retry + heartbeat trước khi enable cloud.

---

# 7. Runtime and Storage integration

## 7.1. Local / Electron

- Storage driver: filesystem.
- Root user-facing: `input/`, `output/`.
- Internal state: `.system/`.
- Electron root phải ở `app.getPath('userData')` thông qua cấu hình hiện có (`TOOLS_DATA_DIR`/`PDF_DATA_DIR` resolution); không ghi vào thư mục cài đặt.
- Open artifact dùng `artifact.localPath` + `openLocalPath()`.
- Native picker/open/reveal thông qua Electron preload/IPC allowlist; renderer không import `fs` hoặc `path`.

## 7.2. Cloud / Vercel

- Default Storage: TM Hub Storage Gateway, SDK `tm-hub-client@1.1.0`.
- Explicit override: self-owned R2 nếu `DOCUMENT_STORAGE_DRIVER=r2` và credentials cấu hình đầy đủ.
- Job metadata: Postgres/Neon theo kiến trúc hiện tại.
- Input upload: direct upload grant; không proxy file body lớn qua Function.
- Artifact download từ Hub: Nitro xin signed grant server-side và stream response; không đưa signed read URL đến browser.
- `/tmp` chỉ scratch trong một invocation. Nếu không có durable storage, chỉ hỗ trợ endpoint single-request `/run` với inline result và size limit; không giả vờ có durable Activity.

## 7.3. Hub contract

Giữ đúng SDK v1.1.0:

```ts
hub.storage.connections()
hub.storage.initUpload(input)
hub.storage.completeUpload(uploadId)
hub.storage.abortUpload(uploadId)
hub.storage.createDownloadGrant(objectId)
hub.storage.getObject(objectId)
hub.storage.listObjects(params)
hub.storage.listFolders(params)
hub.storage.deleteObject(objectId)
hub.storage.copyObject(objectId, input)
hub.storage.createFolder(input)
hub.storage.deleteFolder(input)
```

`getAppSecret` chỉ được truyền từ server runtime config. Mỗi request Hub storage cần app identity + caller authorization theo middleware/storage policy hiện tại. Không tự viết URL Hub bằng `$fetch` khi `HubClient.storage` đã cung cấp contract.

Multipart chưa được SDK/gateway quảng bá ở capability hiện tại; không tự xây flow multipart trên Hub. Capability phải đọc từ Hub connection/provider capabilities.

---

# 8. Security, ownership and validation

- Mọi document API cần user JWT hợp lệ và app claim `tm-tools`.
- `documentCaller()` hoặc helper hiện tại là nguồn caller/owner; không nhận owner ID từ body/query.
- Mọi job/artifact/library operation được owner-scoped; nếu product hiện tại có tenant scope thì giữ tenant boundary.
- Storage secret, Hub App Secret, object key, signed URL, absolute path không đi vào browser logs/telemetry.
- Validate path traversal, encoded traversal, backslash, NUL/control chars, symlink escape.
- Verify actual object length and allowed content type at upload completion.
- Validate magic bytes where format supports it; extension/MIME alone không đủ với định dạng rủi ro.
- Preview response dùng `X-Content-Type-Options: nosniff`, authenticated authorization, `Cache-Control: no-store`; chỉ inline MIME allowlist.
- Không phục vụ HTML/XML/Office/JSON như active content từ same-origin viewer thiếu sandbox. Viewer phải dùng renderer an toàn.
- Destructive actions yêu cầu confirmation, audit event, trash/retention policy phù hợp.

---

# 9. Backward compatibility

Trong giai đoạn chuyển tiếp:

- `/pdf/extract` → redirect `/document-studio/tools/extract`.
- `/pdf/library` → redirect `/document-studio/library`.
- Các legacy PDF pages khác có thể redirect về operation slug tương ứng sau khi parity; nếu vẫn có hành vi chưa có v4 equivalent thì giữ route/compat adapter cho đến khi hoàn thành.
- `/api/v1/pdf/**` không xóa ngay. Chuyển các route cần thiết thành thin adapter tới Document domain hoặc giữ behavior cũ trong thời gian parity test.
- `usePdfStudio`, `usePdfExplorer`, `PdfFileArea`, `PdfFileInfo` được đánh dấu legacy; không dùng trong `document-studio` pages mới.
- Existing `/api/v1/documents/**` contracts không thay đổi breaking trong migration nếu không có versioning và test tương ứng.

Chi tiết sequence và dữ liệu legacy nằm trong `DOCUMENT-STUDIO-LEGACY-MIGRATION-PLAN-v5.md`.

---

# 10. Definition of Done

Document Studio v5 chỉ hoàn tất khi:

1. Chỉ còn hai library root user-facing `input` và `output`; `.system` là internal.
2. Không có page active nào dưới `app/pages/pdf/` cho chức năng đã migrate; old routes redirect hoặc compatibility adapter.
3. Library dùng cùng một list/detail/preview/action component cho input và output.
4. Mọi Operation/Conversion pair hiển thị có executor thực tế, schema validation và runtime capability.
5. `document.ai-extract` có page trong Document Studio, giữ provider/model picker, prompt preset management, export format selection, checkpoint/force/overwrite, progress/cancel và artifacts.
6. Activity trên local/Electron mở file thật bằng OS handler khi có `localPath`; preview nội bộ vẫn giới hạn MIME an toàn; download là action riêng.
7. Local/Electron không cần Hub Storage secret hoặc cloud DB.
8. Cloud dùng Hub Storage v1.1.0 hoặc R2 explicit override, secret stays server-side, Postgres bền vững; không dùng Vercel `/tmp` làm durable storage.
9. Migration legacy chạy idempotent, có report, checksum verification, no-overwrite collision policy, rollback và backup; không mất file/preset/checkpoint/trash/audit.
10. `pnpm typecheck`, `pnpm test:unit`, `pnpm lint`, `pnpm build`, `pnpm check:hygiene` pass; test UI và runtime matrix pass.
11. Docs và `PHASE-STATUS.md` cập nhật bằng evidence thực tế; phân biệt `implemented`, `unit-tested`, `integration-tested`, `deployed`.

---

# 11. Nguồn code hiện tại cần kế thừa

| Concern | Current source |
|---|---|
| Document API / jobs | `server/api/v1/documents/**`, `server/modules/document/**` |
| Operation definitions | `server/modules/document/operations.ts` |
| Existing executors | `server/modules/document/executors.ts` |
| Shared document contracts | `shared/types/document/index.ts` |
| Frontend operation catalogue | `app/utils/documentStudio.ts` |
| Document Studio pages | `app/pages/document-studio/**` |
| Activity page | `app/pages/document-studio/activity.vue` |
| Old extraction UI | `app/pages/pdf/extract.vue` |
| Old library UI | `app/pages/pdf/library.vue` |
| AI provider catalogue | `server/modules/pdf/extract/models.ts`, `server/utils/aiRelay.ts` |
| AI prompting/response | `server/modules/pdf/extract/provider.ts`, `prompt.ts`, `normalize.ts` |
| AI presets | `server/modules/pdf/extract/presets.ts` |
| AI job/checkpoints | `server/modules/pdf/extract/jobs.ts`, `job-store.ts`, `checkpoint.ts` |
| Hub storage client/provider | `server/utils/hubStorage.ts`, `server/modules/document/hub-storage.ts` |
| Local paths/storage | `server/modules/document/paths.ts`, `storage.ts`, `runtime-context.ts` |
| Desktop open/preview | `app/utils/desktop.ts`, Electron preload/main IPC |
| Artifact download/inline | `server/api/v1/documents/jobs/[jobId]/artifacts/[artifactId]/download.get.ts` |

---

## Final instruction

Hãy xem v5 là kiến trúc sản phẩm đích nhưng thực thi theo từng phase. Không tạo một bản v5 thứ hai song song với v4; không rewrite engine ổn định chỉ để đổi tên file; không di chuyển dữ liệu trước khi có migration tool; không đánh dấu tính năng hoàn tất khi mới có page hoặc mock. Mục tiêu là **mở rộng operation và format bằng registry + executor + capability**, để một format mới không buộc phải tạo thêm một cây thư mục hoặc một hệ thống quản lý file riêng.
