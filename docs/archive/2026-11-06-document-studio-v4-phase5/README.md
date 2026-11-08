# Archive — Document Studio v4 pre-Phase-5 docs

> Superseded on **2026-11-06** when the completion guide
> ([`docs/pdf/TM-DOCUMENT-STUDIO-V4-COMPLETION-GUIDE.md`](../../pdf/TM-DOCUMENT-STUDIO-V4-COMPLETION-GUIDE.md))
> fixed the cloud stack.

| Archived file | Was | Replaced by |
| --- | --- | --- |
| `DEPLOY-VERCEL.superseded.md` | Deployment plan proposing MongoDB + Vercel Private Blob | [`docs/document-studio/VERCEL-DEPLOYMENT.md`](../../document-studio/VERCEL-DEPLOYMENT.md) |
| `VERIFICATION-phases-0-4.md` | Gate evidence for phases 0–4 | [`docs/document-studio/TEST-VERIFICATION.md`](../../document-studio/TEST-VERIFICATION.md) (carries the earlier evidence forward) |

## Why they were replaced

The early deployment draft predated the guide and chose the wrong services:

| Draft claim | Decision that replaced it |
| --- | --- |
| Job repository on **MongoDB** ("already required for auth") | **PostgreSQL on Neon** — guide §1.2 forbids adding MongoDB for new implementation |
| **Vercel Private Blob** for artifacts | **Cloudflare R2 private bucket** behind the provider interface — guide §2.1 |
| `POST /jobs/:id/upload-targets` + `finalize-upload` | `POST /jobs/:id/inputs/intent` + `inputs/:inputId/complete` (matches the route convention already in the repo) |
| "Runtime gate throws on any non-local runtime" | Per-operation capability; only the unsupported operation fails — guide §11.1 / §20.9 |

Nothing here is source of truth. It is kept verbatim so the history of the
decision stays readable.
