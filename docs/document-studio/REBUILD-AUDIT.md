# TM Document Studio v4 — Rebuild audit (Phase 0)

Audit for [`docs/pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md`](../pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v4.md).
Captured 2026-11-06 against the code that actually ships in this repository.

Baseline gate before any v4 change: `npx nuxt typecheck` exit 0 with 0 × `error TS`,
`npx eslint` exit 0 on every PDF file, `pnpm test` 27/27 specs, `.nuxt/eslint.config.mjs`
24585 bytes regenerated in the same run.

Nothing in `.data/pdf` was moved, renamed or deleted while producing this audit.

**Status after phases 1–6 (2026-11-06):** the local runtime and six migrated
operations are implemented and verified; the cloud runtime is implemented but
has never run against Neon or R2 and no Vercel Preview deployment exists. See
[`ARCHITECTURE-v4.md`](./ARCHITECTURE-v4.md),
[`CLOUD-ARCHITECTURE.md`](./CLOUD-ARCHITECTURE.md) and
[`TEST-VERIFICATION.md`](./TEST-VERIFICATION.md). Phases 7–9 have not started,
and this document keeps the pre-change inventory they will need.

---

## 1. Runtime architecture per environment

| Environment | Renderer | Nitro | Notes |
| --- | --- | --- | --- |
| Dev local (`pnpm dev`) | Vite dev server, `http://localhost:4002` (`PORT` in `.env`) | Inside the Nuxt dev server, same process, same port | `ssr: false`; the SPA shell is served and every page is client-rendered |
| Electron dev (`pnpm dev:electron`) | Loads `http://localhost:${DEV_PORT}` (4002) | The Nuxt dev server process started by `concurrently` | `electron/main.cjs:147` |
| Electron prod (`pnpm build:electron`) | `loadURL('http://127.0.0.1:3456')` (`APP_PORT`) | Nitro `node-server` output (`.output/server/index.mjs`) imported **in-process** by Electron main | `electron/main.cjs:74-92`; `app.getPath('userData')` is exported as `TOOLS_DATA_DIR` only |
| Vercel web | Not built or deployed yet | Would run as a Vercel Function under the `vercel` preset | No `vercel.json`, no preset override, no deploy pipeline in the repo |

Consequences that the v4 design must respect:

- The renderer is a pure SPA in all three runtimes; there is no server-rendered HTML path to depend on.
- Electron prod hosts Nitro inside the main process. Moving PDF engines into Electron IPC would duplicate
  the engines and break the "one codebase" invariant, so engines stay in Nitro (`§29.14`).
- `process.cwd()` in Electron prod is the installed app directory, which is **not** a writable data
  location. The chat store already works around this with `TOOLS_DATA_DIR`
  (`server/modules/chat/store.ts:412-418`). `config.pdf.dir` does **not** — see §3.

## 2. Where Nitro runs and how the renderer calls it

- Every PDF call goes through `$fetch('/api/v1/pdf/...')` from
  [`app/composables/usePdfStudio.ts`](../../app/composables/usePdfStudio.ts), plus two direct
  `$fetch` calls in [`app/pages/pdf/index.vue`](../../app/pages/pdf/index.vue) (`/extract/models`) and
  the preview pages which use raw `<a href>`/`<img src>` against `/api/v1/pdf/file`.
- 48 route files exist under `server/api/v1/pdf/**`.
- Authentication is enforced for the whole `/api/` surface by
  [`server/middleware/auth.ts`](../../server/middleware/auth.ts): bearer token or `accessToken`
  cookie, verified with the shared hub JWT secret, `appId` claim must match `tm-tools`.
- `server/middleware/rbac.ts` defines a `permissionMap`, but **the map is empty**, so no PDF route
  currently requires a specific permission beyond being logged in.
- No PDF route reads `event.context.auth`. There is no per-user ownership concept anywhere in the
  PDF module today: every authenticated user sees the same files on disk.

## 3. `config.pdf.dir`, `PDF_DATA_DIR` and where the data really lives

- `server/config/index.ts:164` — `dir: readEnv('PDF_DATA_DIR', join(process.cwd(), '.data', 'pdf'))`.
- Dev and this workspace: `D:\Applications\tm-tools\.data\pdf` (7.1 MB, gitignored via `.data`).
- Electron prod: `process.cwd()` is the installation directory, so `.data/pdf` would resolve under
  the installed app (typically `Program Files`), which is read-only for normal users. **This is an
  existing defect**: the PDF data root is not redirected to `userData` the way the chat store is.
- Vercel: there is no filesystem at all except `/tmp`; any code path that joins `process.cwd()` fails.
- Path containment is guarded by `assertInsideRoot()` in
  [`server/modules/pdf/paths.ts:57`](../../server/modules/pdf/paths.ts#L57), which resolves the real
  path and rejects escapes through symlinks/junctions.

## 4. Area inventory (metadata only)

Root `D:\Applications\tm-tools\.data\pdf`.

| Area | Folders | Files | Size | Writable | Role |
| --- | --- | --- | --- | --- | --- |
| `sources/` | 1 (`DNTN-SenTuan`) | 5 | 1.1 MB | files + folders | uploaded PDFs |
| `split/` | 5 | 11 | 2.1 MB | files + folders | Split output, also the input of Merge |
| `images/` | 2 | 8 | 2.1 MB | files + folders | rasterized PNG pages, also the input of Images→PDF |
| `merged/` | 0 | 1 | 1.7 MB | files + folders | Merge and Images→PDF output |
| `products/` | 0 | 10 | 172 KB | files + folders | AI extraction export |
| `office/` | 0 | 1 | 12 KB | files + folders | PDF→DOCX and data exports |
| `inputs/` | 0 | 0 | 0 | files + folders | non-PDF inputs for Convert |
| `word/` | 0 | 1 | 12 KB | **none** | legacy uploads, read-only |
| `checkpoints/` | 4 | 4 JSON | 36 KB | internal | per-page AI extraction cache |
| `.trash/` | 0 | 0 | 0 | internal | soft-delete store + `trash_metadata.json` |
| `audit.jsonl` | — | 1 | 8.7 KB | internal | append-only mutation log |
| `presets.json` | — | 1 | 1.6 KB | internal | extraction presets |

External references into these folders exist in three places only: `paths.ts` (`pdfDirs`),
`source-export.ts`/`convert.ts` (via `outputDir()`), and the `checkpoints`/`presets`/`audit` helpers.
Nothing outside `server/modules/pdf` joins these paths by hand.

## 5. Components in `app/components/pdf`

| Component | Lines | v4 verdict |
| --- | --- | --- |
| `WorkspaceShell.vue` | 169 | Explorer chrome (resizable tree pane). Kept for the legacy Library route only; not used by operation pages. |
| `FolderTree.vue` | 276 | Explorer tree with lazy expand. Legacy Library only. |
| `FolderRow.vue` | 103 | Tree/browser folder row. Legacy Library only. |
| `FileBrowser.vue` | 426 | Area browser with breadcrumbs, search, upload dropzone, bulk actions. Legacy Library only. |
| `FileRow.vue` | 97 | File row + actions slot. Reusable as the v4 selected-file row after decoupling from `area`/`absolutePath`. |
| `FileActions.vue` | 58 | Dropdown of file actions. Reusable in the new result/selected lists. |
| `ContextMenu.vue` | 47 | Generic right-click menu. Reusable. |
| `FolderModal.vue` | 62 | Create subfolder. Legacy. |
| `RenameModal.vue` | 65 | Rename. Legacy, but the shell may reuse it for "save as". |
| `TrashModal.vue` | 175 | Trash list with restore/permanent delete. Kept, still user-facing. |
| `ConfirmAction.vue` | 65 | Small inline confirm. Reusable. |
| `PreviewFile.vue` | 299 | PDF/image/data preview with download/convert. **Reuse as-is** for v4 previews (§21.6). |
| `PreviewTable.vue` | 138 | CSV/XLSX table preview. Reusable. |
| `PreviewText.vue` | 55 | Text/JSON/XML preview. Reusable. |
| `OperationResult.vue` | 83 | Post-run result list with per-file preview/download. **Reuse**; needs an output-destination variant. |
| `DocumentDataFlowNote.vue` | 96 | Input→output explanation per operation. Reuse, retargeted to the new registry metadata. |
| `ExportFormatPicker.vue` | 50 | Format checkboxes. Reusable. |
| `PresetSampleEditor.vue` | 390 | Extraction preset editor. Reuse untouched (§0.3 AI preset rule). |

Shared, non-PDF components usable by v4:
`app/components/base/Page.vue` (page shell), `base/ConfirmModal.vue`, `base/ResponsiveModal.vue`,
`base/FilePicker.vue` (Electron-only path picker), `base/FormModal.vue`, `base/Table.vue`.

## 6. Pages, operations, APIs

### Pages

| Route | File | Operation |
| --- | --- | --- |
| `/pdf` | `index.vue` (316) | Home: operation cards, area counts, repair, AI model count |
| `/pdf/library` | `library.vue` (194) | Explorer over the 7 visible areas + trash |
| `/pdf/split` | `split.vue` (283) | Split a source; merge a split folder |
| `/pdf/images` | `images.vue` (280) | PDF→PNG; PNG folder→PDF |
| `/pdf/import` | `import.vue` (237) | Upload non-PDF inputs; convert to PDF |
| `/pdf/export` | `export.vue` (327) | Export a source to png/docx/xlsx/csv/json/xml |
| `/pdf/extract` | `extract.vue` (659) | AI price-list extraction (async job + presets) |
| `/pdf/preview` | `preview.vue` (86) | Standalone preview window |

### API (48 route files)

Operation endpoints and their real request/response shapes:

| Method + path | Body | Response `data` |
| --- | --- | --- |
| `POST /api/v1/pdf/upload` | multipart `files[]`, `folder` | `PdfFileInfo[]` |
| `POST /api/v1/pdf/word/upload` | multipart `files[]` | `PdfFileInfo[]` (now rejects: read-only) |
| `POST /api/v1/pdf/inputs/upload` | multipart `files[]`, `folder` | `PdfFileInfo[]` |
| `POST /api/v1/pdf/sources/{name}/split` | `{ overwrite? }` | `{ folder, totalPages, dir }` |
| `POST /api/v1/pdf/split/{name}/merge` | `{ overwrite? }` | `{ file, pages }` |
| `POST /api/v1/pdf/sources/{name}/images` | `{ overwrite? }` | `{ folder, pages }` |
| `POST /api/v1/pdf/images/{name}/pdf` | `{ overwrite? }` | `{ file, pages }` |
| `POST /api/v1/pdf/inputs/{name}/pdf` | `{ overwrite? }` | `PdfFileInfo` |
| `POST /api/v1/pdf/word/{name}/pdf` | `{ overwrite? }` | `PdfFileInfo` |
| `POST /api/v1/pdf/sources/{name}/export` | `{ formats[], overwrite? }` | `PdfExportFormatResult[]` |
| `POST /api/v1/pdf/extract/start` | `{ source, force?, overwrite?, connectionId?, model?, preset? }` | `PdfExtractJobState` |
| `POST /api/v1/pdf/extract/{id}/cancel` | — | boolean |
| `GET /api/v1/pdf/extract/jobs` | — | `PdfExtractJobState[]` |
| `GET /api/v1/pdf/extract/{id}` | — | `PdfExtractJobSummary` |
| `GET /api/v1/pdf/extract/models` | `?refresh=1` | live model catalogue from the hub relay |
| `GET/POST/DELETE /api/v1/pdf/extract/presets[/{id}]` | preset fields | `PdfExtractPreset[]` |

Read/administrative endpoints: `library`, `workspace`, `workspace/repair`, `inspect`, `file`,
`directory`, `directory/folder|rename|delete`, `explorer`, `explorer/children`, `trash*`, `audit`,
plus per-area `GET`/`DELETE` under `sources|split|images|merged|products|office|word`.

All succeed with `{ success: true, data }` or fail through `runPdf()`
([`server/utils/pdfApi.ts`](../../server/utils/pdfApi.ts)) which maps module error codes to HTTP
status and puts the code in `statusMessage`/`message`.

### Output mapping (`server/modules/pdf/workspace.ts`)

`split→split`, `merge→merged`, `rasterize→images`, `imagesToPdf→merged`, `convertInput→merged`,
`export→office`, `extract→products`. Export additionally splits one run across three areas:
`png→images`, `docx→office`, `xlsx|csv|json|xml→products`.

## 7. Engines in use

| Engine | Module | Library | Filesystem coupling |
| --- | --- | --- | --- |
| Split | `document.ts` `splitPdf(inputPath, outputDir)` | `pdf-lib` | **absolute paths in and out** |
| Merge | `merge.ts` `mergePdfFolder(folderPath, outputDir, name)` | `pdf-lib` | **folder path in, writes file** |
| Rasterize | `raster.ts` `rasterizePdf(inputPath, outputDir, scale)` | `pdf-to-img` → `pdfjs-dist` → `@napi-rs/canvas` | **paths both ends** |
| Images→PDF | `images-to-pdf.ts` | `pdf-lib` | **folder path in** |
| Convert input | `convert.ts` `inputToPdf(rawName)` | `pdf-lib`, `exceljs`, `mammoth` (via `data/*`), `office/docxToPdf` | **resolves area paths itself** |
| PDF→DOCX | `office/pdfToDocx.ts` | `pdfjs-dist/legacy` + `docx` | buffer in, buffer out |
| DOCX→PDF | `office/docxToPdf.ts` | `mammoth` + `pdf-lib` | buffer in, buffer out |
| DOCX→text | `office/docxParse.ts` | `mammoth` | buffer in, buffer out |
| Data → PDF | `data/to-pdf.ts` | `exceljs` | buffer in, buffer out |
| Products export | `extract/export.ts` | `exceljs` + `docx` | **writes 5 files into a dir** |
| AI extraction | `extract/provider.ts`, `jobs.ts` | `pdf-to-img`, hub AI relay over HTTP | **reads split PDFs from disk, writes checkpoints** |

Native dependency reality: `pdf-to-img` requires `@napi-rs/canvas`, installed as a Windows x64
prebuilt (`node_modules/.pnpm/@napi-rs+canvas-win32-x64-msvc@1.1.0`). On Vercel the Linux binary must
resolve through the optional-dependency matrix, so rasterize and AI extraction are the two engines
most likely to fail on a cloud runtime — they are marked `cloudAllowed: false` until proven.

Buffer-first engines (`pdfToDocx`, `docxToPdf`, `docxToText`, `toPdf` from data) are already
storage-agnostic and need no compatibility work.

## 8. Extraction job / checkpoint durability

- Job state: `const jobs = new Map<string, JobEntry>()` in
  [`server/modules/pdf/extract/jobs.ts:42`](../../server/modules/pdf/extract/jobs.ts#L42). **In-memory
  only**, capped at 20 entries, pruned oldest-first.
- Checkpoints: `<pdf root>/checkpoints/<stem>/<page>.json`, written atomically. **Durable across
  restarts** and read back to skip already-extracted pages.
- Presets: `<pdf root>/presets.json`, durable.
- Consequence: on a restart the checkpoint cache survives but the job record is lost, so the UI
  cannot show a finished job. On Vercel every Function invocation is a fresh process, so an async job
  started in one invocation is invisible to the next one. This is exactly what §9.1 forbids.

## 9. Auth identity and existing database

- Identity: hub-issued JWT (`role`, `permissions`, `capabilities`, `appId`). Available as
  `event.context.auth` on every `/api/` request.
- Databases present: MongoDB via the official driver
  ([`server/modules/database/shared.ts`](../../server/modules/database/shared.ts)) for auth users,
  roles, routes, configs, notifications; SQLite via `better-sqlite3` for the chat history store
  (`server/modules/chat/store.ts`), path `TOOLS_DATA_DIR/chat.sqlite`.
- `better-sqlite3` loads successfully in this environment (verified with an in-memory query).
- Neither database has a document/job table. Phase 5 must add one; MongoDB is the natural choice
  because it is already required for auth, so no new service appears on Vercel.

## 10. Build & test baseline

| Check | Command | Result (2026-11-06 15:54) |
| --- | --- | --- |
| Typecheck | `npx nuxt typecheck` | exit 0, 0 × `error TS` |
| ESLint | `npx eslint` on all PDF sources | exit 0 after config regeneration |
| Unit suite | `pnpm test` | 27/27 specs |
| Build (local) | `pnpm build` not re-run in this pass | last `.output` is `node-server`, 67 MB, built 2026-11-03 |
| Vercel | none | no `vercel.json`, no preset, never deployed |

Test harness facts that constrain new specs: `tests/unit/run-all.mts` runs one `tsx` process per
`*.spec.ts` with `tsconfig.test.json`, whose paths map `~/*`, `#server/*`, `#shared/*`. Several PDF
specs set `process.env.PDF_DATA_DIR` to a temp directory **before** importing the module, because
`config/index.ts` reads the environment at import time.

## 11. Required changes, risks, compatibility plan, files

### Capability matrix by operation × runtime

| Operation | Dev local | Electron | Vercel web | Engine storage-agnostic? |
| --- | --- | --- | --- | --- |
| Split | yes | yes | yes (bounded) | no — path in/out, easy to wrap |
| Merge | yes | yes | yes (bounded) | no — folder in |
| PDF→Images | yes | yes | **unproven** (native canvas) | no |
| Images→PDF | yes | yes | yes (bounded) | no — folder in |
| Convert input→PDF | yes | yes | yes (bounded) | no — resolves area paths |
| Export PDF | yes | yes | yes (bounded) | partly (PDF→DOCX is buffer-only) |
| AI extraction | yes | yes | **no** (long job, native canvas, relay) | no |

### Planned v4 changes

1. `shared/types/document/**` — operation definition, selected input, storage ref, job, artifact,
   output destination, runtime capabilities, error codes.
2. `server/modules/document/{storage,temporary,jobs,output,runtime,operations}` — adapters behind
   interfaces, with a `local` implementation first and a `cloud` implementation stubbed behind the
   same contract.
3. New `/api/v1/documents/**` surface (operations catalog, run, jobs, artifacts, upload session,
   finalize, capabilities) while every existing `/api/v1/pdf/**` route keeps working.
4. New task-first UI (`/document-studio/**`) with a shared operation shell, built from
   `FileRow`/`FileActions`/`OperationResult`/`PreviewFile` where the components are not
   area-coupled.
5. Legacy `.data/pdf` areas stay untouched and readable through the existing endpoints; the new
   runtime adds `input/`, `output/`, `.system/jobs/` beside them.

### Risks

| Risk | Mitigation |
| --- | --- |
| Engines take absolute paths | Wrap them with a staging adapter: materialize input into a temp dir, call the engine, publish from the temp output. No engine rewrite. |
| Electron prod PDF root is under Program Files | Resolve the PDF root from `TOOLS_DATA_DIR` when set, falling back to `process.cwd()` for dev/web paranoia — same pattern as the chat store. |
| Vercel has no filesystem | Local provider selected only when the runtime is local/electron; cloud provider gated behind capability flags and never selected silently. |
| In-memory extraction jobs | New job repository writes JSON under `.system/jobs/` locally; cloud repository interface reserved for Phase 5. |
| Duplicate file panels | The operation shell owns one selected-file list and one result list; the explorer is not mounted inside operation routes. |
| Locale drift | Every new key goes into `en.json` **and** `vi.json` in the same edit. |

### Files expected to change

New: `shared/types/document/*.ts`, `server/modules/document/**`, `server/api/v1/documents/**`,
`app/pages/document-studio/**`, `app/components/document-studio/**`, `app/composables/useDocument*.ts`,
`tests/unit/document_*.spec.ts`, `docs/document-studio/*.md`.

Touched: `server/config/index.ts` (PDF root resolution), `server/modules/pdf/paths.ts` (new
subdirectories), `app/utils/pdfOperations.ts` (kept as the legacy metadata source), i18n locales,
and the PDF Home page link block.

Unchanged in Phase 1–4: every `server/modules/pdf/*` engine, every existing `/api/v1/pdf/**` route,
`electron/**`, `nuxt.config.ts`.
