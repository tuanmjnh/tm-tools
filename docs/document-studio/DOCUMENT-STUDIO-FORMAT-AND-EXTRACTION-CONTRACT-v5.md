# TM Tools — Document Format, Conversion & AI Extraction Contracts v5

> **Companion contract document** for `DOCUMENT-STUDIO-STANDARDIZATION-SPEC-v5.md`.  
> Purpose: make future format/operation additions deterministic, testable and discoverable without growing a page/folder tree per format.

## 1. Responsibility boundaries

| Layer | Answers | Owns |
|---|---|---|
| Format Registry | Which file formats can the system identify? | Format IDs, extensions, MIME, signatures, preview kind |
| Operation Registry | Which user jobs exist? | Operation ID, inputs, configuration schema, output contract, execution profile |
| Conversion Matrix | Which source→target paths are implemented? | Directed conversion edge, strategy, executor ID, runtime restrictions |
| Executor Registry | Which code actually performs the work? | Validation and processing implementation |
| Runtime Capability | Can this deployment execute this edge now? | local/Electron/Vercel/worker limits and disabled reason |
| UI Config Registry | Which configuration component edits this operation? | `componentKey` → Vue component mapping |

A format can exist without any conversion edge. A conversion edge can be unavailable on one runtime and enabled on another. An operation must not be shown as executable without a registered executor.

---

## 2. Canonical format IDs

Use lowercase, extension-independent IDs. An initial registry may include:

| Format ID | Extensions | MIME examples | Category | Safe preview |
|---|---|---|---|---|
| `pdf` | `.pdf` | `application/pdf` | document | PDF viewer |
| `docx` | `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | document | download / desktop OS; optional text preview |
| `doc` | `.doc` | legacy MS Word MIME | document | download / desktop OS |
| `xlsx` | `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | spreadsheet | sanitized table preview if parser is available |
| `xls` | `.xls` | legacy Excel MIME | spreadsheet | download unless parser is proven |
| `csv` | `.csv` | `text/csv` | spreadsheet | escaped table/text preview |
| `json` | `.json` | `application/json` | structured-data | text/tree viewer, escaped |
| `xml` | `.xml` | `application/xml`, `text/xml` | structured-data | escaped text/tree viewer; no active rendering |
| `png` | `.png` | `image/png` | image | image viewer |
| `jpg` | `.jpg`, `.jpeg` | `image/jpeg` | image | image viewer |
| `webp` | `.webp` | `image/webp` | image | image viewer |
| `txt` | `.txt` | `text/plain` | text | text viewer |
| `zip` | `.zip` | `application/zip` | archive | archive listing only when safe parser exists |

Only add a format after defining parser/signature policy, size limits, MIME behavior, tests and whether output is previewable. Never infer `formatId` from a client-supplied MIME without validation.

### Detection order

1. Normalize filename extension.
2. Read declared MIME as a hint only.
3. Inspect magic bytes/signature where supported.
4. Reject extension/signature mismatch for formats requiring signature validation.
5. Store the server-detected `formatId` and trusted `mimeType` in manifest.

---

## 3. Initial conversion matrix

This is the recommended initial catalogue derived from engines already present in `tm-tools`. It separates currently supported behavior from new future work.

| Source | Target | Operation / strategy | Baseline status | Notes |
|---|---|---|---|---|
| `pdf` | `pdf` | `pdf.split`, `pdf.merge` | Existing | Split/merge executor in Document v4; preserve order/cardinality contract |
| `pdf` | `png` | `pdf.rasterize` | Existing | Native canvas dependency; local/Electron first; cloud only when proven |
| `png`, `jpg` | `pdf` | `pdf.images-to-pdf` | Existing | Ordered input list |
| `docx` | `pdf` | `document.convert` / layout | Existing | Existing buffer-based conversion path; verify layout limitations |
| `xlsx` | `pdf` | `document.convert` / layout | Existing | Existing data-to-PDF path; not a faithful Excel print engine unless proven |
| `csv` | `pdf` | `document.convert` / layout | Existing | Convert to a structured table layout |
| `json` | `pdf` | `document.convert` / layout | Existing | Render readable structured data layout |
| `xml` | `pdf` | `document.convert` / layout | Existing | Render readable structured data layout |
| `pdf` | `docx` | `pdf.export` | Existing | PDF-to-DOCX is approximate reconstruction, not pixel-identical |
| `pdf` | `xlsx/csv/json/xml` | `pdf.export` | Existing with prerequisite | Requires valid cached AI extraction rows for the same source/fingerprint |
| `pdf` | `docx` / `csv` / `xlsx` / `json` / `xml` | `document.ai-extract` + export | Existing legacy AI engine; migration required | Make it a Document Job operation; model/preset/format chooser required |
| `xlsx` | `docx` | `spreadsheet.xlsx-to-docx` | Future | Needs explicit table/layout/template mapping; do not mark available yet |
| `docx` | `xlsx` | `document.docx-table-extract` | Future | Requires rules for table selection, merged cells, headers, multi-table output |
| `xml` | `json` | `structured.xml-to-json` | Future | Must define attributes, namespaces, repeated nodes, text nodes, mixed content and array policy |
| `json` | `xml` | `structured.json-to-xml` | Future | Must define root name, arrays, scalar roots, null values and attribute convention |
| `csv` | `xlsx` | `spreadsheet.csv-to-xlsx` | Future / simple deterministic | Specify delimiter, encoding, quoting, date/number coercion and formula injection handling |
| `xlsx` | `csv` | `spreadsheet.xlsx-to-csv` | Future / sheet selection required | Define sheet index/name and multiple sheet behavior |

**Important:** the existing `document.convert-to-pdf` accepts several extensions. That does not imply all pairwise conversions are available. UI must show exactly the source/target edges returned by Conversion Matrix.

### 3.1 Format conversion UI

Use one central Convert operation page. Its controls:

- Source file picker.
- Source format label detected by server.
- Target format selector populated from allowed outgoing edges only.
- Optional operation-specific settings for the chosen edge.
- Capability / limitation note.
- Output filename/destination summary.

Do not create `excel-to-word.vue`, `xml-to-json.vue`, `json-to-xml.vue` as independent pages. They are selectable edges within Convert. A workflow may have its own config component only when the interaction is genuinely complex.

### 3.2 Conversion behavior types

- `binary`: pure container/format transformation without content interpretation.
- `layout`: reconstruct a document layout, e.g. tabular data into PDF.
- `structured-data`: map data model to a different serialization.
- `ocr`: detect text from image/PDF scan.
- `ai-assisted`: use model/provider and a declared output schema.

The UI must say which behavior applies. Do not promise pixel-perfect conversion for a layout reconstruction or semantic extraction.

---

## 4. Operation definition contract

Recommended shared type additions in `shared/types/document/index.ts`:

```ts
export interface DocumentOperationInputSpec {
  acceptedFormatIds: string[]
  minFiles: number
  maxFiles: number
  ordered: boolean
  allowFromInputLibrary: boolean
  allowFromOutputLibrary: boolean
}

export interface DocumentOperationConfigSpec {
  componentKey: string
  schemaVersion: number
  defaults: Record<string, unknown>
}

export interface DocumentOperationOutputSpec {
  formatIds: string[] | 'user-selectable'
  artifactMode: 'single' | 'multiple' | 'variable' | 'archive'
}

export interface DocumentOperationDefinition {
  id: string
  slug: string
  version: string
  category: string
  titleKey: string
  descriptionKey: string
  icon: string
  enabled: boolean
  input: DocumentOperationInputSpec
  configuration: DocumentOperationConfigSpec
  output: DocumentOperationOutputSpec
  execution: {
    mode: 'inline' | 'async' | 'worker'
    supportsProgress: boolean
    supportsCancel: boolean
    supportsPartial: boolean
    resourceProfile: string
  }
}
```

Use existing `DocumentOperationDefinition` and `DocumentRuntimeCapabilities` as the starting point; do not copy this sample blindly if the repository already has equivalent properties. Add fields incrementally and update both server + shared type tests.

### Registry validation rules

At boot/test time verify:

1. Operation IDs are unique.
2. Every operation has one registered executor, unless explicitly `catalogOnly`/disabled with a reason.
3. Every `componentKey` resolves to a registered config component or a known built-in `none`.
4. Every input/output `formatId` exists in Format Registry.
5. Every route slug is unique.
6. Every conversion edge points to known source and target formats and an existing executor.
7. Runtime support declarations do not exceed executor support.
8. i18n title/description and all field keys exist in both `en` and `vi`.

---

## 5. AI Extraction operation contract

### 5.1 Operation identity and input

Use stable ID `document.ai-extract`, slug `extract`, route `/document-studio/tools/extract`.

Input format support must be explicit. Current legacy engine supports PDF page/vision extraction and DOCX text-chunk extraction through `server/modules/pdf/extract/jobs.ts`; audit actual `anySourcePath()` and allowed areas before enabling both in the new operation. Do not claim image OCR or XLSX extraction until there is a corresponding tested executor.

Source resolution: a Document Job must read the file staged in its own workspace
(`VerifiedInput.stagedPath`, produced by the stage-once upload). It must not copy
that upload into `input/`: the job input is use-once data, not a library entry.
The logical source name (`VerifiedInput.safeName`) is still what names products
and checkpoint directories, while checkpoint identity hashes the source bytes, so
two uploads with the same name but different content never share checkpoints. A
caller without a staged source (the legacy `/pdf` tool pages) keeps resolving
through `anySourcePath()` against `input/`. `resolveExtractSource()` is the single
place that decides between the two, and a missing file throws
`PDF_SOURCE_NOT_FOUND` either way.

### 5.2 Model choice

Recommended config:

```ts
interface AiExtractionRunConfig {
  connectionId: string
  modelId: string
  presetId?: string | null
  promptOverride?: {
    description?: string
    sample?: string
  }
  outputFormats: Array<'csv' | 'xlsx' | 'json' | 'xml' | 'docx'>
  forceReprocess: boolean
  overwrite: boolean
  checkpointPolicy: 'reuse-valid' | 'force-reprocess'
}
```

Use the connected Hub provider catalogue. The picker must display:

- provider brand/name,
- connection label,
- model display name,
- optional recommended/default marker.

Only text-capable models are offered: the server filters the relay catalogue
through `isTextModel()` in `server/utils/relayModels.ts`, shared with
`/api/v1/chat/models`, so TTS, audio, live, image and embedding models never
appear in either picker. When the catalogue cannot be fetched, the field shows
the relay error (`error.aiRelayNotConfigured` / `error.aiRelayUnauthorized`) with
a forced-refresh button (`?refresh=1`) and a link to `/system/settings/hub` for
device enrollment, rather than an empty dropdown.

Internally store `connectionId` and stable model ID; display label is not an identifier. Revalidate on server before dispatch. If the selected connection/model was removed or revoked, return a typed error and ask the user to choose another; do not silently fall back to another provider for a deliberate explicit selection. A fallback may be offered only for an unset/default model.

Never store AI API keys in tm-tools.

### 5.3 Prompt presets

Existing preset fields and limits are the compatibility baseline:

| Field | Existing maximum |
|---|---:|
| `name` | 80 chars |
| `description` | 6,000 chars |
| `sample` | 16,000 chars |
| Number of presets | 40 |

Support list/create/update/delete. The page must allow selecting, creating, editing and deleting presets. Do not force users to edit JSON source code.

Implemented in `AiExtractionConfig.vue`: the preset row exposes select, create,
edit and delete actions; the editor is a modal over the existing
`GET/POST /api/v1/pdf/extract/presets` and `DELETE /api/v1/pdf/extract/presets/:id`
endpoints, and surfaces `PDF_PRESET_NAME_REQUIRED` / `PDF_PRESET_LIMIT` inline.
Presets are stored in `presets.json` under the deployment pdf root, which in the
packaged app resolves to the Electron userData directory. Delete asks for
confirmation and leaves already-produced job output untouched.

Because the checkpoint fingerprint includes the preset and its prompt content,
selecting a different preset starts fresh rows instead of reusing cached ones.
The picker hint must say so; it must not claim that changing the model or preset
keeps the cache.

Use versioned config internally:

```ts
interface AiExtractionPromptConfig {
  schemaVersion: 1 | 2
  presetId?: string | null
  promptDescription: string
  sampleOutput: string
  outputSchemaId: string
  temperature?: number
}
```

Existing `{description, sample}` map to `promptDescription` and `sampleOutput`. The engine's fixed system constraints and data schema must remain authoritative; user prompt must not be able to remove safety/format constraints or make the parser accept arbitrary object shapes.

### 5.4 Output formats

Initial selectable export choices:

- `csv`
- `xlsx`
- `json`
- `xml`
- `docx`

The server catalogue should return `available`, `unavailableReason`, and `requiresCachedRows` or equivalent. Disable only formats that truly cannot be generated for the current source/run. A completed run must create artifacts in the common Document output publisher, not only write to legacy `products/`.

### 5.5 Checkpoint and re-run behavior

Fingerprint includes:

- source content SHA-256,
- number of pages/chunks,
- extractor schema version,
- normalized prompt content,
- preset ID and revision/fingerprint,
- AI connection ID,
- model ID,
- extraction engine version,
- output schema version.

`forceReprocess=true` bypasses reuse. A filename-only match is never enough. Preserve previous checkpoints during migration; do not invalidate all cached runs by moving directories without a versioned lookup/mapping.

### 5.6 Progress and cancel

Expose progress as typed job progress:

```ts
interface AiExtractionProgress {
  totalUnits: number
  completedUnits: number
  cachedUnits: number
  failedUnits: number
  currentUnit?: string
  stage: 'preparing' | 'rendering' | 'extracting' | 'normalizing' | 'exporting' | 'publishing'
}
```

Map to the existing `DocumentJobProgress` shape where possible; if detail fields are needed, use a typed operation-specific `progressDetail` safe payload. Cancel should stop scheduling new work and honor the current provider request's cancellation semantics; mark job status through the shared job state machine.

### 5.7 Worker/runtime policy

AI extraction can be long-running, vision-heavy and provider-rate-limited. Local/Electron may run under the supported local executor. Vercel should remain disabled unless the full async lifecycle is moved to a durable external worker with queue, job lease, heartbeat, retry, cancellation, idempotency and persistent artifact publishing. `/tmp` single-request mode is not an AI job engine.

---

## 6. Common Job and artifact contract

Reuse existing `/api/v1/documents` API envelope and `DocumentJobView`, `DocumentArtifactView` contracts. Avoid introducing `/api/v1/ai-extract/jobs` as a second job API.

A job config snapshot must be versioned and include operation settings but must exclude secrets, signed grants and absolute paths.

Artifact metadata should identify:

- artifact ID and job ID,
- filename, trusted `formatId`, MIME type, size,
- `input`/`output` role or output publication state,
- expiry/retention status,
- safe authenticated `downloadPath`,
- optional `localPath` only for local/Electron,
- preview capabilities.

A local artifact `localPath` is an OS path used by server-side Electron bridge only; browser must not display it as a link or submit it to a cloud API.

---

## 7. Activity artifact action decision table

| Runtime | PDF/image | Text/CSV/JSON/XML | DOCX/XLSX/other office |
|---|---|---|---|
| Local/Electron with `localPath` | `Open` OS app + optional in-app Preview + Download + Reveal folder | `Open` OS app + optional safe text/table preview + Download + Reveal folder | `Open` OS app + Download + Reveal folder |
| Browser/cloud, authenticated stream | In-app Preview if MIME/viewer allowlisted + Download | Safe text/table preview only if parser/viewer supports it + Download | Download; no fake inline preview |
| Ephemeral one-response | Download/Save from inline artifact payload | Download/Save if supported | Download/Save if supported |

Implementation detail:

- `openLocalPath()` should be called only when `isDesktopRuntime()` and `artifact.localPath` exist.
- `revealLocalPath()` is separate from Open.
- `inlinePreviewPath()` should be used only when server endpoint will answer with `Content-Disposition: inline` for the exact MIME.
- Never broaden inline MIME allowlist to arbitrary Office, HTML, SVG or unknown types.
- Keep `X-Content-Type-Options: nosniff`, owner check and `Cache-Control: no-store`.

---

## 8. Library contract

```ts
interface DocumentLibraryQuery {
  role: 'input' | 'output'
  q?: string
  formatIds?: string[]
  cursor?: string
  limit?: number
  sort?: 'name' | 'createdAt' | 'sizeBytes'
  order?: 'asc' | 'desc'
}

interface DocumentLibraryPage {
  items: DocumentLibraryItem[]
  nextCursor?: string | null
  total?: number
}
```

Library UI must not fetch every file and filter all rows client-side for unbounded collections. Use server search and cursor pagination, with `limit` capped server-side. Folder support, if retained, is a relative grouping beneath input/output and must not create new root roles.

---

## 9. Error contract additions

Prefer existing `DOCUMENT_*` codes. Add typed errors only when needed, for example:

- `DOCUMENT_FORMAT_NOT_RECOGNIZED`
- `DOCUMENT_FORMAT_MISMATCH`
- `DOCUMENT_CONVERSION_NOT_SUPPORTED`
- `DOCUMENT_CONVERSION_CONFIG_INVALID`
- `DOCUMENT_AI_MODEL_REQUIRED`
- `DOCUMENT_AI_MODEL_UNAVAILABLE`
- `DOCUMENT_AI_PRESET_NOT_FOUND`
- `DOCUMENT_AI_RESPONSE_INVALID`
- `DOCUMENT_AI_PROVIDER_RATE_LIMITED`

Map all errors in server `DocumentError`, HTTP status, and both locale files. Do not leak upstream provider response, prompt secrets, storage URL, absolute path or raw stack trace into user-safe messages.

---

## 10. Tests required for each new format/operation

- Format detection: extension, MIME mismatch, magic-byte validation, malformed file, very large input.
- Conversion: correct edge enabled/disabled, correct output type/signature, output opens in expected viewer, known limitations documented.
- Data semantics: arrays/null/namespaces/encoding/date/number handling where relevant.
- Executor: deterministic output, typed failure, cancellation/progress if claimed, no writes outside job workspace.
- Registry: duplicate IDs/edges, missing executor, missing config renderer, unknown format, unsupported runtime.
- Security: owner boundary, path traversal, output filename collision, formula injection in CSV/XLSX, XML external entity (XXE) disabled, active content preview denied.
- AI: dynamic connection/model list, removed model behavior, prompt preset CRUD, versioned config conversion, fingerprint invalidation, checkpoint reuse, provider timeout/rate limit, partial export behavior.
- Activity: local/Electron open, reveal folder, preview whitelist, download action, cloud stream no signed URL leak.

---

## 11. Adding a future conversion in the correct way

Example: adding `xlsx → docx`:

1. Confirm output semantics with a documented layout policy (each sheet, table, header, merged cell, images, page break, template support).
2. Add or verify source/target formats in Format Registry.
3. Add one directed edge `spreadsheet.xlsx-to-docx` to Conversion Matrix.
4. Implement executor using `OperationExecutionContext` and workspace paths/buffers only.
5. Add a schema/config component only if user options are required.
6. Add output validation and a real integration fixture with representative workbook cases.
7. Add runtime capability only for runtimes where dependencies pass.
8. Confirm Home/Convert page discovers the edge without creating a new Vue route.
9. Add i18n and documentation for known conversion loss/limitations.

Example: adding XML↔JSON must explicitly define namespace, attribute, repeated element, mixed content, root element, arrays and null conventions; round-trip equivalence must be tested. Never claim lossless bidirectional conversion where representation models differ.

---

## 12. Compatibility adapters

- Keep old `PdfOfficeFormat`, `PdfFileArea` and PDF export routes for the legacy API during transition.
- Translate legacy export selection into the new typed operation config at the adapter boundary.
- Keep `presets.json` readable and migrate to versioned preset storage with a stable ID.
- Keep old extraction API endpoint shape during transition, but route new execution through the shared Document operation/job service.
- Do not let new pages import old `usePdfStudio()` or `usePdfExplorer()`.

---

## 13. Acceptance checklist

- [ ] Format Registry and Operation Registry are separate modules.
- [ ] Conversion Matrix enumerates only real source→target edges.
- [ ] Every enabled edge has a registered executor and runtime policy.
- [ ] Convert page reads capabilities and does not create per-pair pages.
- [ ] AI Extraction uses the shared Document Job and Artifact pipeline.
- [ ] Provider/model list is dynamic from Hub and no API key exists in tm-tools.
- [ ] Preset selection/create/edit/delete still works, with old preset migration.
- [ ] CSV/XLSX/JSON/XML/DOCX export selection is present and capability-aware.
- [ ] Extraction outputs are published through the common Output pipeline.
- [ ] Local/Electron Activity Open uses `artifact.localPath` and OS handler.
- [ ] Browser inline preview is MIME-whitelisted; office files download unless a safe viewer exists.
- [ ] No new per-format page tree or per-format storage roots are added.
