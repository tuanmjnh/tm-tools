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
| `WorkspaceShell.vue` | 2-side grid: tree left, workspace right; forwards tree events | library, split, images, export, import | **Extend** – add resize/collapse + mode switch |
| `FolderTree.vue` | Area folder tree, expansion, per-node actions | via WorkspaceShell | **Extend** – search, contextual highlight, collapse |
| `FolderRow.vue` | Row in a directory listing for a folder | FileBrowser | Reuse – readonly gating already exists |
| `FileBrowser.vue` | Right-side browser: header, breadcrumb, upload, list, footer slot | all 5 workspaces | **Extend** – toolbar (search/sort/view) |
| `FileRow.vue` | One file row, icon/meta/actions, context menu | FileBrowser, pages | Reuse |
| `FileActions.vue` | Row dropdown with shared file actions | FileRow | Reuse |
| `OutputFolderRow.vue` | Output-folder row with a primary action | split, images, import, export | Reuse |
| `ContextMenu.vue` | Right-click wrapper for arbitrary content | everywhere | Reuse |
| `ExportFormatPicker.vue` | Format toggle group | export | Reuse |
| `FolderModal` / `RenameModal` / `TrashModal` | CRUD dialogs | usePdfDirectory consumers | Reuse |
| `PreviewFile` / `PreviewTable` / `PreviewText` | Inline renderers per MIME | preview page | Reuse – already the universal viewer |
| `PresetSampleEditor` | Extraction preset editor | extract | Reuse |

No duplicate of these should be created; the workspace upgrade extends them.

## 4. Composables

| Composable | Responsibility |
|---|---|
| `usePdfStudio.ts` | All `/api/v1/pdf/*` calls, `busy` action key, notifications |
| `usePdfDirectory.ts` | Current area/folder, listing, folder CRUD modal state |
| `usePdfMenus.ts` | Shared file/folder/workspace menus, `PDF_WORKSPACES` list |
| `usePdfStudio` + `usePdfDirectory` used together on every page |

`usePdfDirectory` currently takes a *static* area (or a ref) and reloads the
listing itself. There is no shared explorer state, no persisted view
preferences and no permission model on the client.

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
| Universal Viewer parity (zoom/rotate/thumbnail/search) | **Open** — preview keeps its current renderers only |
| Audit log for PDF mutations | **Open** — not implemented |
| Symlink / reparse-point escape guard | **Open** — no `realpath`/`lstat` in `server/` |
| Atomic output write (temp + rename) | **Open** — overwrite flag only |
| Lazy tree by node | **Open** — `/explorer` returns every area tree in one call |

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
