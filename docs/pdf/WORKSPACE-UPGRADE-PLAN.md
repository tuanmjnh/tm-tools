# PDF Studio — Document Workspace upgrade plan

Companion to `TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md` and
[WORKSPACE-AUDIT.md](./WORKSPACE-AUDIT.md). The audit records the repo as it
ships; the spec's v2 now states the same architecture (Nitro owns the
filesystem, no PDF IPC channel). This file records what is delivered and what
stays open, phase by phase.

## Phase status

| Phase | Spec scope | Status |
|---|---|---|
| 0 | Audit & baseline | **Done** — [WORKSPACE-AUDIT.md](./WORKSPACE-AUDIT.md), baseline gates green |
| 1 | Workspace registry + safe filesystem | **Done (registry, no migration needed)** |
| 2 | Universal Explorer | **Done** — shared tree, folder filter, collapse/expand, persisted width |
| 3 | Universal File Explorer | **Done** — toolbar (search/sort/density) delivered; multi-select deferred |
| 4 | Output mapping | **Done (centralised registry + overview panel)** |
| 5 | Universal Viewer | **Partial** — current preview renderers kept; zoom/rotate/search/sheet-nav open |
| 6 | Integrity / regression | **Done** — read-only report + guarded manual repair (recreates missing roots only); audit log open |

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

## Deliberate deviations

| Spec item | Decision |
|---|---|
| Electron IPC allowlist for PDF fs | Nitro server is the privileged process; no new IPC |
| SQLite/registry table for files | Filesystem stays the source of truth; identity is `area + relativePath` |
| Multi-select + bulk actions | Deferred; single-selection actions cover current flows |
| File watcher | Not added; refresh stays explicit to avoid watching a large tree |
| Migration of folder names | Not needed — on-disk layout is already the target layout |
| `01-sources/…` numbered layout | Not adopted; renaming would break existing files and job references |
| Full workspace tree on every tool page | Not delivered; library has the 7-area root, tool pages show their own area tree |
| Multi-select folder checkbox | Rendered but unwired in `FolderTree`; decide to wire or hide |

## Open items

- Viewer parity: zoom, rotate, thumbnail, fullscreen, page search, sheet navigation, Previous/Next.
- Audit log for PDF mutations (import, output, rename/delete, folder CRUD, repair, denied).
- Symlink / reparse-point guard on resolved paths.
- Atomic output write (temp file in the same area, then rename).
- Node-level lazy loading for the folder tree; `GET /explorer` currently returns all areas at once.
- Data Flow Note (`Đầu vào → Đầu ra`) and "open output folder" affordance.
- Flow note + output navigation depend on the above; not started.

## Verification

Recorded on 2026-11-04, after the last `.nuxt/eslint.config.mjs` regeneration:

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
