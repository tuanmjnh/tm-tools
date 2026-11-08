# Operations catalog

Source of truth: `server/modules/document/operations.ts` (server) and
`app/utils/documentStudio.ts` (titles, icons, routes). A spec
(`tests/unit/document_studio_ui.spec.ts`) pins the two lists to the same seven
ids.

## 1. Registered operations

| Id | Version | Mode | Input | Engine adapter | Route | Legacy route |
| --- | --- | --- | --- | --- | --- | --- |
| `pdf.split` | 1.0.0 | inline | 1 PDF | `splitPdf()` | `/document-studio/tools/split` | `/pdf/split` |
| `pdf.merge` | 1.0.0 | inline | 2–50 PDFs, ordered | `mergePdfFolder()` | `/document-studio/tools/merge` | `/pdf/split` |
| `pdf.rasterize` | 1.0.0 | inline | 1 PDF | `rasterizePdf()` | `/document-studio/tools/images` | `/pdf/images` |
| `pdf.images-to-pdf` | 1.0.0 | inline | 1–200 images, ordered | `imagesToPdf()` | `/document-studio/tools/images-to-pdf` | `/pdf/images` |
| `document.convert-to-pdf` | 1.0.0 | inline | 1 office/data/image file | `inputBufferToPdf()` | `/document-studio/tools/convert` | `/pdf/import` |
| `pdf.export` | 1.0.0 | inline | 1 PDF | `pdfToDocx()`, `rasterizePdf()`, `writeProducts()` | `/document-studio/tools/export` | `/pdf/export` |
| `document.ai-extract` | 1.0.0 | async | 1 PDF | **engine kept, no v4 executor** | — | `/pdf/extract` |

`document.ai-extract` is registered so the catalogue describes the product, but
it has no v4 executor: `/api/v1/documents/operations` filters it out, the Home
page shows six cards, and the AI feature continues to run on `/pdf/extract` and
`/api/v1/pdf/extract/**` exactly as before. That is deliberate per the
completion guide §7.1 — a second UI for the same engine is not a migration.

Phase 7 changed the extraction engine in two ways that do not alter its API:

- **Durable job journal.** `server/modules/pdf/extract/job-store.ts` writes each
  state change under `.data/pdf/.system/extract-jobs/<jobId>.json`, so
  `GET /pdf/extract/jobs` and `GET /pdf/extract/:id` still answer after a
  restart. Previously the job list lived only in a `Map`.
- **Checkpoint fingerprints.** A page checkpoint is reused only when the source
  hash, page count, schema, prompt, preset, model, connection and checkpoint
  version all match; the directory is
  `checkpoints/<stem>/v2-<hash>/` (`checkpoint.ts`). A filename match is no
  longer enough to serve stale rows. The export reader accepts both the old flat
  layout and the new subdirectory.

## 2. Per-operation contract

### `pdf.split`

- Accepted: `.pdf`; exactly one file.
- Output: one PDF per page, named `page_0001.pdf…`, artifact mode `multiple`.
- Progress: `totalUnits = completedUnits = page count`.
- Legacy semantics preserved: the v3 route still writes into `split/<stem>/`;
  the v4 runner writes into the job workspace and publishes to `output/`.

### `pdf.merge`

- Accepted: `.pdf`; 2–50 files; **ordered** (the picker offers move up/down).
- Ordering: inputs are copied as `0001_<name>` into `working/merge` so the
  engine's `naturalCompare` sort reproduces the user's order.
- Output: one `${firstStem}_merged.pdf`.
- Note: the v3 route merges one split *folder*; v4 merges the selected files.
  Both remain available during migration (spec §13.3).

### `pdf.rasterize`

- Accepted: `.pdf`; one file.
- Output: `page_0001.png…` at `config.pdf.imageScale`.
- Runtime: local/electron only — the native canvas build is not proven on Vercel.

### `pdf.images-to-pdf`

- Accepted: `.png`, `.jpg`, `.jpeg`; 1–200 files; ordered.
- Output: one `${firstStem}_from_images.pdf`, one page per image.

### `document.convert-to-pdf`

- Accepted: `.png`, `.jpg`, `.jpeg`, `.docx`, `.xlsx`, `.csv`, `.json`, `.xml`; one file.
- Output: one `${stem}.pdf`.
- The UI states that Office/data files are rebuilt as a PDF layout, not a
  pixel-faithful copy.

### `pdf.export`

- Accepted: `.pdf`; one file.
- Config: `{ formats: ('png'|'docx'|'xlsx'|'csv'|'json'|'xml')[] }`, at least one.
- Output: variable — PNG folder, one `.docx`, or the product export set.
- Partial success: a format that fails or has no cached rows is counted in
  `failedUnits`; if at least one artifact is produced the job ends `partial`.
- `xlsx|csv|json|xml` require rows a previous AI extraction cached for the same
  document; the page says so instead of failing silently.

## 3. Adding an operation

1. Add the id to `DOCUMENT_OPERATION_IDS` in `shared/types/document/index.ts`.
2. Add the definition to `DOCUMENT_OPERATIONS`.
3. Implement `DocumentOperationExecutor` in `executors.ts` and register it in
   `EXECUTORS`.
4. Add a `document.operations.<name>` i18n block in **both** locales.
5. Add the client entry in `app/utils/documentStudio.ts` plus a page under
   `app/pages/document-studio/tools/`.
6. Extend `tests/unit/document_studio_ui.spec.ts` (id list) and add an
   execution test in `document_local_runtime.spec.ts`.
7. Only mark it cloud-allowed after proving the native dependency builds on the
   target runtime.
