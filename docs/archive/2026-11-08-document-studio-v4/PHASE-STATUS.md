# Document Studio v4 — phase status

Single place to answer "how far is this and what is the evidence". The detailed
documents are linked; this file does not repeat them.

| Phase | Status | Evidence |
| --- | --- | --- |
| 0 — Audit | **DONE** | [`REBUILD-AUDIT.md`](./REBUILD-AUDIT.md) |
| 1 — Contracts & adapters | **DONE** | `tests/unit/document_contracts.spec.ts` |
| 2 — Local runtime | **DONE** | `tests/unit/document_local_runtime.spec.ts` |
| 3 — UI foundation | **DONE** | `tests/unit/document_studio_ui.spec.ts`; pages 200; Hub menu seeded with the nine v4 routes; Settings page reads `/settings` + `/health` |
| 4 — Operation registry + six PDF tools | **DONE** | live smoke, 3 artifacts downloaded |
| 5 — Neon Postgres + R2 | **PARTIAL** — code complete, never run live | `document_cloud_runtime.spec.ts`; schema in `migrations/postgres/` |
| 6 — Vercel runtime | **PARTIAL** — bounded processing implemented, no Preview deployment | [`VERCEL-DEPLOYMENT.md`](./VERCEL-DEPLOYMENT.md) |
| 7 — AI extraction | **PARTIAL** — durability + fingerprints done, still on `/pdf/extract`, no v4 executor | `pdf_extract_checkpoint.spec.ts` |
| 8 — Activity, retention, worker | **PARTIAL** — Activity page, sweep, dispatcher, ZIP download and create-job idempotency done; no external worker | `document_dispatcher.spec.ts`, `document_archive.spec.ts`, `document_idempotency.spec.ts`, retention suite |
| 9 — Legacy retirement | **BLOCKED by design** — nothing retirable yet | [`LEGACY-RETIREMENT.md`](./LEGACY-RETIREMENT.md) |
| 10 — Hub Storage driver | **PARTIAL** — client + provider implemented against the live gateway contract. A Storage Connection is now reported by the user, but the desktop runtime still selects local disk by design (`hubStorageAvailable()` is false for `local`/`electron`), so a cloud runtime plus Postgres is still required to prove upload/complete/download through the gateway. The provider account itself (Supabase `assets` bucket) passed a signed upload/HEAD/download/delete probe — see §11.1 | `tests/unit/document_hub_storage.spec.ts`; live probe in [`TEST-VERIFICATION.md`](./TEST-VERIFICATION.md) §10.3, §11.1 |
| 11 — Ephemeral `/tmp` cloud mode | **DONE** — single-request `POST /run`, inline base64 artifacts, 3 MB cap, job routes refused | `document-ephemeral-smoke.mts` on :4012 |

Gates on 2026-11-07 (re-run after the `sub`→`userId` caller fix and the
`/health` envelope fix): typecheck **0 errors**, scoped lint **0**,
`pnpm test:unit` **40/40**, `pnpm build` **exit 0** (62.5 MB / 24.5 MB gzip),
hygiene **clean**, seed typecheck **0**, API smoke **all checks passed**
(local + ephemeral + a Hub-shaped `sub` token, mock auth, including `6 health /
6 catalogue`, inline artifacts and the over-cap refusal). A live sweep of all
nine Document Studio routes in the running Electron window renders every page
with **0 console errors**, and a real UI upload → split → download produced
3 PDFs and a ZIP. See [`TEST-VERIFICATION.md`](./TEST-VERIFICATION.md)
§10–§12 for the proof classification — still unproven: **Vercel Preview, live
Neon/R2, and a Hub gateway upload/download on a cloud runtime**; the Supabase
provider account itself was probed directly (§11.1).
