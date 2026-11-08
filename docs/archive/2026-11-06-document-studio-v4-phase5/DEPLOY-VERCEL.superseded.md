# Deploying Document Studio to Vercel

**Status: not implemented.** This document records the constraints that will
shape phase 5–6 and the decisions already made in code. It does not claim a
working deployment.

## 1. What the repository does today

- No `vercel.json`, no `nitro.preset`, no CI workflow for Vercel.
- `.output/nitro.json` (local build, 2026-11-03) says `preset: node-server`.
- The dev server is `node-server` as well; Electron imports that output
  in-process.

So a Vercel deploy is a new target, not a reconfiguration of an existing one.

## 2. Platform constraints that shape the design

Checked 2026-11-06 (spec §28); re-check before relying on them.

| Constraint | Consequence |
| --- | --- |
| Function filesystem read-only except `/tmp` | No `.data/pdf`, no `data.root` writes |
| `/tmp` ≤ 500 MB, scratch only | Temp workspace must be per-invocation; never the job store |
| Request/response payload 4.5 MB | Uploads above that must bypass the function body |
| Private Blob is Beta; >100 MB not recommended | Storage adapter must be provider-neutral |
| Hobby cron once per day | Cleanup must be event-driven first, cron second |
| Function duration/memory plan-dependent | Long operations cannot be promised |

## 3. What is already correct in the code

- `runtimeCapabilities('vercel')` caps file/total/temp/output sizes and turns
  off async jobs, so nothing can silently exceed the platform.
- `requiresDownloadDelivery` is true there, so the UI says "download" instead of
  "saved to folder".
- `documentRuntime()` **throws** `DOCUMENT_RUNTIME_NOT_SUPPORTED` on a non-local
  runtime rather than writing to `/tmp` and pretending it persisted. This is the
  guard that makes the missing phase 5 impossible to ship by accident.
- Job records never store absolute paths, storage keys are server-generated, and
  the artifact view exposes only an authenticated download route.

## 4. Phase 5 deliverables (not started)

1. **Job repository.** MongoDB adapter implementing `DocumentJobRepository`.
   Collections: `document_jobs`, `document_job_inputs`, `document_artifacts`.
   Indexes: `{ ownerId, createdAt }`, `{ status, expiresAt }`, unique `jobId`,
   unique `artifactId`. Mongo is already required for auth, so no new service.
2. **Storage provider.** `VercelBlobStorageProvider` implementing
   `DocumentStorageProvider` with private access. Keys:
   `<ownerId>/jobs/<jobId>/{input|output}/<id>/<safeName>`.
3. **Direct upload.** `POST /jobs/:id/upload-targets` → scoped token,
   `POST /jobs/:id/finalize-upload` → verify size/type/owner before start. The
   existing local `POST /jobs/:id/inputs` stays for small files and for local.
4. **Temp provider.** `/tmp/<jobId>/{input,working,output}` with the same
   interface, plus a `finally` that always removes the tree.
5. **Runtime gate.** Replace the throw in `runtime-context.ts` with the cloud
   adapter set, and re-run the capability matrix — `pdf.rasterize` and
   `document.ai-extract` must stay off unless the native canvas and the relay
   duration are proven there.

## 5. Environment variables to define

Names only — values belong in the Vercel dashboard, never in the repo.

```
MONGODB_URI                     long-lived connection string
MONGODB_DB_NAME
AUTH_JWT_SECRET                 must match tm-hub
NUXT_PUBLIC_HUB_URL
NUXT_PUBLIC_HUB_APP_ID
NUXT_HUB_APP_SECRET             AI relay
BLOB_READ_WRITE_TOKEN           private store only (never exposed to the browser)
DOCUMENT_RUNTIME=vercel         optional override
```

## 6. Deployment checklist for phase 6

1. `nuxt build` with the Vercel preset; confirm bundle size and that
   `@napi-rs/canvas` resolves for Linux x64 (it will, if rasterize stays
   disabled).
2. Deploy to Preview; run the smoke sequence from `VERIFICATION.md` §3 against
   the preview URL with a real session.
3. Verify: upload > 4.5 MB uses the direct path; a second invocation can read
   the job started by the first; the download route rejects a foreign token;
   `/tmp` is empty after every request.
4. Verify cleanup: expire a job, confirm the object and the record are gone.
5. Only then flip an operation to `available` for `vercel`.

## 7. Do not

- Do not enable Private Blob for large public assets — artifacts are private and
  user-owned.
- Do not proxy large uploads through a Function.
- Do not treat `/tmp` as storage, even for "just one request".
- Do not restore legacy area semantics on the cloud: there is no persistent
  filesystem to hold them.
