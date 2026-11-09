# TM Tools — Document Studio Legacy Migration & Implementation Plan v5

> Execution plan for the v5 standardization. It is intentionally additive and reversible.  
> The goal is to move existing PDF workspace behavior into the unified Document Studio without losing files, extraction presets, checkpoints, jobs, or old API consumers.

**Baseline:** `tm-tools/main` commit `52929df3bcef52da2f3c5af2e9c2eb0cca74a28f` (2026-11-08).  
**Architecture:** read `DOCUMENT-STUDIO-STANDARDIZATION-SPEC-v5.md` first.  
**Contracts:** read `DOCUMENT-STUDIO-FORMAT-AND-EXTRACTION-CONTRACT-v5.md` before editing operation/format/extraction code.

---

# 0. Execution rules

1. Work on a dedicated branch, not directly on `main`.
2. Before modifying, rerun baseline checks and record output: `pnpm typecheck`, `pnpm test:unit`, `pnpm lint`, `pnpm build`, `pnpm check:hygiene`.
3. Read current source; the file list below is an expected touch map, not permission to overwrite without inspection.
4. Every phase must leave `main`-equivalent app buildable and tests green.
5. Do not combine file migration, page relocation, AI job refactor and storage contract changes in one unreviewable commit.
6. No deleting legacy folders/routes until migration verification and consumer audit pass.
7. Never claim cloud live test success unless a real Hub Storage Connection / DB / deployment is available and the end-to-end test completed.

---

# 1. Current state verified on main

## 1.1. Pages and split ownership

- New Document Studio pages exist in `app/pages/document-studio/`: `index.vue`, `activity.vue`, `settings.vue`, plus six pages under `tools/`.
- Legacy pages `app/pages/pdf/extract.vue` and `app/pages/pdf/library.vue` still exist and use `usePdfStudio()` / `usePdfExplorer()`.
- `tests/unit/document_studio_ui.spec.ts` currently asserts that the AI extraction route remains `/pdf/extract`; this test must change after migration.
- Current Operation Registry has seven IDs, but `document.ai-extract` has no v4 executor and is filtered out; the legacy `/pdf/extract` remains the actual extraction UI/API.

## 1.2. Current Input/Output state

`server/modules/document/paths.ts` defines `input/`, `output/`, `.system/jobs/`, and per-job `input/`, `working/`, `output/`. The legacy `.data/pdf` layout still has `sources/`, `inputs/`, `word/`, `split/`, `images/`, `merged/`, `products/`, `office/`, `checkpoints/`, `.trash/`, `audit.jsonl`, and `presets.json`.

Recent `tm-tools` commits still fixed legacy `word/` + `inputs/` behavior. Do not assume all data has already migrated just because v4 directories exist.

## 1.3. Activity behavior gap

`app/pages/document-studio/activity.vue` has preview, download, reveal-folder and copy-path actions. However:

- `canPreview()` currently returns true for all downloadable desktop artifacts, even though the API only sends a finite MIME allowlist inline.
- `previewArtifact()` opens the authenticated `downloadPath?inline=1` route.
- `artifact.localPath` is used to reveal/copy but not to open the file itself.
- `server/api/v1/documents/jobs/[jobId]/artifacts/[artifactId]/download.get.ts` only treats PDF, PNG, JPEG, WebP, GIF and text/plain as inline.

Fix local/Electron Open by calling `openLocalPath(artifact.localPath)` and keep browser Preview as a separate action. Do not weaken MIME security by inlining arbitrary formats.

## 1.4. Hub/SDK integration state

- `tm-hub` main latest reviewed: `e1b0fba313a09f1e13bf16229e33516c2d72d019`.
- `tm-hub-client` main latest reviewed: `9eeb0d646893668d30402a0f2a2bdddb6fc87cf3`; package version `1.1.0`.
- `tm-tools/package.json` already references `tm-hub-client: 1.1.0`.
- The SDK exposes `storage.connections/initUpload/completeUpload/abortUpload/createDownloadGrant/getObject/listObjects/listFolders/deleteObject/copyObject/createFolder/deleteFolder`.
- The Hub Storage Gateway has server-to-server App ID/App Secret auth and object-scoped grants.
- Existing `HubStorageProvider` + `server/utils/hubStorage.ts` should be reused.
- `docs/document-studio/TEST-VERIFICATION.md` records a prior live query to Hub `storage/connections` returning 200 with zero connections; do not infer an end-to-end upload round trip has happened from gateway code alone. After the user's current Hub updates, re-run the live check if a connection is available.

---

# 2. Target page migration

## Phase P0 — audit and freeze baseline

Deliver:

- A new `docs/document-studio/V5-IMPLEMENTATION-STATUS.md` with commit SHA, test output, route inventory and data root inventory.
- A checked route map from current Hub seed/menu route IDs to new document-studio routes.
- A list of every direct import/caller of `usePdfStudio`, `usePdfExplorer`, `PdfFileArea`, `/api/v1/pdf/**`.

Do not start data migration in P0.

## Phase P1 — route and component foundation

Target pages:

```text
app/pages/document-studio/
  index.vue
  library.vue
  activity.vue
  settings.vue
  tools/[slug].vue
```

Tasks:

1. Introduce `/document-studio/library` with two tabs only: Input and Output.
2. Move/port the current `pdf/library.vue` library functionality into the new shared Library contract. Keep file actions, search, preview, delete/restore only where supported by new APIs.
3. Implement one dynamic operation page `tools/[slug].vue`; resolve slug from Operation Registry.
4. Move operation-specific configuration UI to components in `components/document-studio/operations/configs/`.
5. Keep current static tool routes working as aliases/redirects or thin wrappers during transition; do not duplicate the page logic.
6. Update TM Hub route seed/menu to expose new Library and extraction routes while not leaving duplicate old menu entries.
7. Update both locale files.

Do not delete `app/pages/pdf/**` during P1.

Acceptance:

- `/document-studio/library` works with two roots and does not use `PdfFileArea` in new types.
- `/document-studio/tools/split` etc resolve the dynamic page and still run current executors.
- Existing deep links continue to function through redirects/compat route aliases.
- No regression to document Activity, Settings or existing tool operations.

## Phase P2 — unified format and operation registries

Tasks:

1. Add a Format Registry separate from Operation Registry.
2. Add Conversion Matrix entries only for proven conversion pairs.
3. Expose catalogue endpoint data with formats, operations, conversion edges, availability, runtime support and reason-disabled.
4. Validate registry coherence on unit tests.
5. Update Home and Convert page to use server capabilities; never construct conversion pairs on client by extension matching.
6. Keep current static `app/utils/documentStudio.ts` as UI metadata during transition or convert it into a typed client catalogue; do not maintain two authoritative server registries.

Acceptance:

- Adding a new conversion edge needs no new page route.
- Unsupported edges are hidden/disabled with reason.
- All catalog IDs resolve to actual executors and i18n.

## Phase P3 — consolidate AI Extraction into Document Job Pipeline

Tasks:

1. Create `AiExtractionConfig.vue` with the same capabilities as `/pdf/extract`: model selector, provider/connection context, preset select/create/edit/delete, prompt customization, output format selection, force/overwrite.
2. Reuse `AiProvidersModelSelect` if viable; retain `connectionId + modelId` semantics.
3. Reuse `fetchRelayCatalog`/`listExtractModels`, `relayChat`, prompt builder, parsing/normalization, `writeProducts`, fingerprint and checkpoints.
4. Add `AiExtractionExecutor` to the Document Executor Registry.
5. Create the extraction Document Job through common `POST /api/v1/documents/jobs`, upload/materialize input to the job workspace, run through the Document dispatcher and publish outputs through artifact publisher.
6. Persist model/preset/prompt/output config in versioned job config snapshot; never persist keys/tokens.
7. Add progress and error mapping to Document Job state.
8. Ensure retry/idempotency/cancel are consistent with common job semantics.
9. Replace active `/pdf/extract` page with redirect to `/document-studio/tools/extract` after the new page passes parity.
10. Keep old `/api/v1/pdf/extract/**` as thin adapters or legacy callers until consumer search finds no use.

Critical runtime gate:

- local/Electron supported first if existing dependencies pass.
- Vercel must remain unavailable for AI Extraction until durable worker/queue and provider-call lifecycle are implemented and tested.
- Do not run long AI work inside a Vercel request simply because Job API exists.

Acceptance:

- Old user can select same connected provider/model, same prompt preset and export formats.
- Same source + same config reuses valid checkpoints.
- Changing source/prompt/preset/model/connection/schema invalidates relevant cache.
- Output artifacts appear in Document Activity and Output Library.
- No second extraction job store remains authoritative.

## Phase P4 — Activity Open / Preview / Download fix

File target:
- `app/pages/document-studio/activity.vue`
- `app/utils/desktop.ts`
- `server/api/v1/documents/jobs/[jobId]/artifacts/[artifactId]/download.get.ts`
- related UI tests.

Implementation:

1. Separate helper predicates:
   - `canOpenWithOs(artifact)`: desktop runtime + localPath exists.
   - `canPreviewInApp(artifact)`: server viewer capability/MIME allowlist supports it.
   - `canDownload(artifact)`: artifact unexpired/not deleted.
2. Render distinct actions:
   - Open (OS default app) — local/Electron only.
   - Preview — only if viewer supports MIME.
   - Download — all downloadable artifacts.
   - Show in folder — local/Electron only.
3. `Open` calls `openLocalPath(localPath)`, not the HTTP download route.
4. Preview opens `inlinePreviewPath(downloadPath)` only for supported MIME.
5. Keep the authenticated download route owner-scoped and inline whitelist unchanged unless a security review explicitly approves an additional type/viewer.
6. Ensure `localPath` is stripped from cloud JSON responses.

Acceptance:

- PDF generated locally opens in default PDF app.
- DOCX/XLSX generated locally opens in associated Office app (if OS association exists).
- Show in Folder reveals correct file.
- Browser PDF/image preview still works.
- Browser unsupported office format only downloads; no misleading Preview button.
- No local path appears in network payload on cloud runtime.

## Phase P5 — legacy Input/Output data migration

This phase is a standalone, resumable migration tool. Do not use one-off shell moves.

### 5.1. Logical mapping

| Legacy directory | New role | Notes |
|---|---|---|
| `sources/` | `input/` | Source documents uploaded for PDF workflows |
| `inputs/` | `input/` | General non-PDF inputs |
| `word/` | `input/` | Legacy read-only Word uploads; preserve read-only origin metadata |
| `split/` | `output/` | Produced split pages; may later be selected as input |
| `images/` | `output/` | Rasterized images; can be reused as input for images→PDF |
| `merged/` | `output/` | Merge/convert outputs |
| `products/` | `output/` | Extraction products |
| `office/` | `output/` | Office exports |
| `checkpoints/` | `.system/checkpoints/` | Internal AI state; preserve fingerprinted and legacy layouts |
| `presets.json` | `.system/presets/` | Convert to versioned preset storage; preserve stable IDs |
| `.trash/` | `.system/trash/` | Preserve metadata and restore lineage |
| `audit.jsonl` | `.system/audit/` | Preserve append-only history |

Do not create new `sources/`, `inputs/`, `word/`, `split/`, `images/`, `merged/`, `products/`, `office/` directories after cutover. Legacy physical directories may temporarily remain read-only as migration source/compatibility aliases.

### 5.2. Collision handling

Never use a naive `copyFile(old, input/name)` or `rename(old, output/name)`.

Create a manifest record with a stable ID. At minimum preserve:

```ts
interface LegacyMigrationRecord {
  migrationVersion: string
  sourceArea: string
  sourceRelativePath: string
  sourceAbsolutePath: string // internal-only migration record, never returned to client
  destinationRole: 'input' | 'output'
  destinationObjectId: string
  originalName: string
  originalRelativeFolder?: string
  sizeBytes: number
  checksumSha256: string
  legacyReadOnly: boolean
  status: 'planned' | 'copied' | 'verified' | 'skipped' | 'failed'
  errorCode?: string
}
```

If same filename exists in multiple legacy areas, keep both entries. Use stable object ID and preserve source metadata; filename collision may be resolved with suffix only for physical display path. Do not overwrite either file.

### 5.3. Migration algorithm

1. `--dry-run`: scan all legacy roots, count folders/files, calculate sizes and hashes, list collisions, identify broken/missing files and unreadable metadata.
2. Persist migration plan in `.system/migrations/<version>/plan.json`.
3. Copy to canonical input/output; do not delete source.
4. Compute destination checksum and compare source checksum.
5. Mark row `verified` only if byte size + SHA-256 match.
6. Store migration provenance/legacy area/read-only semantics in library manifest.
7. Re-run is idempotent: verified entries are skipped unless explicitly `--reverify`; partial rows resume safely.
8. Generate summary report: counts by area/status, bytes copied, collision count, errors, source/destination checksums.
9. Run library/API integrity checks and user-visible preview tests.
10. Backup source root + migration ledger before cutover.
11. Switch Library/API to new roots; legacy API adapter reads/writes through compatibility mapper as necessary.
12. Only after a separately approved retirement phase, archive/delete old directories. This plan does not authorize deleting them.

### 5.4. Folder and metadata preservation

Preserve relative folder structures where useful under the canonical roots, but never create per-operation root directories. Example:

```text
input/<user-folder>/<filename>
output/<user-folder>/<filename>
```

The original legacy area is metadata, not necessarily a directory name. A user can search/filter `source.legacyArea` in diagnostics, but ordinary Library navigation only shows Input and Output.

### 5.5. Trash/preset/checkpoint migration

- Preserve trash items and metadata; map restore target to the new library role and original relative path.
- Read `presets.json` using existing `listPresets()` semantics; write versioned preset records; preserve each preset ID, name, description, sample, updatedAt.
- Preserve both old flat checkpoint layout and `v<n>-<hash>` fingerprint subfolders. Add a lookup adapter; do not blindly rename checkpoint directories.
- Preserve job history and audit. Do not promote a legacy in-memory job to completed unless persisted record/artifacts prove completion.

### 5.6. Rollback

Rollback must switch the active library resolver back to legacy read paths while retaining verified copies in new roots. Do not delete new copies on rollback. Migration ledger must record the active resolver version. Re-running the migration must not duplicate items.

## Phase P6 — legacy route retirement

Only after P1–P5 gates pass:

1. `/pdf/extract` redirects to `/document-studio/tools/extract`.
2. `/pdf/library` redirects to `/document-studio/library`.
3. Existing tool routes redirect to the matching new dynamic operation route only after parity.
4. Old API endpoints remain as thin compatibility adapters until all callers in repo and external integrations are checked.
5. Remove `usePdfStudio`/`usePdfExplorer` references from active Document Studio pages; do not delete shared engine modules still imported by new executors.
6. Update Hub route seeds/menu and allowed routes to remove retired duplicate routes, preserving role access semantics.
7. Update `docs/document-studio/LEGACY-RETIREMENT.md` with concrete evidence.

Never delete `server/modules/pdf/**` wholesale: current Document executors reuse several PDF engines, exporters, prompts, and helpers.

---

# 3. Recommended implementation order and dependencies

```text
P0 Audit + baseline
  ↓
P1 New route/page foundation + Library shell
  ↓
P2 Format Registry + Conversion Matrix + common operation route
  ↓
P3 AI Extraction → shared Document Job pipeline
  ↓
P4 Activity Open/Preview/Download fix (can be parallel with P1/P2)
  ↓
P5 Dry-run + copy/verify Input/Output migration
  ↓
P6 Cutover and legacy route redirect/retirement
```

Recommended separate PRs:

- PR A: P0 + route foundation (no data migration).
- PR B: Format/Operation/Conversion registry and common tools page.
- PR C: AI Extraction executor/UI/job migration, no physical data cleanup.
- PR D: Activity local/Electron Open and preview correctness.
- PR E: Library migration command + dry-run/report/checksum tests.
- PR F: data cutover after backup and real migration verification.
- PR G: legacy redirect/menu/retirement after all parity gates.

---

# 4. Exact source files to inspect/update

## Frontend

- `app/pages/document-studio/index.vue`
- `app/pages/document-studio/activity.vue`
- `app/pages/document-studio/settings.vue`
- `app/pages/document-studio/tools/*.vue`
- `app/pages/pdf/extract.vue`
- `app/pages/pdf/library.vue`
- `app/utils/documentStudio.ts`
- `app/utils/desktop.ts`
- `app/composables/useDocumentApi.ts`
- `app/composables/useDocumentFiles.ts`
- `app/composables/useDocumentOperationPage.ts`
- `app/composables/useDocumentRun.ts`
- `app/composables/usePdfStudio.ts` (legacy adapter only)
- `app/composables/usePdfExplorer.ts` (legacy adapter only)
- `app/components/document-studio/**`
- `app/components/pdf/PreviewFile.vue`, `PreviewTable.vue`, `PreviewText.vue`, `ExportFormatPicker.vue`, `PresetSampleEditor.vue`, `OperationResult.vue`, `WorkspaceShell.vue`, `FileBrowser.vue`

## Backend / types

- `shared/types/document/index.ts`
- `shared/types/pdf.ts` (legacy contract)
- `server/modules/document/operations.ts`
- `server/modules/document/executors.ts`
- `server/modules/document/contracts.ts`
- `server/modules/document/dispatcher.ts`
- `server/modules/document/runner.ts`
- `server/modules/document/jobs.ts`
- `server/modules/document/postgres-jobs.ts`
- `server/modules/document/output.ts`
- `server/modules/document/paths.ts`
- `server/modules/document/runtime.ts`
- `server/modules/document/runtime-context.ts`
- `server/modules/document/storage.ts`
- `server/modules/document/hub-storage.ts`
- `server/utils/hubStorage.ts`
- `server/modules/pdf/extract/models.ts`
- `server/modules/pdf/extract/provider.ts`
- `server/modules/pdf/extract/prompt.ts`
- `server/modules/pdf/extract/presets.ts`
- `server/modules/pdf/extract/jobs.ts`
- `server/modules/pdf/extract/job-store.ts`
- `server/modules/pdf/extract/checkpoint.ts`
- `server/modules/pdf/extract/export.ts`
- `server/api/v1/documents/**`
- `server/api/v1/pdf/**` (compatibility)
- `server/api/v1/documents/jobs/[jobId]/artifacts/[artifactId]/download.get.ts`

## Config / runtime / docs

- `nuxt.config.ts`
- `server/config/index.ts`
- `electron/main.cjs`
- `electron/preload.cjs` / TypeScript preload entry (whichever current app uses)
- Electron IPC open/reveal handlers
- `package.json`, `pnpm-lock.yaml`
- `docs/README.md`
- `docs/document-studio/PHASE-STATUS.md`
- `docs/document-studio/API-CONTRACTS.md`
- `docs/document-studio/OPERATIONS-CATALOG.md`
- `docs/document-studio/MIGRATION-PLAN.md`
- `docs/document-studio/LEGACY-RETIREMENT.md`
- `docs/document-studio/TEST-VERIFICATION.md`

---

# 5. Test and release gates

## 5.1 Existing gates

Run the repo's current commands, not guessed replacements:

```bash
pnpm typecheck
pnpm test:unit
pnpm lint
pnpm build
pnpm check:hygiene
```

If script names or runner changed, inspect `package.json` and update this document with actual commands and output.

## 5.2 New tests

### Routing/UI

- `/document-studio/library`, `/activity`, `/settings`, `/tools/extract` render.
- Every Operation Registry slug resolves to exactly one route.
- Old `/pdf/extract`, `/pdf/library`, and existing tool routes preserve behavior via redirect/compat path.
- No active Document Studio page imports `usePdfStudio` or `usePdfExplorer`.
- Home and Convert only show server-available operation/edges.

### Input/Output migration

- Dry-run does not mutate any source.
- Re-running the same migration does not duplicate records.
- Same filename in `sources/` and `inputs/` does not overwrite.
- `word/` records retain read-only metadata.
- Output artifacts from `split/images/merged/products/office` remain discoverable under Output.
- Byte count and SHA-256 verify exactly.
- Checkpoints/presets/trash/audit retain IDs/content.
- Rollback does not delete either source or copied destination.

### Activity

- Local/Electron `Open` uses `openLocalPath(artifact.localPath)`.
- Local/Electron `Reveal` uses `revealLocalPath`.
- Browser Preview uses exact safe MIME allowlist.
- Browser unsupported formats display Download only.
- Cloud payload excludes `localPath`, provider key and signed grant.

### AI Extraction

- Model catalogue loads from Hub dynamically.
- Selecting explicit `connectionId/modelId` is honored if still valid.
- Revoked/removed model returns a typed error; no silent fallback.
- Preset create/edit/delete preserves old fields and IDs.
- Prompt/config snapshot is versioned and has no credentials.
- Checkpoint reuse and forced rerun work as expected.
- Outputs publish to common Output library and appear in Activity.
- Retry/cancel/progress survive process restart where runtime claims durable jobs.
- Vercel AI extraction is not offered without external worker.

### Conversion Matrix

- Each edge has fixture input and validates output signature/content.
- XML parser blocks DTD/external entity resolution.
- CSV/XLSX export prevents formula injection from untrusted values.
- Conversion claims and limitations match actual executor behavior.

## 5.3 Integration tests for Hub Storage

Use real Hub only when an actual enabled Storage Connection is visible to `tm-tools` and the test environment has a valid Hub App Secret + caller identity. Verify:

1. `storage.connections()` returns an allowed sanitized connection.
2. initiate upload succeeds with explicit `connectionId`.
3. browser/server PUT to signed upload grant succeeds.
4. complete verifies size/content type and returns ready object.
5. artifact is persisted by objectId and survives a later request.
6. download grant is requested server-side and bytes stream through authenticated tm-tools endpoint.
7. delete removes object and marks manifest deleted.
8. no signed download URL, provider credentials or Hub App Secret appears in client output/logs.

If no Storage Connection is available, report `blocked: no usable Storage Connection` and keep unit/fake tests separate; do not label it E2E PASS.

---

# 6. Release decision checklist

Before merge/cutover confirm:

- [ ] all current source files reviewed against actual main SHA;
- [ ] no duplicate Operation/Format/Executor registries;
- [ ] dynamic operation route and Library are live;
- [ ] AI Extraction parity signed off against old page;
- [ ] Activity Open/Preview/Download actions verified on Electron;
- [ ] Input/Output migration dry-run report reviewed;
- [ ] backup completed and migration checksums pass;
- [ ] rollback tested on a copy of the data root;
- [ ] old API consumers checked;
- [ ] Hub route seeds/permissions updated;
- [ ] docs and phase status show evidence and unproven items honestly.

Do not archive/delete legacy folders in this release unless the user has explicitly approved after reviewing the migration report.
