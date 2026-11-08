# Storage & runtime matrix

Three runtimes share one codebase. This table is the contract; anything that is
not implemented is marked as such rather than assumed.

## 1. Storage layers

| Layer | Local / Electron | Vercel | Status |
| --- | --- | --- | --- |
| Reusable input library | `<root>/input/` | — (no fake cloud library) | local only |
| Job staging | `<root>/.system/jobs/<id>/input` | `os.tmpdir()/tm-document-studio/<hash>-XXXXXX/input` | local implemented; cloud implemented, never run live |
| Job working | `<root>/.system/jobs/<id>/working` | same scratch root, `working/` | local implemented; cloud implemented |
| Job output (pre-publish) | `<root>/.system/jobs/<id>/output` | same scratch root, `output/` | local implemented; cloud implemented |
| Published result | `<root>/output/` | Hub Storage namespace `tm-tools/pdf` (driver `hub`) or R2 prefix `document/<hash>/<jobId>/output/` (driver `r2`); with neither, inline in the `/documents/run` response | local implemented and tested; cloud implemented behind fixtures, never run live |
| Job metadata | `<root>/.system/jobs/<id>/manifest.json` | PostgreSQL `document_*` tables | local implemented and tested; cloud implemented, never run live |
| Engine checkpoints | `<root>/checkpoints/` (v3) | — | unchanged |
| Audit log | `<root>/audit.jsonl` (v3) | — | unchanged |

`<root>` is `config.pdf.dir`, resolved as `PDF_DATA_DIR` if set, otherwise
`<data root>/pdf`, where the data root is `TOOLS_DATA_DIR` when Electron exports
it and `process.cwd()/.data` otherwise (`server/config/index.ts`).

The cloud scratch directory name is a `sha256(jobId)` prefix plus `mkdtemp`'s
random suffix, so it is never derived from user input and two invocations cannot
collide.

## 2. Directory layout

```
<root>/
├── input/                 optional reusable library (empty unless the user imports)
├── output/                published artifacts, human-facing
└── .system/
    └── jobs/<jobId>/
        ├── input/<inputId>/<safeName>
        ├── working/
        ├── output/<artifactName>
        └── manifest.json
```

Legacy v3 areas (`sources`, `inputs`, `word`, `split`, `images`, `merged`,
`products`, `office`, `checkpoints`, `.trash`, `audit.jsonl`, `presets.json`)
remain untouched beside these. Nothing in the v4 path reads or writes them.

## 3. Runtime detection

| Signal | Runtime |
| --- | --- |
| `DOCUMENT_RUNTIME` override (`local`/`electron`/`vercel`/`worker`) | that value |
| `VERCEL` or `AWS_LAMBDA_FUNCTION_NAME` | `vercel` |
| `process.versions.electron` or `TOOLS_DATA_DIR` | `electron` |
| otherwise | `local` |

The override exists for tests and for an operator who needs to force a runtime
during diagnosis.

## 4. Resource policy

| Limit | local | electron | vercel | worker |
| --- | --- | --- | --- | --- |
| max file | 200 MB | 200 MB | 100 MB | 1 GB |
| max total input | 500 MB | 500 MB | 100 MB | 4 GB |
| max input files | 50 | 50 | 10 | 200 |
| max temp | 2 GB | 2 GB | 350 MB | 8 GB |
| max output | 1 GB | 1 GB | 200 MB | 4 GB |
| inline duration | 15 min | 15 min | 60 s | 60 min |
| async jobs | yes | yes | no | yes |
| external worker | no | no | yes | yes |

The cloud values come from the platform facts recorded in the audit: a 4.5 MB
function payload, a 500 MB `/tmp`, and plan-dependent durations. 350 MB sits
below the platform cap so a concurrent invocation is not squeezed out. They are
deliberately conservative — a job that cannot fit answers
`DOCUMENT_WORKER_REQUIRED` (measured estimate) before any byte is downloaded,
and `DOCUMENT_TEMP_CAPACITY_EXCEEDED` if actual usage overshoots.

A cloud runtime with no storage driver is `ephemeral`: `runtimeCapabilities()`
caps `maxFileBytes`, `maxTotalInputBytes` and `maxOutputBytes` at
`EPHEMERAL_MAX_BYTES` (3 MB) because the request carries both the input and the
base64 output, and disables `supportsDirectUpload` and `supportsAsyncJobs`.

## 4a. Storage driver selection (`DOCUMENT_STORAGE_DRIVER`, default `auto`)

| Config | Driver | Notes |
| --- | --- | --- |
| `local` | none | desktop only; cloud would report `ephemeral` |
| `hub` | `hub` when `NUXT_PUBLIC_HUB_URL` + `NUXT_HUB_APP_SECRET` exist | every call still needs a live user token and a Storage grant |
| `r2` | `r2` when the `R2_*` set is complete | deployment owns the bucket credential |
| `auto` | `hub` if configured, else `r2` if complete, else none | Hub first because it owns the provider credentials; `DOCUMENT_STORAGE_DRIVER=r2` overrides. No silent durable claim when neither exists |

## 5. Capability by operation × runtime

| Operation | local | electron | vercel | worker |
| --- | --- | --- | --- | --- |
| `pdf.split` | yes | yes | yes (≤100 pages) | yes |
| `pdf.merge` | yes | yes | yes (≤10 files) | yes |
| `pdf.rasterize` | yes | yes | **no** — native canvas | yes |
| `pdf.images-to-pdf` | yes | yes | yes (bounded) | yes |
| `document.convert-to-pdf` | yes | yes | yes (bounded) | yes |
| `pdf.export` | yes | yes | yes (≤50 pages) | yes |
| `document.ai-extract` | not in v4 — v3 `/pdf/extract` | same | **no** — long job + relay | not in v4 — no executor yet |

`OVERRIDES` in `server/modules/document/runtime.ts` is the single table that
decides this, and `/api/v1/documents/operations` reports `available` plus a
`runtimeSupport` object (including `reasonDisabled`) from it. Flipping an
operation to cloud-supported is a one-line change plus a matching test.

## 6. Delivery

| Runtime | Delivery adapter | User-visible claim |
| --- | --- | --- |
| local / electron | `LocalOutputDelivery` — copy into `output/`, numeric suffix on collision | "saved to the output folder" |
| cloud, driver `hub` or `r2` | `ObjectStorageDelivery` — upload into the provider, download via an authenticated route or a short-lived signed GET | "ready to download" |
| cloud, no driver | `EphemeralOutputDelivery` — the executor's own file is the artifact; `/documents/run` returns the bytes inline | "downloaded in this response; not stored" |

`requiresDownloadDelivery` drives the wording, so the UI cannot claim a file was
saved locally when it was not. Only the R2 driver answers with a 302 to a
short-lived signed GET; Hub and local stream the bytes through the authenticated
download route, because the Hub grant must not leave the server. Ephemeral mode
sets `ephemeralResults`, which the client uses to skip job polling and offer the
inline bytes instead; job-id routes refuse with `use-single-request-run` rather
than returning 404 for a link that cannot exist.
