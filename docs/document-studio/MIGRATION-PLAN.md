# Migration plan — v3 workspace → v4 studio

The rule from spec §0.3: design changes are allowed, existing data and engines
are not. Nothing in `.data/pdf` has been moved, renamed or deleted.

## 1. What stays byte-identical

| Item | Reason |
| --- | --- |
| `sources/`, `inputs/`, `word/`, `split/`, `images/`, `merged/`, `products/`, `office/` | user data |
| `checkpoints/`, `.trash/`, `audit.jsonl`, `presets.json` | extraction state and audit trail |
| `/api/v1/pdf/**` (48 routes) | other pages and any external caller still depend on them |
| Every engine in `server/modules/pdf/**` | reused through adapters; only `convert.ts` gained a buffer entry point |
| `electron/**` | not touched in phases 0–4 |

The one existing-code change with behavioural effect is
`server/config/index.ts`: the PDF root now resolves through a shared
`resolveDataRoot()` so the packaged Electron app writes into `userData` instead
of the read-only install directory. Dev behaviour is unchanged (`.data/pdf`).

## 2. What was added

```
shared/types/document/index.ts
server/modules/document/{contracts,operations,runtime,runtime-context,paths,
                         temporary,storage,jobs,staging,executors,runner,output,cleanup}.ts
server/utils/documentApi.ts
server/api/v1/documents/**  (11 route files)
server/plugins/documentCleanup.ts
app/utils/documentStudio.ts
app/composables/{useDocumentApi,useDocumentFiles,useDocumentRun,useDocumentOperationPage}.ts
app/components/document-studio/{OperationPageShell,OperationStepHeader}.vue
app/pages/document-studio/{index.vue,tools/*.vue}  (6 tool pages)
```

Added, not replaced. The runtime creates `input/`, `output/` and `.system/jobs/`
under the existing root the first time a job is created.

## 3. Route parity

| Legacy page | v4 page | Status |
| --- | --- | --- |
| `/pdf/split` (split a source) | `/document-studio/tools/split` | **parity** — same engine, file picked from anywhere |
| `/pdf/split` (merge a folder) | `/document-studio/tools/merge` | **parity with changed input model** — v4 merges selected files in chosen order; the folder flow stays on the legacy page |
| `/pdf/images` (PDF→PNG) | `/document-studio/tools/images` | **parity** |
| `/pdf/images` (PNG→PDF) | `/document-studio/tools/images-to-pdf` | **parity with changed input model** — selected images instead of a folder |
| `/pdf/import` | `/document-studio/tools/convert` | parity for one file; the legacy page still offers library browsing |
| `/pdf/export` | `/document-studio/tools/export` | parity for formats, but `xlsx|csv|json|xml` still depend on cached extraction rows |
| `/pdf/extract` | — | **not migrated** (phase 7) |
| `/pdf/library` | — | stays as the legacy explorer |

## 4. Deliberate differences

- **Selection instead of area.** The user picks files; nothing is copied into a
  persistent folder unless they import it. This is the core of v4, not a
  regression.
- **Publish location.** v4 publishes to `<root>/output/`, not into the area
  that matches the tool. Legacy runs still land in `split/`, `images/`, etc.
  Users who rely on the old location keep using the old pages.
- **Name collisions.** v4 appends ` (1)`, ` (2)` rather than overwriting.
- **Merge ordering.** v4 honours picker order; the legacy engine sorts a folder
  by name.

## 5. Phase plan and current state

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Audit + capability matrix | done — [`REBUILD-AUDIT.md`](./REBUILD-AUDIT.md) |
| 1 | Domain contracts + adapters + tests | done |
| 2 | Local runtime foundation (staging, temp, jobs, publish, janitor) | done |
| 3 | Unified UI foundation (Home, shell, pickers, result list) | done |
| 4 | Operation registry + six PDF tools migrated | done |
| 5 | Cloud storage + durable job foundation | **code done, deployment blocked** — Neon schema/repository + R2 provider implemented; no database or bucket exists in this workspace, so it is proven by specs with fakes, not against a live service |
| 6 | Vercel runtime processing + deployment | **code done, deployment blocked** — bounded `/tmp` scratch, per-operation capability gate, `DOCUMENT_WORKER_REQUIRED`; no Preview deployment was run |
| 7 | AI extraction migration | **not started** — v3 extraction still in-memory; `/pdf/extract` deliberately untouched |
| 8 | Activity, retention, cleanup, worker abstraction | partially — local janitor, cloud retention sweep and cleanup route exist; Activity UI, retention settings and a real external worker do not |
| 9 | Legacy retirement | **not started** — requires parity sign-off on merge/convert input models |

## 6. What phase 5 decided

Recorded in [`CLOUD-ARCHITECTURE.md`](./CLOUD-ARCHITECTURE.md); the short version:

1. **Database: PostgreSQL on Neon.** Not MongoDB. The completion guide §1.2
   forbids adding MongoDB, so the cloud job repository is SQL
   (`migrations/postgres/0001_document_studio.sql`). Auth's MongoDB dependency
   is unrelated and unchanged.
2. **Object storage: Cloudflare R2 private bucket** through the S3 API. Vercel
   Blob is not used.
3. **Direct upload.** Below 25 MB the browser gets one presigned `PUT`; above it,
   a multipart plan (5 MB parts) with signed per-part URLs and one finalize call
   that HEADs the object and compares the byte count. The Function never proxies
   a body.
4. **Runtime gate.** `documentRuntime()` no longer refuses every cloud call. It
   selects Postgres + R2 when configured, answers
   `DOCUMENT_DATABASE_NOT_CONFIGURED` / `DOCUMENT_STORAGE_NOT_CONFIGURED` when
   not, and per-operation support decides whether a specific tool is offered.

## 7. Rollback

The v4 surface is additive. Deleting `app/pages/document-studio`,
`server/api/v1/documents`, `server/modules/document` and
`shared/types/document`, plus reverting the config root change, returns the app
to its v3 behaviour with no data loss — v4 never mutates legacy areas.

Cloud rollback, in order:

1. Set `DOCUMENT_RUNTIME=local` (or remove the Vercel env vars) so the cloud
   adapters are never selected.
2. Keep the five `document_*` tables. They hold job metadata only; dropping them
   is safe but unnecessary and it discards history.
3. Remove the R2 bucket lifecycle rule before deleting the bucket, so a
   scheduled expiry cannot race a backup.
4. `/pdf/extract` and `/api/v1/pdf/**` were never migrated, so they need no
   rollback.
