# TM Document Studio v4 – Completion & Cloud Deployment Runbook

> **Tài liệu tiếp nối v4 dành cho AI Coding Agent.**
>
> Mục tiêu: hoàn tất các hạng mục Phase 5–9 còn pending của `TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md`, chốt các quyết định database/storage, sửa deployment Vercel một cách có bằng chứng, giữ AI Extraction trên `/pdf/extract`, và xác minh đúng mức những gì đã test được.
>
> **Không phải tài liệu thiết kế lại sản phẩm.** Đây là execution guide để hoàn thành codebase hiện tại dựa trên trạng thái được người dùng cung cấp ngày **2026-11-06**.

---

## 0. Cách sử dụng và thứ tự ưu tiên tài liệu

### 0.1. Tài liệu nền

AI phải đọc:

1. `TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md` – kiến trúc sản phẩm/runtime nền tảng.
2. Tài liệu này – quyết định và checklist hoàn thiện Phase 5–9.
3. `package.json`, lockfile, `nuxt.config.ts`, `tsconfig*.json`, `vercel.json`, `electron/`, `server/`, `shared/`, cấu hình auth và database hiện có.
4. Các audit/report/test đang có trong `docs/`.

Nếu tài liệu v4 có phần chưa quyết định, **tài liệu này chốt quyết định cho Phase 5–9**. Nếu code thực tế khác, AI phải ghi bằng chứng trong audit và chọn cách triển khai ít phá vỡ nhất; không được âm thầm bỏ qua yêu cầu.

### 0.2. Trạng thái thực tế được xác nhận bởi người dùng

Không được viết lại lịch sử hoặc đánh dấu sai trạng thái:

| Hạng mục | Trạng thái ngày 2026-11-06 | Cách xử lý |
|---|---|---|
| Phase 0–4 | Đã được giao/đã có một phần triển khai theo báo cáo trước | Audit lại bằng chứng, không mặc định mọi tiêu chí đều đạt |
| Phase 5 – Cloud DB + Storage | **PENDING** | Chọn DB, storage provider và triển khai |
| Phase 6 – Vercel cloud runtime/deploy | **PENDING** | Sửa config, build, deploy preview, smoke test |
| Phase 7 – AI Extraction cloud migration | **PENDING** | Giữ route `/pdf/extract`, chuyển persistence/storage |
| Phase 8 – Activity/retention/cleanup/worker | **PENDING** | Hoàn tất lifecycle và cleanup |
| Phase 9 – Legacy retirement/regression | **PENDING** | Chỉ retire sau khi parity và regression đạt |
| `vercel.json` | **VẪN CHƯA ĐÚNG** theo báo cáo người dùng | Audit và sửa theo framework/Nitro thực tế |
| 289 file `.js` phát sinh trong source tree | Đã xóa; các file đó được xác nhận không tracked | Giữ kiểm tra chống tái phát; không broad-ignore mọi `.js` |
| `Cannot add property setup` | Đã được báo cáo có liên quan 289 emitted `.js` shadowing source; không được tự suy diễn thêm | Reproduce từ clean build và lưu full stack/log; không patch mò |
| Cloud runtime | Ném `DOCUMENT_RUNTIME_NOT_SUPPORTED` theo thiết kế hiện tại | Chỉ gỡ chặn sau khi provider và runtime adapter thực sự hoạt động |
| AI Extraction | Phải tiếp tục dùng `/pdf/extract` | Không chuyển sang route thay thế hoặc viết lại engine |
| Signed-in browser pass | **CHƯA THỰC HIỆN** | Không dùng seed credentials; không bypass auth; ghi rõ chưa được xác minh UI có session |
| Bằng chứng hiện có | Compile, API smoke, specs | Đây không phải bằng chứng cho authenticated visual flow |

### 0.3. Những điều AI tuyệt đối không được làm

- Không hỏi người dùng gửi mật khẩu, seed credentials, session cookie, access token hoặc private key.
- Không dùng credential seed có sẵn trong repo, log hoặc file test để đăng nhập vào tài khoản thật.
- Không tắt authentication/authorization chỉ để làm browser test xanh.
- Không biến API `401` khi không có session thành lỗi cần bypass. Với protected route, `401` là expected behavior.
- Không đánh dấu authenticated browser pass là DONE nếu không có session kiểm thử được cấp hợp lệ hoặc user tự đăng nhập trong phiên manual test.
- Không chuyển AI Extraction khỏi `/pdf/extract`.
- Không thêm MongoDB nếu không có quyết định mới được ghi nhận. Quyết định mặc định tại §1 là PostgreSQL.
- Không dùng Vercel Blob Private làm provider mặc định cho file lớn. Quyết định storage hiện hành tại §2.0: TM Hub Storage Gateway là driver mặc định, R2 là driver tự sở hữu bucket.
- Không lưu job state production trong RAM, module-level Map hoặc global variable.
- Không dùng `/tmp` làm persistent storage hoặc giả định Function invocation sau sẽ thấy file của invocation trước.
- Không chạy process nền bằng `setTimeout`, promise không await hoặc detached child process trong Vercel Function rồi kỳ vọng nó tiếp tục sau response.
- Không xóa thư mục dữ liệu legacy hoặc đổi tên `.data/pdf` tự động.
- Không dùng `git clean -xfd`, `find ... -delete`, `del /s *.js` hoặc lệnh destructive tương tự khi chưa liệt kê và xác nhận chính xác target.
- Không sửa `node_modules` trực tiếp để che lỗi dependency/configuration.

---

# 1. Quyết định kiến trúc Phase 5 – Database cho Job State

## 1.1. Quyết định mặc định: PostgreSQL, triển khai cloud bằng Neon

**Chọn PostgreSQL làm database chuẩn cho cloud job metadata. Chọn Neon PostgreSQL qua Vercel Marketplace làm implementation mặc định cho môi trường Vercel. Không chọn MongoDB cho Phase 5 mới.**

Lý do:

1. Job, input files, output artifacts, upload intents, event log, cleanup state và worker lease có quan hệ rõ ràng.
2. Cần transaction khi hoàn tất upload, tạo job, publish artifact hoặc chuyển trạng thái.
3. Cần unique constraint/idempotency key để không tạo job/artifact trùng khi retry.
4. Cần index theo owner, status, expiry, lease và created time.
5. Cần update có điều kiện khi claim job/lease để ngăn hai worker cùng xử lý.
6. PostgreSQL JSONB vẫn cho phép lưu operation config linh hoạt mà không mất kiểm soát quan hệ chính.
7. Neon có Vercel Marketplace integration; Vercel hiện hướng ứng dụng mới tới Postgres provider qua Marketplace thay vì Vercel Postgres cũ.

Tài liệu tham khảo:
- Vercel Postgres hiện được thay bằng external Postgres Marketplace providers: https://vercel.com/docs/postgres
- Neon/Vercel integration và preview branching: https://neon.com/docs/guides/vercel
- Serverless Postgres connection pooling: https://neon.com/docs/connect/connection-pooling

## 1.2. Không dùng MongoDB trong implementation mặc định

Không thêm `mongoose`, `mongodb` hoặc MongoDB Atlas riêng chỉ để lưu Document Jobs.

Chỉ được xem xét MongoDB nếu audit chứng minh **TM Tools hiện đã có một MongoDB production database đang được sử dụng thật**, có connection lifecycle/secret management/serverless connection pooling phù hợp và việc dùng Postgres sẽ tạo ra hệ thống DB thứ hai không cần thiết. Nếu gặp trường hợp đó:

1. Dừng trước khi thêm dependency/database mới.
2. Ghi rõ database hiện có, collections, indexes, ownership, transaction và TTL capabilities.
3. So sánh cost/risk với Neon Postgres.
4. Trình bày bằng chứng và đề xuất cho project owner quyết định.
5. Không tự đổi quyết định mặc định trong tài liệu này chỉ vì thấy một package MongoDB trong `package.json`.

Không được kết nối thẳng vào database nội bộ của TM Hub chỉ vì đã có TM Hub authentication. TM Hub tiếp tục là auth/control plane/AI relay. Document Studio có database metadata riêng, trừ khi kiến trúc hiện tại đã có một service public được phê duyệt cho use case này.

## 1.3. Phân chia database theo runtime

- **Vercel Cloud:** Neon PostgreSQL là nguồn dữ liệu bền vững cho jobs, input records, artifacts, upload sessions và cleanup tasks.
- **Dev/Electron Local:** tiếp tục dùng local persistence provider hiện có nếu đã ổn định. Nếu chưa có local persistent provider, tạo `LocalJobRepository` nhỏ dùng file metadata atomic trong `.data/pdf/.system/jobs/`; không bắt Electron phải kết nối Neon để xử lý file local.
- Cả hai implementation phải thực hiện cùng `JobRepository` interface và cùng state transition rules.
- Không dùng local JSON repository cho Vercel production.
- Không để local repository và cloud PostgreSQL implementation phát sinh hai bộ business rules khác nhau.

## 1.4. Database access layer

Audit ORM/query library đang dùng. Nếu dự án đã có query layer tương thích PostgreSQL thì tái sử dụng. Nếu chưa có, dùng một PostgreSQL query layer có migration rõ ràng (khuyến nghị Drizzle + `postgres`/Neon serverless driver nếu tương thích Node runtime của dự án).

Không thêm nhiều ORM cùng lúc.

Quy tắc kết nối:

- Dùng pooled connection string cho serverless runtime.
- Dùng direct connection string chỉ cho migration/administrative tasks khi provider yêu cầu.
- Không khởi tạo một connection pool lớn trong mỗi request.
- Tái sử dụng client/pool theo khuyến nghị SDK/serverless provider.
- `DATABASE_URL` và các credential chỉ server-side.
- Migration chạy trong release/deploy pipeline hoặc lệnh quản trị riêng, không tự chạy toàn bộ migration trong mọi Function invocation.
- Mọi query chứa `ownerId` lấy từ session/JWT đã xác minh server-side; không tin `ownerId` body/query từ client.

## 1.5. Logical schema tối thiểu

Schema dưới đây là yêu cầu domain. Tên table/cột có thể theo convention repository, nhưng quan hệ và constraint phải tương đương.

### `document_jobs`

| Field | Type | Mục đích |
|---|---|---|
| `id` | UUID PK | Job ID |
| `owner_id` | TEXT/UUID NOT NULL | Chủ sở hữu lấy từ auth |
| `operation_id` | TEXT NOT NULL | `split`, `merge`, `extract`, ... |
| `runtime` | TEXT NOT NULL | `vercel`, `local`, `electron`, `worker` |
| `status` | TEXT/ENUM NOT NULL | State machine §5 |
| `idempotency_key` | TEXT NULL | Chặn request lặp |
| `config_json` | JSONB NOT NULL | Snapshot operation config đã validate |
| `progress_total` | INTEGER NOT NULL DEFAULT 0 | Tổng unit |
| `progress_completed` | INTEGER NOT NULL DEFAULT 0 | Unit hoàn thành |
| `progress_failed` | INTEGER NOT NULL DEFAULT 0 | Unit lỗi |
| `attempt` | INTEGER NOT NULL DEFAULT 0 | Số lần chạy |
| `max_attempts` | INTEGER NOT NULL DEFAULT 1 | Số retry tối đa |
| `lease_owner` | TEXT NULL | Worker đang giữ job |
| `lease_expires_at` | TIMESTAMPTZ NULL | Hạn lease |
| `cancel_requested_at` | TIMESTAMPTZ NULL | Yêu cầu hủy |
| `error_code` | TEXT NULL | Mã lỗi an toàn |
| `error_message_safe` | TEXT NULL | Message đã sanitize |
| `created_at` | TIMESTAMPTZ NOT NULL | Ngày tạo |
| `started_at` | TIMESTAMPTZ NULL | Bắt đầu |
| `finished_at` | TIMESTAMPTZ NULL | Kết thúc |
| `expires_at` | TIMESTAMPTZ NOT NULL | Expiry policy |
| `updated_at` | TIMESTAMPTZ NOT NULL | Cập nhật |

Indexes/constraints:

- `(owner_id, created_at DESC)` cho history.
- `(status, created_at)` cho queue scan.
- `(status, lease_expires_at)` cho lease recovery.
- `(expires_at)` cho cleanup.
- Unique `(owner_id, idempotency_key)` khi idempotency key khác null.

### `document_job_inputs`

- `id` UUID PK.
- `job_id` FK → `document_jobs.id` ON DELETE CASCADE.
- `owner_id` để query ownership an toàn/nhanh; đồng bộ với job bằng transaction.
- `storage_provider` (`local`, `r2`, future provider).
- `storage_key` – opaque object key/path, không phải public URL.
- `original_name` – tên file do user cung cấp, sanitize khi hiển thị/export.
- `mime_type_detected` – MIME thực xác định server-side.
- `size_bytes`.
- `sha256` nullable trước finalize, required khi finalize nếu policy yêu cầu.
- `upload_status` (`pending`, `uploading`, `uploaded`, `verified`, `rejected`, `expired`).
- `created_at`, `verified_at`, `expires_at`.

### `document_artifacts`

- `id` UUID PK.
- `job_id` FK.
- `owner_id`.
- `storage_provider`.
- `storage_key`.
- `file_name`.
- `mime_type`.
- `size_bytes`.
- `sha256` nullable/verified.
- `artifact_status` (`publishing`, `ready`, `delete_pending`, `deleted`, `expired`).
- `created_at`, `expires_at`, `deleted_at`.

### `document_job_events`

- `id` UUID PK hoặc BIGSERIAL.
- `job_id` FK.
- `owner_id`.
- `event_type`.
- `payload_safe_json` JSONB – chỉ metadata, không có secret hoặc file content.
- `created_at`.

### `document_upload_sessions` (nếu upload provider cần lifecycle riêng)

- `id`, `job_id`, `input_id`, `provider_upload_id`, `storage_key`, `upload_mode` (`single`, `multipart`), `status`, `parts_json` (chỉ lưu part number + ETag, không lưu token), `expires_at`, `created_at`, `updated_at`.

Không lưu presigned URL trong database, vì URL mang quyền truy cập tạm thời. Không lưu R2 secret/access key trong record.

## 1.6. Transaction boundaries

Các bước dưới đây phải đảm bảo consistency:

1. Create job + inputs + upload intents: một transaction.
2. Finalize upload: verify object ở storage trước; sau đó transaction đổi input `uploaded → verified`, update job `uploading → queued/ready` và tạo event.
3. Claim job: conditional update/transaction acquire lease.
4. Publish output: upload object trước; sau đó transaction insert artifact và cập nhật job. Nếu DB commit thất bại sau upload object, phải có orphan cleanup.
5. Delete/expire artifact: đánh dấu `delete_pending`, xóa storage object, rồi đánh dấu `deleted`; retry nếu xóa storage lỗi.

Không giữ DB transaction mở trong khi xử lý PDF/OCR/AI hoặc upload/download object lớn.

---

# 2. Quyết định Phase 5 – Cloud Object Storage

## 2.0. Cập nhật 2026-11-07 — Hub Storage Gateway là driver mặc định

Quyết định Phase 5 ban đầu (Cloudflare R2) vẫn đúng về kỹ thuật nhưng không còn
là mặc định. Thứ tự chọn driver hiện tại:

| Ưu tiên | Driver | Khi nào dùng | Ai giữ credential provider |
|---:|---|---|---|
| 1 | `hub` | Deployment cloud có Storage Connection trên TM Hub | TM Hub; tm-tools chỉ giữ `NUXT_HUB_APP_SECRET` |
| 2 | `r2` | Deployment tự sở hữu bucket (single-host/self-host) | tm-tools (`R2_*`) |
| 3 | — (ephemeral) | Cloud không có connection nào khả dụng | không ai; `/tmp` chỉ sống trong một request |

- `DOCUMENT_STORAGE_DRIVER=auto` chọn `hub` khi có `NUXT_PUBLIC_HUB_URL` +
  `NUXT_HUB_APP_SECRET`, ngược lại chọn `r2` khi bộ `R2_*` đầy đủ. Hub đứng
  trước vì Hub giữ credential provider; deployment tự sở hữu bucket đặt
  `DOCUMENT_STORAGE_DRIVER=r2` để ghi đè.
- Chọn `hub` không đồng nghĩa Hub đã cho phép: mỗi lần gọi Hub đều kiểm tra App
  Secret, token người dùng và Storage grant. `DOCUMENT_STORAGE_CONNECTION_ID`
  chỉ là gợi ý, không phải quyền.
- Gateway đã có thật (kiểm 2026-11-07 với tm-hub local, app `tm-tools_nttweh`):
  base `/api/v1/apps/:appId/storage`, gồm `GET /connections`, `POST /uploads/initiate`,
  `POST /uploads/:id/complete`, `POST /uploads/:id/abort`, `GET /objects/:id`,
  `POST /objects/:id/download-grant`, `DELETE /objects/:id`. Envelope thành công
  `{ success: true, data }`, lỗi `{ error: true, statusMessage: 'storage.*' }`;
  grant upload sống 900 s, grant download 300 s, object tối đa 5 GB, upload một
  `PUT` (`transferMode`, không có multipart). tm-tools lưu `objectId` làm handle
  bền vững, không lưu bucket/key.
  `GET /connections` trả **200 với 0 connection** trong môi trường này, vì
  Storage Connection do người vận hành Hub tạo; thiếu connection thì provider
  trả `DOCUMENT_STORAGE_NOT_CONFIGURED` (`reason: no-hub-storage-connection`)
  chứ không tự bịa.
- Cloud không có driver khả dụng → `storageMode() = 'ephemeral'`:
  `/api/v1/documents/run` chạy trọn job trong một request và trả bytes base64
  inline (cap 3 MB, nằm dưới payload 4.5 MB của Vercel). Route địa chỉ job theo
  id trả `DOCUMENT_RUNTIME_NOT_SUPPORTED` với reason
  `use-single-request-run` thay vì 404 giả. Đây là chế độ tạm thời, không phải
  persistence: bytes không tồn tại ở request sau.
- Không bao giờ rơi âm thầm: `/api/v1/documents/health` trả
  `storage.driver` (`hub`/`r2`/`local`/`none`), `storage.mode`
  (`durable`/`ephemeral`) và `storage.ephemeral`, nên deployment tự khai báo
  mình đang ở đâu.
- Ranh giới bảo mật: renderer không bao giờ thấy App Secret, connection string
  hay bucket key. Hai loại grant có đường đi khác nhau:
  - **Upload:** Nitro xin `POST /uploads/initiate` rồi trả grant ngắn hạn (URL +
    headers) cho browser đã đăng nhập; browser `PUT` thẳng lên provider. Nitro
    gọi lại `POST /uploads/:id/complete` để Hub HEAD-verify và chốt `objectId`.
  - **Download:** grant chỉ nằm ở server; route tải đã xác thực stream bytes qua
    `POST /objects/:id/download-grant`, không trả URL ký cho browser.
  Grant là bearer credential: không lưu DB, không log, không xuất hiện trong
  thông báo lỗi — Hub error chỉ giữ `statusMessage` đã chuẩn hoá.

## 2.1. Driver `r2` — Cloudflare R2 Private Bucket

**Khi `DOCUMENT_STORAGE_DRIVER=r2` (deployment tự sở hữu bucket), Cloudflare R2
là provider mặc định; Vercel Blob Private không được dùng.** Các đặc điểm dưới
đây là lý do driver này vẫn được giữ song song với `hub`.

Lý do:

- R2 có S3-compatible API, cho phép dùng AWS SDK v3 và presigned URL.
- Browser upload/download trực tiếp không phải đi qua Vercel Function proxy.
- Hỗ trợ multipart upload cho file lớn và upload có thể retry theo part.
- Object có thể được quản lý bằng key opaque và metadata trong PostgreSQL.
- Có object lifecycle rules để xóa object theo prefix/age và abort incomplete multipart uploads.
- Không gắn domain model vào Vercel Blob SDK.

Tài liệu chính thức:
- R2 S3 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- R2 upload/multipart: https://developers.cloudflare.com/r2/objects/upload-objects/
- R2 lifecycle: https://developers.cloudflare.com/r2/buckets/object-lifecycles/

## 2.2. Bucket policy

- Tạo bucket riêng cho Document Studio cloud, ví dụ `tm-document-studio-private`.
- Bucket **không public**; không bật public development domain cho tài liệu user.
- Chia prefix theo environment: `dev/`, `preview/`, `production/` hoặc tách bucket riêng nếu có thể.
- Object key phải chứa opaque owner ID/job ID/input/artifact ID; không đưa email, tên thật, access token hoặc thông tin cá nhân vào key.
- Ví dụ:

```text
production/users/{opaqueOwnerId}/jobs/{jobId}/inputs/{inputId}/{safeFileName}
production/users/{opaqueOwnerId}/jobs/{jobId}/outputs/{artifactId}/{safeFileName}
```

- Không dùng original filename làm object key duy nhất.
- Không cho client gửi object key tùy ý để server ký URL.
- Server tự tạo key sau khi xác thực session, quota và operation.

## 2.3. R2 single upload và multipart

Theo tài liệu R2 hiện tại:

- Single upload phù hợp file nhỏ/vừa; giới hạn single upload được docs nêu là tối đa 5 GiB.
- Multipart upload hỗ trợ object tối đa 5 TiB, tối đa 10.000 parts; part thường từ 5 MiB đến 5 GiB và các part không phải part cuối phải cùng kích thước.
- Dùng multipart cho file lớn, cần resumability/retry hoặc upload song song.
- Incomplete multipart upload mặc định có lifecycle abort sau 7 ngày; nên cấu hình rule phù hợp hơn cho prefix tạm nếu cần.

Không hard-code các giới hạn provider như business validation duy nhất; giữ các ngưỡng ở runtime/storage capability config và kiểm tra lại docs trước production.

## 2.4. Presigned URL security

Với driver `r2`:

- Server tạo presigned PUT/GET/HEAD/DELETE cho đúng một object key và method được phép.
- TTL ngắn (ví dụ upload 5–10 phút, download 1–5 phút; có thể cấu hình).
- Presigned URL là bearer credential: ai có URL có thể sử dụng trong thời gian hiệu lực; không log URL, không lưu URL trong DB, không đưa URL vào analytics.
- Ký Content-Type và các header quan trọng khi phù hợp; client phải gửi đúng headers.
- CORS bucket chỉ cho phép origin web app cần thiết; chỉ methods/headers thực tế dùng.
- Không bật `*` CORS trên production nếu không có lý do và approval.
- Không gửi R2 access key/secret xuống browser.
- Endpoint cấp URL phải xác thực người dùng, ownership và quota trước.
- Không cho phép client đặt prefix hoặc owner ID tùy ý.

Với driver `hub`:

- Grant upload/download do Hub cấp, TTL do Hub quy định; tm-tools không ký URL.
- Grant chỉ đi tới browser khi brief §6.1 cho phép; upload nhỏ đi qua proxy
  `PUT /api/v1/documents/jobs/{jobId}/inputs/{inputId}/content` để grant không
  bao giờ tới renderer.
- `HubStorageError` chỉ giữ `requestId`/`code` và message đã redact mọi URL
  (`safeHubMessage`), vì message Hub có thể echo chính grant URL đã ký.
- Không log, không lưu DB, không trả `X-App-Secret`.

## 2.5. Large upload workflow

Với file dưới ngưỡng single-upload cấu hình:

1. Client gọi create job / create upload intent.
2. Server xác thực và tạo opaque key.
3. Server trả presigned PUT URL và headers cần thiết.
4. Browser upload trực tiếp tới R2.
5. Client gọi finalize.
6. Server HEAD object, xác minh size, metadata, key/owner, và checksum nếu có.
7. Chỉ sau verify mới cho phép processing.

Với multipart:

1. Server tạo multipart upload thông qua S3 API và ghi `provider_upload_id` vào DB.
2. Server cấp presigned URL cho từng part hoặc batch part theo size/chunk policy.
3. Browser upload parts; retry chỉ part lỗi.
4. Client gửi danh sách part number + ETag về finalize endpoint.
5. Server verify danh sách part/ETag với upload session đã cấp rồi gọi CompleteMultipartUpload.
6. Server HEAD object cuối, verify size/checksum, đánh dấu input verified.
7. Khi upload hủy/thất bại, server gọi AbortMultipartUpload; lifecycle R2 là lớp fallback cho upload orphan.

Lưu ý: presigned URL docs của R2 liệt kê PUT/GET/HEAD/DELETE; không giả định có HTML form POST multipart. Multipart phải đi qua S3 multipart API.

## 2.6. Private download

- Client gọi authenticated artifact download endpoint.
- Server query artifact theo `artifactId + ownerId`; không lấy storage key từ client.
- Nếu artifact `ready` và chưa hết hạn, server tạo presigned GET URL ngắn hạn hoặc proxy stream nếu cần kiểm soát nâng cao.
- Browser tải từ R2 qua URL được ký.
- Không dùng public URL.
- Không cho tải artifact của owner khác bằng cách thay ID.

## 2.7. Object lifecycle

Cấu hình R2 lifecycle theo prefix:

- `*/jobs/*/inputs/`: expire theo input retention (ví dụ 24 giờ sau job thành công; longer khi failed/retry policy cần input).
- `*/jobs/*/outputs/`: expire theo result retention (ví dụ 24–72 giờ theo product setting mặc định).
- Incomplete multipart: abort sớm hơn mặc định nếu phù hợp (ví dụ 1 ngày).
- Không dùng một lifecycle rule quá rộng có thể xóa input/output còn hạn.

R2 lifecycle expiration không phải xóa tức thì: docs nói object thường được xóa trong vòng 24 giờ kể từ expiration timestamp và có thể chậm hơn với lượng lớn. Vì vậy:

- Explicit user delete / job-complete cleanup phải xóa object qua API ngay.
- Lifecycle chỉ là safety net cho object orphan/expired.
- Database cleanup worker vẫn phải retry xóa object chưa xóa.

---

# 3. Vercel Deployment – xử lý triệt để `vercel.json`

## 3.1. Bắt đầu bằng audit, không đoán cấu hình

`vercel.json` được báo cáo vẫn sai. AI phải thu thập bằng chứng trước khi chỉnh:

1. In nội dung root `vercel.json` và validate JSON syntax.
2. Tìm `now.json`, `vercel.ts`, `vercel.json` lồng trong các thư mục, config ở workspace/package root.
3. Đọc `package.json` scripts, package manager và lockfile.
4. Đọc `nuxt.config.ts`, Nitro preset/config và version Nuxt/Nitro.
5. Đọc Vercel Project Settings nếu có quyền; nếu không có, ghi rõ phần không thể xác minh và hỏi user thao tác thủ công sau khi chuẩn bị hướng dẫn.
6. Xác minh Root Directory trong Vercel project có đúng thư mục package Nuxt không.
7. Kiểm tra Framework Preset đang là Nuxt hay Other.
8. Kiểm tra Build Command, Install Command, Output Directory và Node.js Version override trong Dashboard.
9. Kiểm tra có `builds` custom builder, `routes`, `rewrites`, `outputDirectory`, `framework` override hoặc `functions` glob không.
10. Lưu full build log và full stack trace của `Cannot add property setup` trong audit report.

Không được nói `vercel.json` sai do một key cụ thể nếu chưa chứng minh từ schema/log.

## 3.2. Quyết định cấu hình chuẩn cho Nuxt/Nitro

Tài liệu Vercel và Nitro hiện mô tả Nuxt/Nitro deployment là có thể tự detect/zero configuration trong đường triển khai tiêu chuẩn.

Do đó:

- Ưu tiên Vercel Framework Preset `Nuxt` và auto-detected build settings.
- Ưu tiên Nitro Vercel provider/preset đúng theo version hiện cài.
- Không tự dựng custom `builds` array nếu không có yêu cầu rõ ràng.
- Không ép `outputDirectory` thủ công nếu Nitro/Vercel tự tạo output đúng.
- Không thêm `setup` vào root `vercel.json`; đây không phải key cấu hình Vercel chuẩn được tài liệu project configuration liệt kê.
- Không dùng đồng thời `builds` và `functions`; Vercel phân biệt hai cách cấu hình này và không cho phối hợp trong cùng config.
- Không copy config mẫu Next.js sang Nuxt.

Nguồn:
- Nuxt on Vercel: https://vercel.com/docs/frameworks/full-stack/nuxt
- Nitro Vercel provider: https://nitro.build/deploy/providers/vercel
- Vercel project configuration: https://vercel.com/docs/project-configuration
- `vercel.json`: https://vercel.com/docs/project-configuration/vercel-json

## 3.3. Baseline `vercel.json`

Nếu audit chứng minh project không cần custom redirects/headers/rewrites/crons/functions, **ưu tiên xóa root `vercel.json` và để Vercel/Nitro auto-detect**.

Nếu team muốn giữ file chỉ để schema validation, file tối thiểu có thể là:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json"
}
```

Đây là baseline, không phải yêu cầu bắt buộc phải có file.

Nếu cần `crons`, `headers`, `redirects` hoặc `functions`, chỉ thêm đúng property được docs hỗ trợ, đúng route/function glob đã xác minh. Không thêm `setup`, `builds` hoặc custom `routes` theo suy đoán.

## 3.4. Quy tắc khi cần Function duration

- Trước tiên xác định Nitro tạo function route/path nào trên Vercel.
- Ưu tiên cấu hình duration theo hướng dẫn của Nitro/Vercel cho đúng version framework.
- Chỉ đặt `functions` config trong `vercel.json` khi đã xác minh glob match output function thực tế.
- Không copy glob Next.js `api/**` nếu project không dùng Next.js.
- Không cấu hình thời gian tối đa để biến request thành durable background job.
- Nếu function vượt runtime/resource policy, chuyển operation sang worker adapter; không chỉ tăng timeout.

## 3.5. Xử lý 289 emitted `.js` files và lỗi `Cannot add property setup`

Trạng thái do user cung cấp: 289 `.js` files phát sinh ngoài ý muốn đã bị xóa; các file đó là ignored và không tracked. Phải duy trì trạng thái sạch đó.

AI thực hiện:

1. Chạy `git status --short`.
2. Chạy `git ls-files '*.js'` để kiểm tra file JS được Git track; **không yêu cầu kết quả bằng 0**, vì repository có thể có JS source hợp lệ.
3. Kiểm tra untracked/unignored hoặc ignored generated JS trong source tree (bỏ qua `node_modules`, `.nuxt`, `.output`, `.vercel`, `dist`, `coverage` theo đúng cấu trúc project).
4. Xác định script/lệnh đã emit 289 file; audit `tsconfig*.json`.
5. Typecheck phải chạy no-emit (`tsc --noEmit` hoặc project script tương đương).
6. Nếu compiler/tool cần emit, output phải vào thư mục build riêng, không cạnh file `.ts` nguồn.
7. Không thêm pattern `.js` rộng vào `.gitignore`; có thể làm mất khả năng track JavaScript source thật.
8. Thêm test/build hygiene check để phát hiện source-tree pollution sau typecheck/build.
9. Không chạy lệnh xóa hàng loạt `.js` khi chưa in exact file list và phân biệt source/generated.
10. Sau clean build, so sánh `git status`, kiểm tra count file generated, xác nhận không sinh lại sibling `.js`.

Với lỗi `Cannot add property setup`:

- Không kết luận lỗi chắc chắn do 289 files nếu hiện tại chưa tái hiện hoặc chưa có stack trace xác nhận.
- Re-run trong clean worktree/clean install với lockfile giữ nguyên.
- Lưu command, Node version, package manager version, Vercel CLI version, Nuxt/Nitro version và full stack trace.
- Xác định module/object cụ thể đang cố thêm property `setup` vào object không extensible/read-only.
- Nếu lỗi xuất phát từ generated source resolution, fix build output pollution và resolution order.
- Nếu lỗi xuất phát từ package incompatibility, xác định version pair rồi pin/upgrade có chủ đích; không patch `node_modules`.
- Chỉ đánh dấu resolved sau khi clean local build + `vercel build`/Preview build chạy lại thành công.

## 3.6. Build command và clean worktree

AI phải dùng package manager thật của repo. Ví dụ nếu repo dùng pnpm:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Không chạy mọi script nếu project không có script tương ứng; dùng lệnh thực tế và ghi lại.

Vercel validation:

```bash
pnpm dlx vercel@latest build
```

Nếu Vercel CLI đã được pin trong project/tooling, dùng đúng phiên bản pin thay vì tự động nâng latest.

Sau đó:

- Kiểm tra `.vercel/output` hoặc output đúng theo Vercel/Nitro preset hiện tại.
- Kiểm tra functions, routes, static assets được tạo đúng.
- Kiểm tra không có source `.js` rác.
- Tạo Preview Deployment.
- Không tuyên bố deploy thành công chỉ từ local `pnpm build`.

## 3.7. Vercel Dashboard settings checklist

Nếu AI không có quyền xem Dashboard, xuất hướng dẫn cho user:

- Root Directory đúng app package.
- Framework Preset: Nuxt (nếu auto-detect phù hợp).
- Install Command: auto hoặc package-manager command đã xác minh.
- Build Command: auto hoặc command build Nuxt hiện có.
- Output Directory: để framework adapter tự quản lý nếu docs/version không yêu cầu custom.
- Node.js version khớp `engines.node` và native package compatibility.
- Environment Variables có đủ DB/R2/auth/AI relay vars ở đúng Development/Preview/Production scope.
- Không để Preview deploy dùng nhầm Production bucket/database nếu không chủ đích.

---

# 4. Phase 5 – Implement Neon PostgreSQL + object storage (Hub / R2)

## 4.1. Exit criteria Phase 5

Phase 5 chỉ DONE khi:

- Neon database được provision và test connection trong Vercel Preview.
- Migration versioned chạy thành công.
- Cloud Job Repository có create/get/list/update/claim/lease/expire.
- Một trong hai driver được cấu hình và test: Hub Storage Connection (`hub`) hoặc bucket riêng `r2`.
- Hub: App Secret server-only, mỗi call mang token người dùng; grant không tới browser.
- R2: bucket private và credentials server-only.
- Upload intent + presigned upload hoạt động.
- Multipart upload flow có test nếu scope large files được bật; provider không có multipart thì fallback một signed PUT.
- Finalize verify object trước khi cho process.
- Artifact publish/download/delete được authorize theo owner.
- Storage keys không leak qua UI trừ khi được chuyển thành opaque label.
- Local runtime không bị buộc dùng cloud R2/Neon/Hub.
- Không driver nào trên cloud → ephemeral `/tmp` chỉ phục vụ `/documents/run` một request, health báo `mode=ephemeral`.
- Tests cho auth ownership, idempotency, expiry, storage errors đạt.

## 4.2. Environment variables đề xuất

Tên cuối cùng phải thống nhất với convention hiện tại. Không thêm biến trùng nghĩa.

```env
# Runtime
DOCUMENT_RUNTIME=vercel

# PostgreSQL / Neon - server only
DATABASE_URL=postgresql://...-pooler.../database?sslmode=require
DATABASE_URL_DIRECT=postgresql://.../database?sslmode=require

# Storage driver: auto | local | hub | r2
DOCUMENT_STORAGE_DRIVER=auto

# TM Hub Storage Gateway - server only App Secret
NUXT_PUBLIC_HUB_URL=https://hub.example.com
NUXT_PUBLIC_HUB_APP_ID=tm-tools
NUXT_HUB_APP_SECRET=...
DOCUMENT_STORAGE_CONNECTION_ID=            # gợi ý, Hub vẫn kiểm tra grant
DOCUMENT_STORAGE_NAMESPACE=tm-tools/pdf
DOCUMENT_STORAGE_MAX_INLINE_BYTES=1000000
DOCUMENT_HUB_TIMEOUT_MS=15000

# Cloudflare R2 (chỉ khi tự sở hữu bucket) - server only
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=tm-document-studio-private
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_REGION=auto

# Limits
DOCUMENT_MAX_UPLOAD_BYTES=...
DOCUMENT_MAX_TOTAL_JOB_BYTES=...
DOCUMENT_MAX_SCRATCH_BYTES=...
DOCUMENT_PRESIGN_UPLOAD_TTL_SECONDS=600
DOCUMENT_PRESIGN_DOWNLOAD_TTL_SECONDS=300
DOCUMENT_INPUT_RETENTION_HOURS=24
DOCUMENT_OUTPUT_RETENTION_HOURS=24
DOCUMENT_JOB_HISTORY_DAYS=7
```

Lưu ý:

- Đây là tên biến tham khảo. Nếu repo có schema runtime config thì tích hợp vào đó.
- Không để secret biến bắt đầu bằng `NUXT_PUBLIC_`.
- Không commit file `.env` chứa giá trị thật.
- `.env.example` chỉ chứa placeholder.
- Không log connection string hoặc credential.
- Preview và Production cần bucket/prefix/database policy tách biệt.

## 4.3. Storage Provider interface

Tạo hoặc hoàn thiện interface theo codebase hiện có. Ví dụ:

```ts
interface ObjectStorageProvider {
  createUploadIntent(input: CreateUploadIntentInput): Promise<UploadIntent>
  verifyUploadedObject(input: VerifyUploadedObjectInput): Promise<VerifiedObject>
  createMultipartUpload(input: CreateMultipartInput): Promise<MultipartUploadIntent>
  signUploadPart(input: SignUploadPartInput): Promise<SignedPartUrl>
  completeMultipartUpload(input: CompleteMultipartInput): Promise<VerifiedObject>
  abortMultipartUpload(input: AbortMultipartInput): Promise<void>
  downloadToLocal(input: DownloadObjectInput): Promise<LocalStagedFile>
  uploadFromLocal(input: UploadObjectInput): Promise<StoredObject>
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>
  deleteObject(input: DeleteObjectInput): Promise<void>
  headObject(input: HeadObjectInput): Promise<StoredObjectMetadata | null>
}
```

Không bắt buộc giữ nguyên từng method name, nhưng phải phân biệt interface với provider implementation.

Implementations:

- `LocalFilesystemStorageProvider` cho local/Electron.
- `CloudflareR2StorageProvider` cho Vercel.
- Không tạo `VercelBlobStorageProvider` trong phase này trừ khi có quyết định khác được phê duyệt.

## 4.4. Upload intent API flow

Đề xuất route mới theo convention hiện tại. Nếu repo đã có route tương đương, tái sử dụng thay vì tạo trùng.

1. `POST /api/v1/document-jobs` – create job + declared inputs.
2. `POST /api/v1/document-jobs/:jobId/inputs/:inputId/upload-intent` – cấp presigned upload hoặc multipart init.
3. Browser upload trực tiếp R2.
4. `POST /api/v1/document-jobs/:jobId/inputs/:inputId/complete` – server verify object.
5. `POST /api/v1/document-jobs/:jobId/execute` – enqueue/dispatch sau khi mọi input verified.
6. `GET /api/v1/document-jobs/:jobId` – trạng thái.
7. `GET /api/v1/document-jobs/:jobId/artifacts` – danh sách output metadata.
8. `POST /api/v1/document-artifacts/:artifactId/download-url` – cấp signed GET.
9. `DELETE /api/v1/document-artifacts/:artifactId` – xóa artifact theo owner.
10. `POST /api/v1/document-jobs/:jobId/cancel` – hủy nếu operation hỗ trợ.

Nếu API prefix hiện tại phải giữ `/api/v1/pdf/**` cho PDF, không đổi endpoint public chỉ để đồng bộ naming. Có thể đặt route metadata nội bộ dưới module document, nhưng giữ route compatibility.

## 4.5. Upload validation

Server phải xác minh:

- User authenticated.
- Operation được phép và hỗ trợ loại input.
- File count, size và tổng job bytes trong quota.
- File extension nằm trong allowlist operation.
- MIME type do browser khai báo chỉ là hint; verify content/signature server-side.
- Object key đúng key server đã cấp.
- Object size khớp declared size trong giới hạn sai số nếu multipart/provider metadata yêu cầu.
- Ownership đúng owner của job.
- Upload intent chưa hết hạn và chưa finalize.
- Checksum/ETag không bị hiểu nhầm: multipart ETag không nhất thiết là MD5 của toàn file.
- Từ chối archive/path traversal, file type không support và file rỗng.

Không xử lý file cho tới khi status `verified`.

---

# 5. Job State Machine và execution model

## 5.1. Job states chuẩn

Dùng một state machine thống nhất (có thể mapping từ state hiện tại):

```text
created
  → uploading
  → ready
  → queued
  → running
  → publishing
  → completed

Các nhánh:
  uploading → failed / expired / cancelled
  ready → cancelled / expired
  queued → running / cancelled / failed
  running → publishing / partial / failed / cancel_requested
  publishing → completed / partial / failed
  completed → expired (sau retention, metadata có thể giữ summary)
```

Không chuyển state tùy tiện. Các transition phải được validate trong repository/service.

## 5.2. Idempotency

- Mỗi create job từ client có idempotency key hoặc server-generated request token.
- Create job retry với cùng owner + key không tạo job mới.
- `execute` retry không enqueue cùng job nhiều lần không kiểm soát.
- Artifact ID/object key stable cho một execution attempt hoặc có version rõ ràng.
- Worker nhận message hai lần vẫn không publish duplicate result.
- Storage write xong nhưng DB commit lỗi phải để orphan candidate được cleanup.

## 5.3. Lease/lock

- Worker claim job bằng conditional update.
- `lease_owner` và `lease_expires_at` có TTL.
- Nếu worker chết và lease hết hạn, job có thể được claim lại nếu retry policy cho phép.
- Không để hai worker cùng chạy operation không idempotent.
- Heartbeat cập nhật lease trong tác vụ dài.
- Cancellation là cooperative qua `AbortSignal`/cancel flag.

## 5.4. Local sync vs cloud async

- Local/Electron: operation nhẹ có thể chạy trực tiếp trong Nitro local; operation nặng có thể dùng local job manager/worker.
- Vercel: operation nhỏ, có giới hạn tài nguyên rõ có thể chạy trong Function request/response.
- Cloud long-running: phải có durable queue/workflow hoặc external worker. Không spawn detached task trong Vercel Function.
- `DOCUMENT_RUNTIME_NOT_SUPPORTED` chỉ được trả khi operation thật sự không có adapter cho runtime đó. Không dùng một cờ global khiến toàn bộ cloud runtime bị từ chối khi một operation chưa hỗ trợ.

---

# 6. Phase 6 – Vercel Cloud Runtime Processing

## 6.1. Phạm vi supported cloud MVP

Bật cloud operation theo allowlist sau khi kiểm thử runtime:

- Small/medium Split PDF.
- Small/medium Merge PDF.
- PDF → Images nếu giới hạn page count/output size nằm trong budget.
- Images → PDF nếu đầu vào và output nằm trong budget.
- Convert/Export nếu thư viện chạy được trên Node.js Function runtime và không cần binary hệ thống không có.
- AI Extraction chỉ sau Phase 7 và chỉ với resource policy phù hợp.

Không tuyên bố mọi file hoặc mọi operation đều chạy được trên Vercel Hobby.

## 6.2. `/tmp` policy

- Dùng `os.tmpdir()` + `mkdtemp`/random per execution directory.
- Ví dụ `/tmp/tm-document-studio/{jobId}-{attempt}/input`, `/working`, `/output`.
- Không dùng predictable user input để tạo directory name.
- Không lưu job state trong `/tmp`.
- Không rely on `/tmp` sau invocation.
- Kiểm tra free space, input bytes, expected intermediate bytes và expected output budget trước khi chạy.
- Có configured scratch budget thấp hơn Vercel hard limit; giá trị ban đầu cần benchmark (ví dụ 300–350 MB/job) và phải account concurrency.
- Dọn directory trong `finally`.
- Nếu invocation bị kill, cleanup orphan cloud artifacts bằng DB lease/TTL; không có cách đảm bảo `finally` chạy khi process bị kill.

## 6.3. Vercel Function limits

Theo docs đang có tại ngày 2026-11-06:

- Function request/response payload có giới hạn nhỏ (được Vercel limits docs nêu là 4.5 MB); không proxy large upload/download qua Function body.
- Writable `/tmp` là scratch tối đa 500 MB.
- Memory/duration phụ thuộc plan/runtime/Fluid Compute. Pro/Enterprise có duration cao hơn; mức 30 phút được công bố cho một số Node/Python configurations và có trạng thái Beta ở một số ngưỡng.
- Build output/function bundle size cũng có giới hạn.

Không hard-code những số này làm guarantee. Kiểm tra lại docs/dashboard/plan lúc deploy.

## 6.4. Bounded processing algorithm

Trước khi execute:

1. Load job từ PostgreSQL, verify owner/status.
2. Claim lease.
3. Load input object metadata; enforce total input bytes and file types.
4. Tính scratch estimate theo operation (input + decompressed/expanded intermediates + output).
5. Nếu estimate vượt cloud function budget → route sang external worker queue hoặc trả `DOCUMENT_WORKER_REQUIRED` có hướng dẫn; không chạy rồi fail nửa chừng.
6. Download object vào temp directory qua streaming pipeline; không Buffer toàn file nếu file lớn.
7. Execute engine với cancellation/progress callback.
8. Verify output count/size/mime.
9. Upload output lên R2 bằng streaming/multipart phù hợp.
10. Transaction insert artifacts + complete job.
11. Finally cleanup temp + release lease.

## 6.5. Large processing worker

Cloud R2 direct upload chỉ giải quyết ingress. Nó **không** làm Vercel `/tmp` lớn hơn và không loại bỏ Function timeout.

Khi job vượt budget:

- `WorkerDispatcher` chuyển job tới external Node.js container worker.
- Worker chạy cùng processing package/interface.
- Worker truy cập R2 + Neon qua credentials server-side.
- Worker ghi progress/job state qua repository.
- Worker dùng disk scratch theo policy riêng và cleanup.
- Vercel chỉ đóng vai trò UI/API/control plane.

Có thể để Phase 8 triển khai external worker thực tế; Phase 6 phải có capability check và `DOCUMENT_WORKER_REQUIRED` rõ ràng để không fail ngẫu nhiên.

---

# 7. Phase 7 – AI Extraction giữ nguyên `/pdf/extract`

## 7.1. Quyết định bắt buộc

**AI Extraction vẫn là tính năng `/pdf/extract` và giữ API prefix `/api/v1/pdf/extract/**` hiện có.**

Không:

- Chuyển UI sang trang/route khác chỉ vì có Document Operations Framework.
- Xóa/đổi endpoint `/pdf/extract/start`, `/pdf/extract/jobs`, `/pdf/extract/:id`, `/pdf/extract/:id/cancel` nếu đây là endpoint đang có.
- Viết lại prompt/schema/extraction engine không cần thiết.
- Bỏ Preset, model selector, AI Relay hoặc checkpoint.

Có thể tạo internal adapter `ExtractOperationAdapter` để đăng ký AI Extraction vào Operation Registry, nhưng adapter phải gọi service/route hiện có.

## 7.2. Input cloud cho `/pdf/extract`

Local:

- Giữ khả năng chọn local PDF và xử lý local như hiện tại.

Cloud:

- Browser upload PDF qua Document Upload flow → R2.
- Finalize verify → input record `verified`.
- `/pdf/extract/start` nhận một reference an toàn tới staged input (job/input ID hoặc storage reference do server tạo), không nhận storage key tùy ý.
- Server xác thực owner và lấy object từ R2 về temp provider.
- Extraction engine hiện tại xử lý bằng file staged local temp hoặc adapter phù hợp.
- Kết quả vẫn được lưu vào products/logic artifact tương ứng; cloud result là artifact trên R2.

Giữ backward compatibility cho local request hiện tại.

## 7.3. Persistent extraction job

`PdfExtractJobState` hiện có thể đang lưu trong memory. Với cloud phải lưu bền vững qua `DocumentJobRepository` hoặc repository chuyên biệt cùng database.

Cần lưu:

- job ID, owner ID, status.
- source/input records.
- model + connectionId.
- preset snapshot và version.
- schema version.
- config snapshot (page range, output formats, overwrite policy, etc.).
- total/processed/cached/failed pages.
- current page/unit.
- error code/message đã sanitize.
- cancel requested.
- created/started/finished/expires timestamps.
- outputs/artifact references.

Không lưu API keys hoặc raw provider secrets.

## 7.4. Checkpoint fingerprint – tránh reuse cache sai

Checkpoint hiện có cần audit để xác định fingerprint. Không được reuse checkpoint chỉ dựa trên filename/stem.

Fingerprint tối thiểu phải thay đổi nếu có bất kỳ khác biệt nào trong:

- input identity/hash (hoặc object checksum + size/version).
- page index/page content hash nếu available.
- extraction schema version.
- preset content/version.
- model ID và connection/provider identifier (không phải secret).
- prompt/template version.
- extraction options/output contract.

Nếu không có source hash thì tính SHA-256 khi stage/upload finalize hoặc dùng verified checksum từ provider; không dùng filename làm identity.

Checkpoint key phải versioned. Cache cũ không tương thích thì không reuse; có thể giữ lại cho rollback/cleanup theo policy.

## 7.5. Progress and cancellation

- UI `/pdf/extract` poll/realtime theo job ID hiện tại nhưng data source cloud phải là DB/repository.
- Update progress theo page/unit batch, không update DB cho mỗi byte/chunk nhỏ.
- Cancel endpoint chỉ đánh dấu yêu cầu hủy; worker kiểm tra ở ranh giới page/unit và trước publish.
- Không hủy mid-write khiến artifact nửa vời trở thành `ready`.
- Khi cancel, cleanup temp và partial artifact; ghi event.

## 7.6. AI Relay

- Tiếp tục dùng TM Hub AI Relay hiện có.
- Model/connection phải được resolve theo auth/permission hiện tại.
- Server không lưu model provider key ở Document Studio.
- Retry chỉ lỗi transient (429, timeout, 5xx) theo existing policy; validation/schema errors không retry vô hạn.
- Log model/connection ID, latency, usage metadata nếu có; không log prompt chứa nội dung nhạy cảm hoặc document full content.

---

# 8. Phase 8 – Activity, Retention, Cleanup và Worker Abstraction

## 8.1. Activity UI

Xây dựng trang Activity với các khu vực:

- Running/Queued jobs.
- Recent completed jobs.
- Failed/Partial jobs.
- Expired jobs có thể chỉ giữ metadata summary.

Job row hiển thị:

- Operation name.
- Filename(s) đã sanitize.
- Status/progress.
- Created/finished time.
- Output count.
- Expiry notice nếu có.
- Actions: Open result, Download, Retry (chỉ khi safe), Cancel (chỉ khi running/queued và supported), Delete.

Không hiển thị storage key, absolute server path, signed URL hoặc internal worker ID.

## 8.2. Retention policy mặc định đề xuất

Các giá trị này cần nằm trong config, không hard-code:

| Data | Default đề xuất | Ghi chú |
|---|---:|---|
| Local temp | Xóa ngay sau completion/failure | Best-effort finally + startup janitor |
| Cloud temp `/tmp` | Xóa trong invocation finally | Không có persistence guarantee |
| Cloud input object | Xóa sau success; giữ tạm khi retry/failure theo policy | Không mất input trước khi job terminal |
| Cloud output artifact | 24 giờ mặc định ban đầu | User có thể tải lại trong thời hạn |
| Job metadata | 7–30 ngày tùy nhu cầu | Có thể giữ summary lâu hơn, không giữ binary |
| Incomplete multipart | 1 ngày nếu cấu hình được | R2 lifecycle fallback |

UI cần hiển thị thời gian còn lại trước khi artifact hết hạn.

## 8.3. Cleanup service

Tạo cleanup service idempotent, chạy theo batch:

1. Tìm artifact hết hạn hoặc `delete_pending`.
2. Verify owner/system retention rule.
3. Delete object qua Storage Provider.
4. Mark artifact deleted.
5. Tìm input object hết hạn và không thuộc job retry.
6. Delete input object.
7. Mark upload session expired/aborted.
8. Tìm orphan object theo prefix/metadata nếu có thể list theo prefix và đối chiếu DB.
9. Ghi cleanup event và metrics.

Không xóa job/metadata trước khi xử lý artifact references; dùng soft state hoặc transaction theo thiết kế.

## 8.4. Cleanup trigger strategy

Dùng nhiều lớp:

- Immediate delete sau success khi input policy yêu cầu.
- Delete ngay khi user bấm Delete Result.
- Cleanup event khi job terminal.
- Scheduled janitor/cron để xử lý orphan/expired records.
- R2 lifecycle là safety net cho object expiration và incomplete multipart.

Vercel Cron frequency phụ thuộc plan; không giả định Hobby chạy được mỗi phút. Nếu chỉ có daily cron thì retention cleanup có thể trễ theo schedule. Trạng thái UI vẫn phải coi artifact hết hạn là không khả dụng ngay cả khi vật lý chưa xóa.

## 8.5. Cleanup concurrency

- Dùng DB claim/lease để chỉ một cleanup worker xử lý một candidate.
- Xóa storage object idempotently: object đã missing được coi là hoàn tất cleanup.
- Khi storage timeout, ghi retry state, không mark deleted sớm.
- Batch size có giới hạn.
- Có max attempt và backoff.
- Không list cả bucket nếu có thể query DB theo `expires_at` và xóa bằng exact `storage_key`.

## 8.6. External Worker abstraction

Tạo interface `JobDispatcher`/`ProcessingWorker`:

- `LocalInlineDispatcher`: local/electron, công việc nhẹ.
- `VercelBoundedDispatcher`: operation cloud nhỏ đã được đánh giá resource.
- `ExternalWorkerDispatcher`: job nặng/long-running.

Không chọn Queue/Workflow beta chỉ vì có sẵn trong dashboard. So sánh capability/plan/ops complexity trước khi triển khai provider cụ thể.

Phase 8 cần ít nhất có contract, mock/test và một implementation thực tế phù hợp nhu cầu; nếu external worker chưa provision được, phải giữ `DOCUMENT_WORKER_REQUIRED` và đánh dấu production heavy-job chưa hỗ trợ.

---

# 9. Phase 9 – Legacy Retirement và Regression

## 9.1. Không xóa legacy trước khi parity

- Giữ `.data/pdf` hiện tại và tất cả file người dùng.
- Không xóa `sources`, `inputs`, `split`, `images`, `merged`, `products`, `office`, `word`, `checkpoints`, `.trash` tự động.
- Không retire API cũ khi Electron/local hoặc page cũ còn gọi.
- Không remove `app/components/pdf` hàng loạt trước khi consumer audit.
- Có adapter để operation mới gọi engine cũ.

## 9.2. Legacy API consumer audit

Trước khi deprecate route:

1. Search toàn repo (app, server, electron, tests, docs) tất cả path/API calls.
2. Ghi consumer và runtime.
3. Mark deprecated trong docs/types nếu cần.
4. Chuyển từng consumer.
5. Thêm test đảm bảo route mới parity.
6. Chỉ xóa sau một release/cutover được xác nhận.

AI Extraction `/pdf/extract/**` không nằm trong danh sách deprecate.

## 9.3. Regression operations

Local/Electron:

- Import PDF.
- Split PDF.
- Merge PDF.
- PDF → Images.
- Images → PDF.
- Import non-PDF input.
- Convert Word/Excel → PDF nếu engine đang hỗ trợ.
- Export PDF sang các format hiện có.
- AI Extraction.
- Preview các loại file.
- Save As và output folder.
- Retry/Cancel nếu operation hỗ trợ.

Vercel:

- Upload small file direct R2.
- Upload file vượt 4.5 MB direct R2 (không qua Function body).
- Multipart upload test nếu bật.
- Finalize verify.
- Job state survives separate Function invocations.
- Bounded operation process → artifact publish.
- Authenticated download.
- Wrong owner cannot inspect/download/delete another user's artifacts.
- Cleanup deletes expired objects and retains unexpired object.
- Function timeout/scratch budget errors are clear and leave no false-success artifact.
- AI Extraction only for allowed cloud resource envelope.

---

# 10. Authenticated Browser Testing – không dùng seed credentials

## 10.1. Trạng thái hiện tại

Người dùng báo cáo:

- Chưa có signed-in browser pass.
- Protected routes trả `401` khi không có session.
- Người dùng không muốn AI xử lý seed credentials.
- Compile, API smoke và specs hiện là bằng chứng đã có; không phải bằng chứng visual authenticated session.

Phải giữ nguyên sự thật này trong report.

## 10.2. Quy tắc kiểm thử auth

- Unaunthenticated request tới protected route phải trả `401`/status phù hợp.
- Tests dùng mock auth/session provider ở unit/integration level; mock phải chỉ nằm trong test environment.
- Không thêm production bypass như `?testAuth=true`, header hardcoded hoặc fixed user ID.
- Không tắt middleware để chạy Playwright.
- Không đọc hoặc sử dụng seed credentials từ repo.
- Không yêu cầu user gửi password/session token cho AI.

## 10.3. Test levels và cách ghi kết quả

| Test level | Có thể chứng minh gì? | Trạng thái hiện tại |
|---|---|---|
| Typecheck/build | Compile và module linking | Đã có bằng chứng trước đó; chạy lại sau changes |
| Unit specs | Pure logic, adapters, state transitions | Đã có một phần; mở rộng |
| API smoke không session | Auth gate/401, route shape trước auth nếu phù hợp | Đã có một phần |
| API integration với mock auth | Job ownership, DB, storage permissions | Cần bổ sung |
| Signed-in browser | Thực tế thao tác UI với session | **Chưa verified** |
| Manual visual acceptance | User nhìn UI và thao tác bằng tài khoản của mình | **User-owned pending** |

## 10.4. Cách hoàn tất signed-in browser pass

Nếu repo đã có Playwright auth fixture được tạo hợp lệ trong test environment, AI có thể dùng fixture đó mà không đụng credential thật.

Nếu chưa có:

1. AI chuẩn bị checklist Playwright/manual và test data không nhạy cảm.
2. AI hoàn tất unit/API integration tests bằng mock auth injection.
3. Ghi rõ signed-in browser test còn pending.
4. User tự mở Preview Deployment, tự sign in bằng phương thức chính thức.
5. User chạy manual acceptance checklist hoặc cung cấp session test được tạo qua flow chính thức nếu muốn automation tiếp.

Không đánh dấu full visual pass trước bước 4–5.

---

# 11. Hoàn thiện Error Contract và capability gating

## 11.1. `DOCUMENT_RUNTIME_NOT_SUPPORTED`

Hiện lỗi này được ném theo thiết kế vì cloud runtime chưa triển khai.

Sau Phase 5–6:

- Chỉ operation thực sự chưa hỗ trợ cloud mới trả `DOCUMENT_RUNTIME_NOT_SUPPORTED`.
- Nếu file quá lớn hoặc operation vượt Function budget nhưng external worker có hỗ trợ, trả `DOCUMENT_WORKER_REQUIRED` hoặc đưa vào queue.
- Nếu storage provider chưa cấu hình, trả `DOCUMENT_STORAGE_NOT_CONFIGURED`.
- Nếu DB chưa configured, trả `DOCUMENT_DATABASE_NOT_CONFIGURED`.
- Nếu upload chưa finalize, trả `DOCUMENT_INPUT_NOT_READY`.
- Nếu artifact hết hạn, trả `DOCUMENT_ARTIFACT_EXPIRED`.
- Nếu owner không khớp, trả 404 hoặc 403 theo security policy; không leak resource existence.

## 11.2. Operation capabilities

Mỗi operation khai báo theo runtime:

```ts
interface OperationRuntimeSupport {
  runtime: 'local' | 'electron' | 'vercel' | 'worker'
  enabled: boolean
  executionMode: 'sync' | 'async' | 'worker'
  maxInputFiles: number
  maxInputBytes: number
  maxTotalInputBytes: number
  maxPages?: number
  maxEstimatedScratchBytes?: number
  reasonDisabled?: string
}
```

Không dùng một `cloudEnabled` boolean chung cho toàn bộ app nếu các operation có khả năng runtime khác nhau.

---

# 12. CI, Build Hygiene và bảo vệ source tree

## 12.1. TypeScript output policy

- `typecheck` phải no-emit.
- Build JS tooling/worker nếu cần phải emit vào dedicated `dist/`/`.output/` đã ignore chính xác.
- Không emit `.js` bên cạnh `.ts` source.
- Không broad-ignore `*.js`.
- Các thư mục generated được ignore phải có tên rõ và không chứa source code.

## 12.2. CI guard

Thêm script/check tương đương:

1. Capture `git status --short` trước build.
2. Run typecheck.
3. Kiểm tra source directories không phát sinh generated sibling `.js` bất thường.
4. Run production build.
5. Kiểm tra artifact chỉ nằm ở expected output directories.
6. Capture `git status --short` sau build.
7. Fail nếu build làm dirty tracked source hoặc phát sinh file lạ ngoài allowlist.

Không fail chỉ vì repository có `.js` source tracked hợp lệ.

## 12.3. Lockfile and package integrity

- Dùng một package manager theo lockfile hiện tại.
- `install --frozen-lockfile` trong CI.
- Không cập nhật nhiều dependency lớn cùng lúc trong khi sửa deployment.
- Native modules cần kiểm tra Electron ABI và Vercel Linux runtime riêng.
- Nếu một package chỉ dùng ở Electron main, không import vào serverless bundle nếu không cần.
- Nếu một package chỉ dùng cloud storage, không làm local Electron require secrets/provider SDK khởi tạo lúc boot.

---

# 13. Vercel Deployment Acceptance – Preview trước Production

## 13.1. Environment separation

Tạo riêng:

- Development: DB dev + R2 dev prefix/bucket.
- Preview: DB preview/branch + R2 preview prefix.
- Production: DB production + R2 production prefix.

Không để Preview deployment xóa/ghi đè production artifacts.

## 13.2. Preview deployment checklist

- [ ] Clean checkout/build được.
- [ ] Vercel CLI build thành công.
- [ ] Không có `.js` generated pollution trong source tree.
- [ ] `vercel.json` hợp lệ và không chứa key không được hỗ trợ.
- [ ] Nitro server routes được tạo đúng.
- [ ] Health endpoint báo runtime/provider capability mà không lộ secret.
- [ ] Authenticated settings/config load hoạt động sau khi user đăng nhập.
- [ ] Unauthenticated protected API vẫn trả 401.
- [ ] DB ping/migration version OK.
- [ ] R2 access chỉ qua server/presigned URL ngắn hạn.
- [ ] Upload/Finalize/Process/Download/Delete smoke flow đạt bằng test session.
- [ ] Cleanup logic test được bằng fake clock/test database.
- [ ] Operation vượt budget trả error/worker routing rõ ràng.
- [ ] Preview không ghi vào production bucket/database.

## 13.3. Không tuyên bố production-ready nếu

- Chỉ `pnpm build` thành công.
- API tests chỉ gồm unauthenticated 401.
- Không test được R2 credentials/bucket.
- Không test được DB persistence qua invocation khác.
- Không có artifact download/ownership test.
- Không có cleanup/expiry verification.
- AI Extraction cloud chỉ compile nhưng chưa chạy test document thật trong giới hạn được phê duyệt.

---

# 14. Implementation Roadmap – chỉ các Phase còn pending

## Phase 5 – Cloud DB & Storage Foundation

### Tasks

1. Audit current DB/repository and confirm no hidden production persistence is being ignored.
2. Implement Neon PostgreSQL connection and migration pipeline.
3. Add schema: jobs, job inputs, artifacts, upload sessions, job events.
4. Implement `CloudJobRepository` with ownership scoping, transaction, idempotency, leases.
5. Implement local `JobRepository` adapter without coupling local runtime to cloud credentials.
6. Create Cloudflare R2 private bucket and environment setup guide.
7. Implement `CloudflareR2StorageProvider`.
8. Implement presigned single upload and authenticated download.
9. Implement multipart upload if the selected max file size requires it; test abort/retry.
10. Implement finalize verification and checksum/size checks.
11. Add unit/integration tests.

### Exit criteria

- Job persists across separate HTTP requests and serverless instances.
- R2 object upload/finalize/download/delete works with authenticated owner.
- No secret is exposed to browser.
- Upload object cannot be finalized for another user's job.
- Local runtime still works without Neon/R2 env values.

**Status: PENDING.**

## Phase 6 – Vercel Runtime & Deployment Repair

### Tasks

1. Audit root `vercel.json`, duplicate configs and Dashboard settings.
2. Fix Nuxt/Nitro Vercel configuration based on the actual installed framework versions.
3. Preserve clean source tree; prevent generated `.js` pollution.
4. Reproduce and resolve `Cannot add property setup` with full trace; do not patch dependencies blindly.
5. Run clean `pnpm install --frozen-lockfile`, typecheck/lint/test/build.
6. Run Vercel CLI build with pinned/current CLI.
7. Deploy Preview.
8. Implement Cloud runtime adapter selection using explicit runtime/provider configuration.
9. Replace global unsupported throw with per-operation capabilities.
10. Implement `/tmp` staging with disk budget, streaming and finally cleanup.
11. Implement bounded cloud operation path.
12. Route out-of-budget tasks to worker-required state rather than running unsafely.
13. Add deployment/API smoke tests.

### Exit criteria

- Vercel Preview builds/deploys successfully.
- `DOCUMENT_RUNTIME_NOT_SUPPORTED` is not thrown for operations explicitly marked supported.
- Function does not depend on persistent `/tmp`.
- Supported operation performs R2 input → temp processing → R2 artifact.
- Out-of-budget operation fails safely or dispatches to worker.

**Status: PENDING.**

## Phase 7 – AI Extraction `/pdf/extract` Cloud Migration

### Tasks

1. Keep `/pdf/extract` UI and `/api/v1/pdf/extract/**` public API.
2. Add cloud staged input reference support without accepting arbitrary storage key/path.
3. Persist extraction job state in cloud Job Repository.
4. Preserve model selection, connectionId, preset snapshot, schema and AI Relay.
5. Make checkpoint fingerprint safe and versioned.
6. Preserve local extraction compatibility.
7. Add progress/cancel/result artifact cloud flow.
8. Test with a small representative PDF and a multi-page PDF within approved cloud budget.
9. Test provider error, timeout, rate limit and partial page failure.

### Exit criteria

- `/pdf/extract` works in local runtime as before.
- Cloud extraction can upload, start, survive separate invocation, report progress and publish result.
- Checkpoint is not reused across changed input/model/preset/schema/prompt fingerprints.
- No provider secret is exposed.

**Status: PENDING.**

## Phase 8 – Activity, Retention, Cleanup, Worker

### Tasks

1. Add Activity UI and owner-scoped job history.
2. Add cancel/retry/delete controls only where semantics are supported.
3. Add expiry countdown/expired state for artifacts.
4. Implement immediate input cleanup after terminal success according to retention.
5. Implement artifact deletion and retryable cleanup tasks.
6. Implement scheduled janitor; Cron is a fallback, not the only cleanup mechanism.
7. Add R2 lifecycle rules for prefixes and incomplete multipart uploads.
8. Implement orphan reconciliation using DB/object metadata.
9. Implement external worker adapter or explicitly defer it with worker-required behavior and acceptance notes.
10. Add metrics and cleanup tests.

### Exit criteria

- Expired artifacts are unavailable immediately by policy and physically deleted eventually.
- Cleanup is idempotent and retryable.
- Jobs are not lost when Function instance is replaced.
- Activity never reveals another user's data.

**Status: PENDING.**

## Phase 9 – Legacy Retirement & Final Regression

### Tasks

1. Compare old and new operation flows.
2. Search all legacy route/component consumers.
3. Keep `/pdf/extract` intact.
4. Deprecate old tree/library UI only after the new input/output experience is complete.
5. Remove dead code in small reviewed batches.
6. Preserve `.data/pdf` user data and import/export compatibility.
7. Run local, Electron and Vercel Preview regression.
8. Complete user-owned signed-in visual acceptance after user signs in manually.
9. Update all spec/audit/verification status.
10. Write final report with done/pending/blocked and evidence links.

### Exit criteria

- No current feature is lost.
- No data is deleted/moved without migration approval.
- Old code is removed only when no references remain.
- Tests and deployment pass.
- Authenticated visual pass status is honestly reported.

**Status: PENDING.**

---

# 15. Required test matrix

| Scenario | Local | Electron | Vercel Preview |
|---|---:|---:|---:|
| Select one PDF | Required | Required | Required |
| Select multiple files | Required where operation supports | Required | Required |
| Drag/drop file | Required | Required | Required |
| Set default input/output | Required | Required | Required (logical/cloud defaults) |
| Choose output destination | Local path | Native dialog | Browser Save Picker or download fallback |
| Split PDF | Required | Required | Supported size only |
| Merge PDF | Required | Required | Supported size only |
| PDF → Images | Required | Required | Bounded only |
| AI Extraction | Required | Required | After Phase 7 |
| Job survives API invocation change | N/A/appropriate | N/A/appropriate | Required |
| R2 upload presigned URL | N/A | N/A | Required |
| R2 owner isolation | N/A | N/A | Required |
| Temp cleanup after success | Required | Required | Required |
| Temp cleanup after error | Required | Required | Required |
| Worker timeout/lease recovery | If async local | If async local | Required for async jobs |
| Unaunthenticated API | 401/403 expected | 401/403 expected | 401/403 expected |
| Signed-in UI | Manual/local auth | Manual/local auth | User-owned manual pass if no sanctioned fixture |

---

# 16. Documentation deliverables AI must produce

Tạo/cập nhật theo convention hiện có, không tạo duplicate docs:

1. `docs/document-studio/REBUILD-AUDIT.md` – current architecture and build root cause.
2. `docs/document-studio/CLOUD-ARCHITECTURE.md` – Neon, R2, storage/job/runtime boundary.
3. `docs/document-studio/VERCEL-DEPLOYMENT.md` – correct project settings, env vars, build command, preview process.
4. `docs/document-studio/RETENTION-CLEANUP.md` – TTL, cleanup, lifecycle and retry.
5. `docs/document-studio/TEST-VERIFICATION.md` – commands, test results and proof classification.
6. Update `TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md` or linked status file with Phase 5–9 status; do not duplicate the full spec.
7. `.env.example` with placeholder names only.
8. Database migrations and migration README.
9. R2 bucket CORS/lifecycle setup instructions without secrets.

---

# 17. Final report format required from AI

At the end of work, report:

## Summary
- What changed.
- What architecture decisions were applied.
- Whether `/vercel.json` is corrected and why.

## Phase Status

| Phase | Status | Evidence |
|---|---|---|
| 5 | DONE/PARTIAL/BLOCKED | migration/test links |
| 6 | DONE/PARTIAL/BLOCKED | build/deployment URL/log |
| 7 | DONE/PARTIAL/BLOCKED | `/pdf/extract` test report |
| 8 | DONE/PARTIAL/BLOCKED | cleanup/job tests |
| 9 | DONE/PARTIAL/BLOCKED | regression report |

## Verification distinction

Explicitly classify:

- Compile/build verified.
- Unit tests verified.
- API smoke verified unauthenticated.
- API integration verified with mock auth.
- Vercel Preview verified.
- Signed-in browser pass verified or **NOT VERIFIED**.
- Manual visual acceptance verified or **PENDING USER**.

## Known limits

- File size and operation limits.
- Vercel plan restrictions.
- Operations requiring external worker.
- Retention behavior and delay.
- Any missing test credentials/session (do not ask to receive them).

## Rollback

- How to revert Vercel config.
- How to rollback DB migration safely (prefer additive migrations; do not drop tables/data casually).
- How to disable R2 upload/operation flag without deleting objects.
- How to keep old `/pdf/extract` route working.

---

# 18. Prompt triển khai trực tiếp cho AI Coding Agent

```text
Đọc toàn bộ:
- TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md
- TM-DOCUMENT-STUDIO-V4-COMPLETION-GUIDE.md
- Audit/docs hiện tại trong repository.

Tôi xác nhận trạng thái:
- Phases 5–9 đang PENDING.
- Cloud runtime hiện trả DOCUMENT_RUNTIME_NOT_SUPPORTED theo thiết kế.
- AI Extraction phải tiếp tục chạy trên /pdf/extract và API /api/v1/pdf/extract/** hiện có.
- /vercel.json vẫn cần audit/sửa.
- 289 emitted .js files đã bị xóa và verified không tracked; không được tạo lại.
- Không có signed-in browser pass. Các route 401 khi không có session là expected. Không dùng seed credentials, không yêu cầu tôi gửi credential, không bypass auth.
- Compile, API smoke và specs là bằng chứng đã có, nhưng không phải visual authenticated pass.

Quyết định Phase 5:
- Dùng PostgreSQL/Neon cho cloud job metadata; không thêm MongoDB cho implementation mới.
- Dùng Cloudflare R2 private bucket làm cloud object storage; upload trực tiếp bằng presigned URL, multipart cho file lớn.
- Local/Electron tiếp tục dùng local storage/job repository adapter, không phụ thuộc credential cloud.

Thực hiện:
1. Audit lại codebase và ghi rõ bằng chứng.
2. Sửa Vercel config dựa trên Nuxt/Nitro version thực tế. Ưu tiên auto-detect/zero-config nếu phù hợp; không tự thêm property setup, không trộn builds và functions, không copy config Next.js.
3. Giữ source tree sạch; typecheck noEmit; output compiler phải nằm trong dedicated build directory.
4. Hoàn tất Phase 5: Neon schema/repository/migrations + R2 provider/upload/finalize/download/delete.
5. Hoàn tất Phase 6: Vercel runtime, temp budget, bounded cloud processing, preview deployment.
6. Hoàn tất Phase 7: migrate /pdf/extract sang persistent cloud job/storage, nhưng giữ nguyên route, UI, AI Relay, model/preset/schema/engine.
7. Hoàn tất Phase 8: Activity, retention, cleanup/janitor, worker abstraction.
8. Hoàn tất Phase 9: regression, compatibility, retire legacy chỉ sau parity.

Không dừng ở kế hoạch. Code, test và cập nhật docs. Sau mỗi phase phải ghi status DONE/PARTIAL/BLOCKED cùng bằng chứng. Không đánh dấu signed-in visual test DONE nếu chưa có session hợp lệ do user tự cấp hoặc user tự thực hiện manual pass.
```

---

# 19. Official references checked 2026-11-06

Các giới hạn platform có thể thay đổi. AI phải kiểm tra link trước khi release.

## Vercel / Nuxt / Nitro

- Nuxt on Vercel: https://vercel.com/docs/frameworks/full-stack/nuxt
- Nitro Vercel provider: https://nitro.build/deploy/providers/vercel
- Vercel `vercel.json`: https://vercel.com/docs/project-configuration/vercel-json
- Vercel project configuration: https://vercel.com/docs/project-configuration
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Vercel Function duration: https://vercel.com/docs/functions/configuring-functions/duration
- Vercel troubleshooting build errors: https://vercel.com/docs/deployments/troubleshoot-a-build
- Vercel Postgres/Marketplace: https://vercel.com/docs/postgres

## Neon PostgreSQL

- Neon Vercel integration: https://neon.com/docs/guides/vercel
- Neon connection pooling: https://neon.com/docs/connect/connection-pooling

## Cloudflare R2

- Presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Upload objects and multipart: https://developers.cloudflare.com/r2/objects/upload-objects/
- Object lifecycle: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Configure CORS: https://developers.cloudflare.com/r2/buckets/cors/
- S3 compatibility: https://developers.cloudflare.com/r2/api/s3/api/

---

# 20. Final non-negotiable decisions

1. Cloud job metadata: **PostgreSQL on Neon by default**, not a new MongoDB deployment.
2. Cloud file storage: **TM Hub Storage Gateway by default** when the deployment has a Storage Connection; **Cloudflare R2 private bucket** for self-hosted deployments that own the bucket. Both sit behind the same provider interface.
3. Local/Electron remains local-first and must not depend on cloud credentials for local file processing.
4. Vercel `/tmp` is scratch only; never persistent storage or cross-invocation handoff. A cloud deployment with no storage driver serves `/documents/run` inline (≤3 MB) and refuses job-id routes with `use-single-request-run`.
5. Large browser upload goes directly to the provider grant using short-lived signed permissions; do not proxy through Function body. Hub grants reach the browser only through the tm-tools proxy route, never the App Secret.
6. Large object upload uses multipart with finalize verification and abort/expiry cleanup.
7. Vercel Function processing is bounded by measured scratch/memory/duration. Large jobs need external worker.
8. AI Extraction remains `/pdf/extract` and preserves current AI Relay, preset, schema and engine.
9. `DOCUMENT_RUNTIME_NOT_SUPPORTED` becomes operation-specific capability behavior, not a permanent global cloud block.
10. `vercel.json` must be validated against Vercel's current schema and actual Nuxt/Nitro output. Do not guess or add `setup`.
11. The 289 generated JS pollution must not recur; no broad `.js` ignore or destructive cleanup.
12. Auth is never bypassed for tests. Missing signed-in browser evidence must be reported honestly.
13. Phases 5–9 remain PENDING until their exit criteria have evidence.
14. Preserve user files, legacy extraction route, and existing working engines until regression and rollback are complete.

**Definition of success:** A user can select a document, run a supported operation, receive a private downloadable result, and have temporary data cleaned up. The same product flow works locally/Electron and on Vercel within explicit runtime limits; the architecture can move heavy processing to a separate worker without changing the UI or operation contract.
