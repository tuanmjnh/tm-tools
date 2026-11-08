# Deploying Document Studio to Vercel

Status: **configuration written, deployment not run.** No Preview deployment was
created from this workspace and no Neon database, Storage Connection or R2 bucket
exists here, so every statement below about Vercel behaviour is a plan backed by
platform docs, not an observation.

## 1. Project settings

Let the framework adapter do the work. Do not hand-write build output paths.

| Setting | Value | Why |
| --- | --- | --- |
| Framework preset | **Nuxt** (auto-detected) | `nuxt.config.ts` is present; Nitro emits the Vercel build output itself |
| Root directory | repository root | the app is the repo |
| Install command | `pnpm install --frozen-lockfile` | lockfile is committed; `pnpm@12.15.0` is pinned in `package.json` |
| Build command | `pnpm build` (`nuxt build`) | no custom output dir needed |
| Output directory | *leave empty* | Nitro's Vercel preset writes `.vercel/output`; overriding it breaks routing |
| Node.js version | 24.x | `engines.node` is not pinned in `package.json`, but `pdf-to-img@7` requires ≥22.13 or ≥24 |

`vercel.json` at the repository root is deliberately almost empty:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": { "deploymentEnabled": false }
}
```

What was wrong before and why it is gone:

- It rewrote `/(.*)` → `/__nuxt_spa_fallback`. That sent **every** request,
  including `/api/**`, to the SPA shell, so no API route could ever answer.
- `setup`, hand-written `builds`/`functions` entries and Next.js-style `routes`
  are not valid for a Nitro-on-Vercel project. Nitro generates the function and
  route manifest; a second, conflicting manifest is what breaks deploys.
- SPA routing needs nothing here: `ssr: false` already produces a single
  `index.html` and Nitro serves it for unmatched page routes.

Keep `git.deploymentEnabled: false` only if you want to promote deployments
manually. Remove it if you want every push to deploy.

## 2. Environment variables

Server-only values, set per environment (Development / Preview / Production).
Nothing here may start with `NUXT_PUBLIC_`.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `DOCUMENT_RUNTIME` | all | `vercel` in cloud, `local`/`electron` elsewhere; omit to auto-detect |
| `DATABASE_URL` | Preview + Production | Neon **pooled** connection string (`sslmode=require`) |
| `DATABASE_URL_DIRECT` | migrations only | Neon direct (non-pooled) string for `psql` |
| `DOCUMENT_STORAGE_DRIVER` | all | `auto` (default), `hub`, `r2` or `local` |
| `NUXT_HUB_APP_SECRET` | Preview + Production | Hub App Secret; server-only, proves the **app** to Hub. Never `NUXT_PUBLIC_*` |
| `DOCUMENT_STORAGE_CONNECTION_ID` | optional | preferred Hub connection; Hub still authorizes every call |
| `DOCUMENT_STORAGE_NAMESPACE` | optional | default `tm-tools/pdf` |
| `DOCUMENT_STORAGE_MAX_INLINE_BYTES` | optional | default `1000000`; larger bytes become a grant instead of a body |
| `DOCUMENT_HUB_TIMEOUT_MS` | optional | default `15000` |
| `R2_ACCOUNT_ID` | only for `r2` | Cloudflare account |
| `R2_ENDPOINT` | only for `r2` | `https://<account-id>.r2.cloudflarestorage.com`; derived from the account id if omitted |
| `R2_REGION` | only for `r2` | `auto` |
| `R2_ACCESS_KEY_ID` | only for `r2` | R2 API token |
| `R2_SECRET_ACCESS_KEY` | only for `r2` | R2 API token secret |
| `R2_BUCKET_NAME` | only for `r2` | private bucket; **use a different bucket or prefix per environment** |
| `DOCUMENT_CLEANUP_TOKEN` | Preview + Production | bearer token for the retention route |
| `DOCUMENT_PRESIGN_UPLOAD_TTL_SECONDS` | optional | default `600` |
| `DOCUMENT_PRESIGN_DOWNLOAD_TTL_SECONDS` | optional | default `300` |
| `DOCUMENT_MAX_UPLOAD_BYTES` | optional | default `104857600` (100 MB) |
| `DOCUMENT_MAX_TOTAL_JOB_BYTES` | optional | default `104857600` |
| `DOCUMENT_MAX_SCRATCH_BYTES` | optional | default `367001600` (350 MB), below the platform's 500 MB `/tmp` |
| `DOCUMENT_INPUT_RETENTION_HOURS` | optional | default `24` |
| `DOCUMENT_OUTPUT_RETENTION_HOURS` | optional | default `24` |
| `DOCUMENT_JOB_HISTORY_DAYS` | optional | default `7` |

Plus the existing app variables (`AUTH_JWT_SECRET`, `NUXT_PUBLIC_HUB_URL`,
`NUXT_PUBLIC_HUB_APP_ID`). See `.env.example`.

A deployment with **no** storage driver is legal but degraded: it reports
`storage.mode = "ephemeral"`, serves only `POST /api/v1/documents/run` (result
returned inline as base64, ≤3 MB), and refuses job-id routes. Use it for a smoke
test, not for user data.

Preview must not point at the production database or bucket. A preview that can
expire production artifacts is a data-loss bug waiting for a cron.

## 3. Health check

`GET /api/v1/documents/health` is public (no user session) and reports:

```json
{
  "runtime": "vercel",
  "storage": {
    "driver": "hub",
    "persistent": true,
    "requiresSession": true,
    "mode": "durable",
    "ephemeral": false,
    "configured": true
  },
  "database": { "configured": true, "connected": true },
  "operations": [{ "id": "pdf.split", "enabled": true }],
  "limits": { "maxFileBytes": 104857600 }
}
```

`driver` is `hub`, `r2`, `local` or `none`; `mode` is `durable` or `ephemeral`.
A Hub deployment says `requiresSession: true` because the gateway checks the
caller's own token, and this route is public — so it reports the capability, not
a verdict on the monitor that called it. Use `database.connected === true` and
`storage.configured === true` (or an intentional `mode: "ephemeral"`) as the
deployment gate.

It never returns a connection string, bucket name, credential or signed URL.

## 4. Preview checklist

Run in this order; stop at the first failure.

1. `pnpm install --frozen-lockfile` on a clean checkout.
2. `pnpm check:hygiene` — no emitted `.js` twins in the source tree.
3. `pnpm typecheck` — exit 0, zero `error TS` lines.
4. `pnpm test` — all specs pass.
5. `pnpm build` — Nitro output written under `.output/`.
6. `pnpm dlx vercel@latest build` — succeeds with the project's own settings.
7. Deploy to Preview, then `GET /api/v1/documents/health` → database connected,
   a storage driver selected (or `mode: "ephemeral"` on purpose).
8. `GET /api/v1/documents/operations` without a session → **401** (expected).
9. With a legitimately issued session: create a job, upload, start, download,
   delete. See [`TEST-VERIFICATION.md`](./TEST-VERIFICATION.md) for the matrix.
10. Confirm the second invocation can read the job the first one created — that
    is the proof that job state lives in Postgres, not memory.
11. Upload a file larger than 4.5 MB and confirm the bytes went browser → Hub (or
    R2), not through the Function.

## 5. Platform limits this design assumes

Re-check these against Vercel's docs before a release; they change.

| Limit | Value assumed here | Consequence in code |
| --- | --- | --- |
| Function request/response body | ~4.5 MB | uploads and downloads bypass the Function |
| Writable `/tmp` | 500 MB | scratch capped at 350 MB by `DOCUMENT_MAX_SCRATCH_BYTES` |
| Function duration | plan dependent | jobs over the scratch/duration budget return `DOCUMENT_WORKER_REQUIRED` |
| Bundle size | platform cap | `pdf-to-img`/`pdfjs-dist` are pulled only by the rasterize/export path |

## 6. Do not

- Do not proxy durable uploads or downloads through a Function body.
- Do not treat `/tmp` as storage. The one exception is the explicit ephemeral
  mode, which returns bytes inline from the same request and promises nothing to
  the next one; never present that as persistence.
- Do not add `setup`, `builds` or Next.js-style `routes` to `vercel.json`.
- Do not let Preview write to a production bucket, Storage Connection or database.
- Do not claim a deployment works without a Preview URL from a real run.
