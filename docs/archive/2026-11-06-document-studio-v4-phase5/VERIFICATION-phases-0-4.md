# Document Studio v4 — Verification

Evidence for phases 0–4 on 2026-11-06. Every number below comes from a run in
this workspace; nothing is projected.

## 1. Gate results

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx nuxt typecheck` | exit 0, `grep -c "error TS"` = **0**, `.nuxt/eslint.config.mjs` 24972 bytes regenerated in the same run |
| Lint | `npx eslint` on every new/touched file | exit 0 |
| Unit tests | `pnpm test` | **30/30 specs passed** (27 pre-existing + 3 new) |
| Locales | key parity check | en **2829**, vi **2829**, drift **0** |
| Pages | HTTP probe on the dev server | `/document-studio`, all six `/document-studio/tools/*`, and the untouched `/pdf`, `/pdf/split`, `/pdf/library` → 200 |
| SFC compile | `/_nuxt/@fs/...` probe | Home, Split page, `OperationPageShell`, `OperationStepHeader` → 200 |

Baseline before any v4 change: typecheck 0 errors, lint 0, 27/27 specs.

### A trap found and fixed during the gate

`npx nuxt typecheck` failed with `Cannot add property setup, object is not
extensible` on every attempt. Root cause: 289 `.js` files had been emitted next
to their `.ts` sources (TypeScript 6 emit at 16:08), and Nuxt/Vite resolved the
`.js` twins ahead of the real sources. The files are gitignored (`/app/**/*.js`)
so `git status` never showed them. After removing those build artifacts, the
typecheck passed. Anyone re-running the gate should check for stray emitted
`.js`/`.vue.js` files first.

## 2. New specs

| Spec | Suites | What it pins |
| --- | --- | --- |
| `tests/unit/document_contracts.spec.ts` | 6 | registry ids/versions, async-only extraction, typed errors and statuses, runtime detection, per-runtime operation support, state-machine edges, timestamps, manifest durability, ownership scoping (job + artifacts + listing), temp dirs, job-id rejection, quota, cleanup isolation, orphan cutoff, storage round-trip, magic/size verification, key-escape refusal |
| `tests/unit/document_local_runtime.spec.ts` | 5 | stage-once write location, type and magic-byte rejection, cardinality, real split execution (3 artifacts published to `output/`), input/working dropped while output survives, progress + timestamps, no-input and foreign-owner refusal, path-traversal attempt produces no artifact outside the root, merge order (2+3 pages → 5), images→PDF (2 pages), config snapshot omitted from the view, janitor removes expired and keeps active jobs, export artifacts stay in the job output root (so the recorded key resolves), an all-failing export leaves the job `failed` |
| `tests/unit/document_studio_ui.spec.ts` | 5 | operation pages never mount the explorer, never import server/node code, never compose paths; every tool page uses the shared binding; the client only addresses `/api/v1/documents`; uploads are multipart, never base64; error codes are mapped; run order is draft → upload → start; the catalogue mirrors the seven server ids; the shell keeps a single primary action and states the real delivery mode |

## 3. Live API smoke (dev server, :4002)

Run with a signed hub-format token (`userId: smoke-user`, `role: root`) against
the real Nitro server:

```
catalog  200  6 operations, runtime local
create   200  <jobId>
upload   200  1 input staged
start    200  completed, 2 artifacts [page_0001.pdf, page_0002.pdf]
download 200  application/pdf, 838 bytes
unauth   401  read without a token
foreign  404  read with another user's token
foreign  404  download with another user's token
reload   200  job still readable after the run
delete   200  { deleted: true, removedBytes: 4132 }
```

Two defects were found by this run and fixed:

1. `DELETE /jobs/:id` returned `DOCUMENT_JOB_NOT_FOUND` for a job that existed.
   The handler cleaned the directory (which holds `manifest.json`) and then asked
   the repository to update it. Now the manifest is not rewritten and the
   directory is removed last.
2. A foreign artifact download answered `DOCUMENT_OUTPUT_NOT_READY` (409),
   which confirms the artifact exists. It now answers
   `DOCUMENT_JOB_NOT_FOUND` (404), identical to a missing artifact.

The smoke test wrote two PDFs into `.data/pdf/output` and a job directory into
`.data/pdf/.system/jobs`; both were removed afterwards. No legacy area was
touched.

## 4. Manual verification still required

- **Signed-in browser pass.** Every `/api/v1/pdf/*` and
  `/api/v1/documents/*` route answers 401 without a session, and this
  environment has no seed credentials (they must never be entered by the agent).
  So interaction states — drag/drop highlighting, reorder buttons, progress,
  the error alert — are verified statically, by SFC compile, and by the API
  smoke, not visually.
- **Electron packaged run.** The `TOOLS_DATA_DIR` root change is typechecked and
  reasoned from `electron/main.cjs`, but not exercised in an installer build.

## 5. Claims that must not be made yet

- No cloud runtime works. `documentRuntime()` throws
  `DOCUMENT_RUNTIME_NOT_SUPPORTED` for anything that is not local/electron.
- AI extraction is not on the v4 surface. It is registered for the catalogue but
  has no executor, so the catalogue filters it out and no card or route exists.
- Merge and Convert are at parity for the selected-file model, **not** for the
  legacy folder/library model; those pages remain the supported path for it.
