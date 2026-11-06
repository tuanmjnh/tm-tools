# PDF Studio — Document Workspace audit

Audit for [`TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md`](./TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md),
v2 revision captured 2026-11-05 against the code that actually ships in this repo.

The v1 spec assumed an `01-sources/…` numbered layout and a preload/IPC
filesystem bridge. Both were wrong for this repo; v2 is corrected to the layout
in §2 and to Nitro as the privileged process.

## 1. Kiến trúc thực tế

PDF files are read and written by the Nitro server of this same Nuxt app, and the
renderer talks to it over `/api/v1/pdf/*`. Electron only wraps the web app;
`electron/ipcPolicy.cjs` allowlists unrelated IPC (system, updater, file pickers).

Consequence: the "privileged process + typed allowlist" requirement is satisfied
by *the Nitro server acting as the privileged process*. The renderer never
touches `fs`, and every path is resolved server-side.

```text
Renderer (Vue pages / components)
      │  fetch /api/v1/pdf/*
      ▼
Nitro server  ← privileged filesystem owner
      ├── server/utils/pdfApi.ts        runPdf(): error → status mapping
      ├── server/modules/pdf/paths.ts   pdfDirs (root from config.pdf.dir)
      ├── server/modules/pdf/security.ts safeFileName / safeRelativePath
      ├── server/modules/pdf/inspect.ts AREA_DIRS + resolveAreaFile
      ├── server/modules/pdf/directory.ts list/create/rename/delete area items
      ├── server/modules/pdf/library.ts readLibrary(), upload
      ├── server/modules/pdf/{raster,merge,images-to-pdf,convert,source-export}.ts
      └── server/modules/pdf/extract/* + office/*
      │
      ▼
D:\Applications\tm-tools\.data\pdf   (config.pdf.dir, override PDF_DATA_DIR)
```

## 2. Cấu trúc thư mục hiện có

```
.data/pdf/
├── sources/      user PDFs (writable: upload, subfolders, rename, delete)
├── inputs/       non-PDF uploads (images, docx, xlsx, csv, json, xml)
├── word/         legacy .docx uploads, still read as inputs
├── split/        page folders (one PDF per page)
├── images/       page-image folders (PNG per page)
├── merged/       PDFs rebuilt from pages or converted inputs
├── products/     extraction output (csv/json/xlsx/docx/xml)
├── office/       generated docx/xlsx
├── checkpoints/  extraction checkpoints
└── .trash/       soft-deleted files and folders
```

`AREA_DIRS` in [inspect.ts](../../server/modules/pdf/inspect.ts) maps the eight
areas exposed to the UI; `checkpoints` and `.trash` are internal and are never
served by the directory API. `PDF_FILE_AREAS` (server) and `PdfFileArea`
(shared) are the single source of truth for the area list.

## 3. Component inventory — `app/components/pdf`

| Component | Responsibility | Used by | Reuse decision |
|---|---|---|---|
| `WorkspaceShell.vue` | 2-side grid: tree left, workspace right; forwards tree events | library, split, images, export, import, extract | Reuse |
| `FolderTree.vue` | Area folder tree, expansion, per-node actions; passes `hide-checkbox` | via WorkspaceShell | Reuse |
| `FolderRow.vue` | Row in a directory listing for a folder | FileBrowser | Reuse – readonly gating already exists |
| `FileBrowser.vue` | Right-side browser: header, breadcrumb, upload, list, footer slot | all 6 explorer pages | Reuse |
| `FileRow.vue` | One file row, icon/meta/actions, context menu | FileBrowser | Reuse |
| `FileActions.vue` | Row dropdown with shared file actions | FileRow | Reuse |
| `ConfirmAction.vue` | Modal that hosts one write action plus the overwrite toggle | library, split, images, import | Added in v3 Phase 6 |
| `DocumentDataFlowNote.vue` | Input → operation → output note, destination from `GET /workspace` | split, images, import, export, extract | Added in v3 Phase 4 |
| `OperationResult.vue` | Post-run summary with "open output folder" | same five tool pages | Added in v3 Phase 4 |
| `ContextMenu.vue` | Right-click wrapper for arbitrary content | everywhere | Reuse |
| `ExportFormatPicker.vue` | Format toggle group | export | Reuse |
| `FolderModal` / `RenameModal` / `TrashModal` | CRUD dialogs | `usePdfExplorer` consumers | Reuse |
| `PreviewFile` / `PreviewTable` / `PreviewText` | Inline renderers per MIME | preview page | Reuse – already the universal viewer |
| `PresetSampleEditor` | Extraction preset editor | extract | Reuse |

`OutputFolderRow.vue` was removed in v3 Phase 5: split and images now expose
their primary action as a folder action inside `FileBrowser`, so a second row
component had no reader.

No duplicate of these should be created; the workspace upgrade extends them.

## 4. Composables

| Composable | Responsibility |
|---|---|
| `usePdfStudio.ts` | All `/api/v1/pdf/*` calls, `busy` action key, notifications |
| `usePdfExplorer.ts` | Active area/folder, listing, lazy tree, folder CRUD modal state, per-area caption, `outputMapping` |
| `usePdfSelection.ts` | Active Input for one operation, kept apart from the folder being browsed |
| `usePdfMenus.ts` | Shared file/folder/workspace menus, `PDF_WORKSPACES` list |

Every explorer page composes `usePdfStudio` + `usePdfExplorer` (plus
`usePdfSelection` on the five tool pages). The older `usePdfDirectory.ts` was
deleted in v3 Phase 25 after `usePdfExplorer` replaced it; nothing referenced
it. Client-side view preferences stay in `localStorage`; there is no permission
model on the client — the server decides and the UI reads `GET /workspace`.

## 5. Preview window (Universal Viewer)

`app/pages/pdf/preview.vue` (`layout: false`) is opened by
`openPdfPreview(area, name, path)` from `app/utils/pdfStudio.ts`. It renders
`PreviewFile.vue`, which picks a renderer by extension:

| Extension | Renderer |
|---|---|
| pdf | native `<iframe>`/embed of `/api/v1/pdf/file` |
| png/jpg/jpeg | `<img>` |
| csv / xlsx | `PreviewTable` (horizontal scroll) |
| docx | server `inspect` → mammoth HTML |
| json | editor view |
| xml/txt | text view |
| other | "convert first" / unsupported notice |

This is already the spec's Universal Document Viewer for the formats the engine
supports. It must be kept, not replaced.

## 6. Security controls already present

- `safeFileName` / `safeRelativePath` reject `..`, strip separators and control
  chars, cap length ([security.ts](../../server/modules/pdf/security.ts)).
- `resolveAreaFile` only serves files inside a whitelisted `AREA_DIRS` entry;
  the generic file endpoint can never stream `.trash` or `checkpoints`.
- `runPdf` maps thrown `PDF_*` codes to HTTP statuses
  ([server/utils/pdfApi.ts](../../server/utils/pdfApi.ts)).
- Upload validation: empty, size cap, extension, page cap.

## 7. Gaps versus the spec — status at v2 capture

| Spec requirement | State |
|---|---|
| Area registry with stable keys, kind, permissions | **Delivered** — `server/modules/pdf/workspace.ts` `DESCRIPTORS` |
| Area-root immutability enforced server-side | **Delivered** — `assertFolderWritable` + empty-`relativePath` rejection |
| Access to non-source areas for folder rename/delete | **Delivered** — every area `writableFolders: true` except legacy `word` |
| Explorer resize / collapse / persisted width | **Delivered** — `WorkspaceShell` (220–420 px, `localStorage`) |
| Folder search | **Delivered** — debounced filter in `FolderTree` |
| All / Contextual mode | **Dropped by v2** — one full tree on every page, no mode switch |
| File toolbar: search, sort, view density | **Delivered** — `FileBrowser` toolbar |
| Multi-select + bulk actions | **Deferred** (documented) |
| Output mapping centralised | **Delivered** — `outputMapping` / `outputDir` / `areaDir` |
| Integrity check / repair | **Delivered** — `GET /workspace`, `POST /workspace/repair` |
| Migration of legacy layout | **Not needed** — on-disk layout already canonical; legacy `word` read-only |
| Universal Viewer parity (zoom/rotate/thumbnail/search) | **Partial** — image viewer has zoom (50–300 %), rotate and reset; PDF stays on the native browser frame; table viewer already has filter/wrap; page thumbnails and in-PDF search remain open |
| Audit log for PDF mutations | **Delivered** — JSONL at `<pdfRoot>/audit.jsonl`, read via `GET /api/v1/pdf/audit`; covers upload, tool output, rename, delete, restore, purge, repair and denials |
| Symlink / reparse-point escape guard | **Delivered** — `assertInsideRoot` (`paths.ts`) checks the resolved path; listings skip link entries |
| Atomic output write (temp + rename) | **Delivered** — `writeFileAtomic` in `paths.ts`, used by every writer |
| Lazy tree by node | **Delivered** — `/explorer` returns the first level only; `/explorer/children?area&folder` loads one node on expand, and a folder search swaps in `?depth=full` |

## 8. What must not change

- Page routes (`/pdf`, `/pdf/library`, `/pdf/split`, `/pdf/images`, `/pdf/export`,
  `/pdf/import`, `/pdf/extract`, `/pdf/preview`).
- `AREA_DIRS` keys and on-disk folder names — existing files must keep working.
- `usePdfStudio` action names (they are the `busy` keys used in every page).
- Preview window contract (`area`, `name`, `path` query params).
- Extraction job/checkpoint behaviour.

## 9. Assumptions recorded

1. "Main process / IPC" in the spec maps to the Nitro server in this repo; no new
   Electron IPC channel will be added for PDF files.
2. Identity of a document is `area + relativePath`; display names stay
   user-facing only, so a rename changes the path but not a numeric ID. No
   separate file registry table is introduced in this phase (SQLite/Supabase
   would duplicate the filesystem truth for a desktop-local workspace).
3. Every area root is a fixed *system folder* — it is drawn with a lock and
   offers no rename/delete — while subfolders and files inside it stay fully
   editable in every area. This keeps the roots the server resolves outputs
   against stable without freezing the generated structure.
4. Multi-select bulk operations are out of scope for this pass; the file list
   keeps single selection and per-row actions.

## 10. Findings added by the v3 review (2026-11-05)

Checked against the code while writing
[`TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md`](./TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md).
Each one is a real mismatch, not a preference.

| Finding | Evidence | Consequence |
|---|---|---|
| Tool pages show one area tree, not seven | `split.vue:20`, `images.vue:19`, `export.vue:18`, `extract.vue:24` call `usePdfDirectory('sources')`; only `library.vue:20-23` builds the 7-root tree | v3 §4.2 moves the 7-area explorer into `usePdfExplorer()` |
| Four pages carry parallel file lists | `split.vue:160`, `:200`; `images.vue:156`; `import.vue:157`; `extract.vue:470`, `:532` | v3 §15 Phase 5 removes them after moving their actions to row/folder actions |
| `HeTreeMenu` renders a checkbox that nothing handles in the PDF tree | `HeTreeMenu.vue:334-343` always renders `UCheckbox`; `FolderTree.vue` never listens for `node:select` | A dead control ships today; v3 §3.1 adds `hideCheckbox` |
| `outputMapping.export` names one area, the route writes three | `outputMapping.export = 'office'` (`workspace.ts`); `source-export.ts` writes `png → images`, `docx → office`, `xlsx/csv/json/xml → products` | Data Flow Note must list per-format destinations (v3 §10.1) |
| Export result chunk carries no area | `PdfExportFormatResult = { format, ok, name?, error? }` | The client maps format → area from the table in v3 §1.9, never from `name` |
| Three thrown codes have no HTTP status | `PDF_FOLDER_NAME_REQUIRED` (`directory/folder.post.ts:11`), `PDF_TRASH_ITEM_NOT_FOUND` (`trash/*.ts`), `PDF_EXPORT_FAILED` (`source-export.ts:91`) are absent from `PDF_ERROR_STATUS` | They surface as 500; v3 §10.5 adds them |
| `extract.vue` format checkboxes never reach the server | `outputFormats` is persisted to `localStorage` and never passed to `startExtraction`; the job always writes all five files | v3 §10.7 removes the control instead of faking it |
| Deleting a source cascades silently | `removeSource()` deletes `split/<stem>`, `images/<stem>`, `checkpoints/<stem>`, `merged/<stem>_merged.pdf` and `products/<stem>_products.*` | The confirm text must say so (v3 §10.4) |
| Extraction jobs live in a process-local `Map` | `extract/jobs.ts:42` (`const jobs = new Map()`) | Restarting Nitro loses them. UI must not call it history. Blocking issue for v4 (§12) |
| `PDF_DATA_DIR` is never set by Electron | `electron/main.cjs:78` sets only `TOOLS_DATA_DIR` | Installed builds write PDF data under the app directory via `process.cwd()` |
| Word→PDF needs an OS font | `office/font.ts` probes `C:/Windows/Fonts` and `/usr/share/fonts` | A runtime without those files throws `PDF_FONT_MISSING`; matters for v4 |
| Rasterize needs a native canvas | `pdf-to-img@7` → `pdfjs-dist`, which lists `@napi-rs/canvas` as an *optional* dependency | A serverless install that skips optional deps breaks rasterize and PNG export |
| Chat store is native SQLite on a `cwd` path | `server/modules/chat/store.ts` uses `better-sqlite3` under `process.env.TOOLS_DATA_DIR ?? join(process.cwd(), '.data')` | No cloud database exists yet; v4 job metadata needs one |
| No `vercel.json` / Vercel preset | repo has neither | v4 adds build config; v3 must not touch it |

All of the v3 items above were fixed in Phases 0–6 on 2026-11-06; the evidence
per item is in [VERIFICATION.md](./VERIFICATION.md). Code references in the
table describe the pre-v3 state and are kept as the audit record.
