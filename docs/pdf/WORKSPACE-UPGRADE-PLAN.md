# PDF Studio — Document Workspace upgrade plan

Companion to `TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md` (v2, filesystem and
permission contract), `TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` (v3, product/UX
rebuild) and [WORKSPACE-AUDIT.md](./WORKSPACE-AUDIT.md). The audit records the
repo as it ships; v2 now states the same architecture (Nitro owns the
filesystem, no PDF IPC channel). This file records what is delivered and what
stays open, phase by phase.

## Two tracks

| Track | Spec | Scope | Status |
|---|---|---|---|
| **v3 — UX rebuild** | `TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` §15 | Home, one shared Explorer on every tool page, one FileBrowser, Active Input, Data Flow Note, remove duplicate panels | Phases 0–6 **done** 2026-11-06; see [VERIFICATION.md](./VERIFICATION.md) |
| **v4 — multi-runtime** | v3 §12 | Storage/temp/job adapters so the same engines run on local, Electron and Vercel | Design only; gated on v3 |

v3 must finish and pass its gates before any v4 work starts. §12 of the v3 spec
lists the four blockers found while reviewing the multi-runtime proposal:
wrong proposed layout, unbundled Vietnamese font, optional native canvas, and
`process.cwd()` / `better-sqlite3` on serverless.

## Phase status

Delivered against v2 (see `TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md`):

| Phase | Spec scope | Status |
|---|---|---|
| 0 | Audit & baseline | **Done** — [WORKSPACE-AUDIT.md](./WORKSPACE-AUDIT.md), baseline gates green |
| 1 | Workspace registry + safe filesystem | **Done (registry, no migration needed)** |
| 2 | Universal Explorer | **Done** — shared tree, folder filter, collapse/expand, persisted width; v3 Phase 2 put all seven areas on every tool page |
| 3 | Universal File Explorer | **Done** — toolbar (search/sort/density) delivered; multi-select deferred |
| 4 | Output mapping | **Done (centralised registry + overview panel)** |
| 5 | Universal Viewer | **Partial** — image zoom/rotate/reset delivered; PDF page thumbnails and in-PDF search open |
| 6 | Integrity / regression | **Done** — read-only report + guarded manual repair (recreates missing roots only) |
| 7 | Audit log | **Done** — JSONL for uploads, tool outputs, renames, deletes, restores, purges, repairs and denials |
| 8 | Lazy explorer tree | **Done** — depth-1 load, per-node children endpoint, deep query only for search |
| 9 | Viewer parity | **Partial** — image zoom/rotate/reset done; page thumbnails and PDF search open |

The v3 rebuild closed the "partial" row of phase 2: every tool page now gets
the same seven-area explorer and one FileBrowser. It did not re-open the
delivered phases; it composes them differently.

## Phase 1 — workspace registry

New: `server/modules/pdf/workspace.ts`

```ts
export type PdfAreaKind = 'source' | 'processing' | 'extraction' | 'system'

export interface PdfAreaDescriptor {
  area: PdfFileArea
  key: string                 // stable logical key, e.g. sources.pdf
  kind: PdfAreaKind
  writableFiles: boolean      // upload / rename / delete files
  writableFolders: boolean    // create / rename / delete subfolders
  systemRoot: boolean         // area root is fixed, never renamed or deleted
  accept: 'pdf' | 'input' | 'all'
}
```

- The descriptor list is the only place that decides permissions; routes read
  it instead of trusting the client, and `/pdf/library` reads the same report
  (`GET /api/v1/pdf/workspace`) instead of hard-coding "sources only".
- Every area root is a **system folder** (`systemRoot: true`): it is drawn with
  a lock and offers no rename/delete. Subfolders inside it stay fully editable
  (`writableFolders: true`) in every area, so generated folders can be
  reorganised without touching the roots the server resolves outputs against.
- `assertFolderWritable(area)` therefore only rejects the legacy `word` area,
  which keeps `writableFolders: false`. `renameAreaItem` / `deleteAreaItem`
  already refuse an empty relative path, so the root itself cannot be addressed.
- Legacy `word` area stays readable, never writable.
- `outputMapping` lives here, and `outputDir(tool)` / `areaDir(area)` return the
  on-disk folder. Every route and module that writes or lists an area now asks
  the registry instead of joining `pdfDirs.*` itself: split, rasterize, merge,
  images→PDF, convert, export and the DOCX export route. The listing endpoint
  also takes its accept predicate from `areaAcceptPredicate`.

## Phase 2 — Universal Explorer

- `FolderTree.vue`: debounced folder filter over the loaded tree
  (`searchable`, on by default), a collapse button in the header, and a
  "no folder matches" state.
- `WorkspaceShell.vue`: draggable splitter (220–420 px), collapse/expand with a
  36 px rail, width persisted in `localStorage` under `pdf.explorer.width` /
  `pdf.explorer.collapsed`. Collapsing is desktop-only so a phone user can never
  hide the explorer without a way back.
- Scope is structural rather than a `mode` prop: the library page builds one tree
  over the seven areas, while tool pages pass their own area tree and highlight
  their own selection.
- Area roots render as locked system folders: a single `folder-lock` icon
  (tooltip explains the rule) tinted sky-blue, turning primary when selected —
  no rename/delete in the dropdown. Subfolders keep the plain folder icon
  (amber, primary when selected) and full rename/delete plus "New subfolder".
- Chevron still only expands. The whole node card now selects (the label is no
  longer the only hit target); `@click.stop` on the drag handle, checkbox,
  chevron and "…" keeps those controls independent. Both states stay separate
  (`expandedIds` vs `selectedKey`).

## Phase 3 — file toolbar

- `FileBrowser.vue` gains a toolbar strip: search, sort (name / modified / size),
  view density (comfortable / compact).
- Search filters the current folder listing client-side (the listing is already
  bounded per folder); no new server query is introduced. Density is a per-row
  padding switch shared by `FileRow` and `FolderRow`.
- Multi-select / bulk actions are **not** delivered: the pages act per file and
  a half-working checkbox column would be worse than none. Recorded below.

## Phase 4 — output mapping

The registry exposes `outputMapping` for split, merge, rasterize, images→PDF,
convert, export and extract. Tools already write to those folders; the mapping
makes the destination readable from the server and from the UI — the `/pdf`
overview lists each tool's output folder, read from `GET /api/v1/pdf/workspace`.

## Phase 6 — integrity

New `GET /api/v1/pdf/workspace` returns, read-only:

- Every descriptor with `writableFolders` / `writableFiles`.
- For each area: `exists`, file count, folder count.
- `outputMapping` for every tool.
- `needsRepair: boolean` when a managed area root is missing.

`POST /api/v1/pdf/workspace/repair` is the only write in this phase, and it is
deliberately narrow: it recreates missing area roots from the registry
(`mkdirSync recursive`) and reports which areas it created. It never deletes,
moves or rewrites a file, so it cannot destroy work. The `/pdf` overview shows
the repair button only while `needsRepair` is true, with a tooltip stating the
scope.

## Phase 7 — audit log

`server/modules/pdf/audit.ts` appends one JSON line per mutation to
`<pdfRoot>/audit.jsonl` and keeps the file at 500 lines by rewriting the tail
atomically. `recordAudit` swallows write failures, so a locked or full log can
never fail a user action. `GET /api/v1/pdf/audit?limit=` reads the newest events.

Recorded actions: `upload` (sources/inputs, with `bytes`), `output` (split,
merge, rasterize, images→PDF, convert, PDF→DOCX, export, extract, with `tool`),
`folder-create`, `rename` (with `to`), `delete` (with `bytes`), `restore`,
`purge`, `repair` and `denied` (with `code` + `area`). No payload, no bytes of
content, no credentials — metadata only.

## Phase 8 — lazy explorer tree

`GET /api/v1/pdf/explorer` now returns only the first level of the seven areas.
Every folder that still has subfolders carries `hasChildren: true`; opening it
calls `GET /api/v1/pdf/explorer/children?area=&folder=`, which resolves the path
through `safeRelativePath` + `assertInsideRoot` before listing one level.

The library and all five tool pages pass `lazy` to `WorkspaceShell` →
`FolderTree`; each page keeps its own `loadedChildren` map keyed by
`area:relativePath`. Typing a folder search swaps in `GET /explorer?depth=full`
once, because filtering must see nested names; clearing the term returns to the
shallow tree and drops the memo.

`GET /api/v1/pdf/directory` keeps returning a depth-1 `tree`, so a page that
needs the full nested shape must ask `/explorer?depth=full`.

## Phase 9 — viewer parity

The image viewer gained zoom (50–300 %, seven steps), 90° rotation and a reset
that is disabled at the default view; both reset when the file changes. The PDF
viewer stays on the browser's native frame, which already offers its own zoom and
page search, and the table viewer keeps filter/wrap/horizontal scroll. Page
thumbnails and cross-page PDF search remain open.

## Deliberate deviations

| Spec item | Decision |
|---|---|
| Electron IPC allowlist for PDF fs | Nitro server is the privileged process; no new IPC |
| SQLite/registry table for files | Filesystem stays the source of truth; identity is `area + relativePath` |
| Multi-select + bulk actions | Deferred; single-selection actions cover current flows |
| File watcher | Not added; refresh stays explicit to avoid watching a large tree |
| Migration of folder names | Not needed — on-disk layout is already the target layout |
| `01-sources/…` numbered layout | Not adopted; renaming would break existing files and job references |
| Full workspace tree on every tool page | Delivered in v3 Phase 2 — the same `PDF_EXPLORER_AREAS` tree on all six pages |
| Multi-select folder checkbox | Removed from the Explorer contract in v3 Phase 3; `FolderTree` passes `hide-checkbox` |

## Open items

Closed by v3 (details and gate evidence in [VERIFICATION.md](./VERIFICATION.md)):

- ~~Data Flow Note (`Đầu vào → Đầu ra`) and "open output folder" affordance~~ — Phase 4.
- ~~Seven-area explorer on tool pages~~ — Phase 2.
- ~~Duplicate file-list panels on split/images/import/export/extract~~ — Phase 5; the extract Jobs panel stays, which the spec allows (`§14.2`).
- ~~Three error codes missing from `pdfHttpStatus`~~ — Phase 6.
- ~~`outputFormats` checkbox in `extract.vue`~~ — Phase 6.
- ~~`overwrite` checkbox in `library.vue`~~ — Phase 6.
- ~~Source-delete cascade not stated in the confirm~~ — Phase 6.

Still open:

- Viewer parity: zoom, rotate, thumbnail, fullscreen, page search, sheet navigation, Previous/Next. Optional Phase 7, only on a specific request.
- Orphan `*.tmp` files after a crash; Windows file-lock behaviour — hardening, not scheduled.
- No signed-in browser pass over the PDF pages; `/api/v1/pdf/*` answers 401 without a session, so the UX acceptance list is verified statically and by compile.

## Multi-runtime (v4)

Not started. Design, blockers and the required order of work are in
`TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` §12. Summary of the four blockers found
against this repo:

1. The proposed `input/` + `output/` layout does not exist here; the eight areas
   are the stable contract, so v4 must map areas onto storage namespaces.
2. `office/font.ts` reads OS fonts (`C:/Windows/Fonts`, `/usr/share/fonts`); a
   Vercel runtime may have none, so Word→PDF would throw `PDF_FONT_MISSING`.
3. `pdf-to-img` → `pdfjs-dist` needs `@napi-rs/canvas`, declared only as an
   optional dependency; rasterize and PNG export can fail on a serverless build.
4. `config.pdf.dir` defaults to `process.cwd()`, and the chat store uses
   `better-sqlite3` on a `process.cwd()` path — neither works on a read-only
   `/var/task`; there is no cloud database in the repo yet.

## Verification

### v3 UX rebuild — 2026-11-06

Phases 0–6 plus three self-audit passes, gate evidence per phase in
[VERIFICATION.md](./VERIFICATION.md). Final state of the tree:

- `npx nuxt typecheck` → `TC_EXIT=0`, 0 × `error TS`.
- `npx eslint` over the touched PDF surface, re-run after the last
  `.nuxt/eslint.config.mjs` regeneration → `LINT_EXIT=0`.
- `pnpm test` → `27/27 specs passed`.
- All 7 PDF pages compile through Vite → HTTP 200.
- No signed-in browser pass: `/api/v1/pdf/*` answers 401 without a session, so
  the UX acceptance list (§14.2) is verified statically and by compile only.

### Docs-only change — 2026-11-05 (v3 spec rewrite)

No source file changed in this pass; only `docs/pdf/*` and `docs/README.md`.

- `pnpm test` → `22/22 specs passed` (run after the doc rewrite).
- Markdown link check across `docs/`, `docs/pdf/`, `docs/archive/2026-11-05-rebuild-spec-v3-draft/`:
  all new links resolve. Two pre-existing broken links in `docs/README.md`
  (`./guides/user-guide.md`, `./guides/system-setup-and-configuration-guide.md`)
  point to a `guides/` directory that does not exist in this repo; untouched.
- Typecheck/lint not needed: no `.ts`/`.vue` file was edited.

### Delivered features — recorded on 2026-11-04, after the last `.nuxt/eslint.config.mjs` regeneration

- `npx nuxt typecheck` → `TC_EXIT=0`, `grep -c "error TS"` = 0.
- `npx eslint` over every touched file → `LINT_EXIT=0` (run after the regenerate
  that rewrote the config to 24050 bytes).
- `pnpm test` → `16/16 specs passed` (re-run 2026-11-05).
- Unit spec `pdf_workspace.spec.ts` covers the registry: every area described
  once, `sources`/`inputs` own subfolders, every generated area allows subfolder
  writes while its root stays fixed (`systemRoot: true`), legacy `word` is fully
  read-only, unknown area rejected, accept predicates, complete output mapping,
  and the read-only report.
- Unit spec `pdf_workspace_repair.spec.ts` runs against a temp `PDF_DATA_DIR`:
  repair recreates every missing root, is a no-op on a healthy tree, and leaves
  an existing file untouched while recreating a removed folder.
- Unit spec `pdf_area_guard.spec.ts` runs against a temp `PDF_DATA_DIR` and proves
  the folder rules on disk: `sources` can create/rename/delete folders; a
  generated area (`split`) can create/rename/delete a subfolder while
  `renameAreaItem`/`deleteAreaItem` on the empty relative path throw
  `PDF_INVALID_PATH`; `word` refuses `createAreaFolder` with
  `PDF_FOLDER_IMMUTABLE`; a file inside a generated area is still deletable and
  the folder still lists.
- Browser pass on the signed-in `localhost:4002` tab: folder filter narrows the
  tree to the matching nodes; file filter hides non-matching rows; sort by size
  ordered 246 → 217 → 203 → 18 KB; density switched 5 rows from `py-3` to
  `py-1.5`; collapse gave a 36 px rail with the splitter removed and the expand
  button visible; the collapsed state survived a reload and expanding restored
  the 300 px aside; both "no match" messages rendered; `/pdf` showed the seven
  output-mapping rows with no repair button on a healthy tree.
- Changed SFCs compile through the dev server (`/_nuxt/…` → 200 for
  `FolderTree`, `FileBrowser`, `FileRow`, `FolderRow`, `WorkspaceShell`,
  `pages/pdf/index`). `GET /api/v1/pdf/workspace` answers 401 from the auth
  middleware, i.e. the route is registered (no 404).
- Folder immutability is enforced by `assertFolderWritable` in
  `createAreaFolder`, `renameAreaItem` and `deleteAreaItem`; the registry spec
  asserts the thrown code. A signed-in HTTP call to prove the 409 was not made
  (auth session is user-owned).
- Not proven: splitter drag and page evaluation. The preview tool reported the
  page-evaluation API as unavailable, so the drag path is covered by reading the
  pointer handlers, not by a measured width change; click collapse was measured.
