# TM Tools — Vercel Deployment (Phase 1: web shell + Document Studio) Design

**Status:** proposal, awaiting owner review. No code written.
**Date:** 2026-11-20
**Scope of this spec:** Phase C (web capability gate) + Phase A (Document Studio on the web). Chat-on-Mongo (B) and media-on-web (D) are explicitly deferred to their own specs.
**Basis:** measured against the working tree on 2026-11-20 (`nuxt.config.ts`, `server/modules/document/runtime.ts`, `server/modules/document/runtime-context.ts`, `server/api/v1/documents/operations.get.ts`, `app/composables/useNavMenu.ts`, `app/middleware/auth.global.ts`, `app/utils/desktop.ts`).

---

## 1. Goal

Ship a **web build of tm-tools on Vercel** that is honest about what it can do:

- The SPA shell, login, routing and navigation work on Vercel.
- **Document Studio** runs the operations that are pure JavaScript and storage-backed (split, merge, images→PDF, convert-to-PDF, structured-data conversion), using **TM Hub storage + Supabase** for bytes and job metadata.
- Every **desktop-only** capability (Browser Hub, media video/download, native-canvas image ops, the ISNet model installer, ffmpeg/yt-dlp) is **hidden and refused** on the web instead of rendering a broken form.

The desktop Electron build is **unchanged** in behaviour.

## 2. Non-goals (this phase)

- Chat on the web (needs `better-sqlite3` → Mongo; Phase B).
- Media video/download on the web (ffmpeg → WASM, yt-dlp → no viable serverless engine; Phase D).
- AI extraction on the web (currently disabled on `vercel` because it is long-running; would need an external worker — see §7 risk).
- A separate web repo/build. We keep one codebase and gate at runtime.

## 3. Key facts the design rests on (already true in code)

| Fact | Evidence |
| :--- | :--- |
| The app is an SPA (`ssr: false`) | `nuxt.config.ts:11` |
| The server already knows it runs on Vercel | `detectRuntime()` → `'vercel'` when `process.env.VERCEL` (`runtime.ts:22`) |
| Native ops are already disabled on `vercel` | `OVERRIDES.vercel` in `runtime.ts:197` disables `pdf.rasterize`, `image.watermark-remove`, `image.background-remove`, `image.convert` |
| The catalogue already folds runtime support into `available` | `operations.get.ts:25` `available: operation.enabled && support.enabled` |
| Cloud runs on Postgres jobs + Hub/R2 storage | `runtime-context.ts:99` `hubRuntimeSet`, `:121` `r2RuntimeSet` |
| The client can detect desktop vs web without a build flag | `isDesktopRuntime()` = `window.electronAPI?.isElectron` (`app/utils/desktop.ts:2`) |
| Deploy is currently switched off | `vercel.json` `git.deploymentEnabled: false` |

Because the *server* runtime and the *client* desktop-ness are both already observable, the gate needs **no new build flag**: the client keys off `isDesktopRuntime()`, the server keys off `detectRuntime()`.

## 4. Phase C — web capability gate

### 4.1 One capability source on the client

Add `app/composables/useCapabilities.ts`:

```ts
export type AppPlatform = 'desktop' | 'web'

const DESKTOP_ONLY_PREFIXES = ['/browser-hub', '/media/video', '/media/download']

export function useCapabilities() {
  const platform = computed<AppPlatform>(() => (isDesktopRuntime() ? 'desktop' : 'web'))
  const isDesktop = computed(() => platform.value === 'desktop')
  const isDesktopOnlyPath = (path: string): boolean =>
    DESKTOP_ONLY_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
  return { platform, isDesktop, isDesktopOnlyPath }
}
```

This is the single place that decides "what the web build may show". It is computed, SSR-safe (SPA only, but still guards `typeof window`), and needs no env.

### 4.2 Hide desktop-only routes in the sidebar

`useNavMenu.buildNavItems` already filters a `hidden` set. Extend the filter to also drop `isDesktopOnlyPath(node.path)` when `!isDesktop`. This removes the entries before Nuxt UI renders them, so no dead menu item is shown.

### 4.3 Refuse desktop-only routes on the web

In `app/middleware/auth.global.ts`, after the auth checks, redirect a **desktop-only path** to `/` when `!isDesktop`. A direct URL visit therefore cannot open a page whose backing IPC does not exist. (Redirect, not 404, so a bookmarked mobile link lands somewhere useful.)

### 4.4 Refuse desktop-only server work on the web

The media routes are **client-only today** (they call `window.electronAPI`, there is no Nitro route). No server change is needed for media. The **ISNet model installer** routes (`/api/v1/documents/image-model/*`) do exist as Nitro routes; add a guard that returns `501 DOCUMENT_OPERATION_NOT_SUPPORTED` when `detectRuntime() === 'vercel'`, so a web client cannot trigger a download into an ephemeral `/tmp`.

### 4.5 Login across origins

The SPA authenticates **directly against Hub** (`useAuth` calls `${hubUrl}/api/v1/auth/*`). On Vercel the origin is the site domain, so **Hub must allow that origin** in the tm-tools app `allowedOrigins` (seed sets `http://localhost:4002`, `app://electron`, `*` today — the `*` already covers it, but the spec records the requirement explicitly so it is not lost when `*` is tightened).

## 5. Phase A — Document Studio on the web

### 5.1 What runs on Vercel (derived from `runtime.ts`, not promised by hand)

| Operation | Web | Why |
| :--- | :--- | :--- |
| `pdf.split` | ✅ | pdf-lib, JS only |
| `pdf.merge` | ✅ | pdf-lib |
| `pdf.images-to-pdf` | ✅ | pdf-lib (+ canvas transcode for webp — see risk §7.3) |
| `document.convert-to-pdf` | ✅ | mammoth/docx/exceljs, JS only |
| `structured.convert` | ✅ | exceljs + pure JS |
| `pdf.export` | ⚠️ partial | docx/xlsx/csv/json/xml OK; `png` needs the canvas → unavailable on web |
| `pdf.rasterize` | ❌ | native canvas — already disabled on vercel |
| `image.watermark-remove` / `image.background-remove` / `image.convert` | ❌ | native canvas — already disabled on vercel |
| `document.ai-extract` | ❌ | disabled on vercel (long-running) — see §7.1 |

The matrix is **already** what `operations.get.ts` returns; Phase A only needs the UI to act on it consistently (5.2) and the infra to be present (5.3).

### 5.2 Make the tool pages respect `available`

`document-studio/index.vue` already hides unavailable tools from the grid (it reads `available` from the catalogue). But the **direct tool pages** (`tools/split.vue`, …) render the full shell regardless. Add a small guard component/section: when the operation is loaded and `available === false`, render a clear "not available on this runtime" panel (reason from `runtimeSupport.reasonDisabled`, localized) instead of the upload/run form. This is where the AI-extract / rasterize web experience becomes honest rather than broken.

### 5.3 Infrastructure for durable web runs

Durable jobs need a Postgres job store and byte storage. `runtime-context.ts` already selects `PostgresJobRepository` whenever a driver is configured, and `hubRuntimeSet` requires a Hub storage grant. The deployment therefore needs:

- **Supabase (Postgres)** reachable from Vercel — `isDatabaseConfigured()` true, and `documentDatabase()` pointing at the pooled connection.
- **TM Hub Storage Gateway** configured for the tm-tools app (an enabled storage grant), so `preferredStorageDriver()` returns `hub` and `hubStorageAvailable()` passes with the caller's token.
- If neither is configured, the app already degrades to **ephemeral inline** (result ≤ `EPHEMERAL_MAX_BYTES` ≈ 3 MB, single request). The spec allows that as an interim mode, but durable runs are the target.

### 5.4 Deploy configuration

- `vercel.json`: enable deployment (`git.deploymentEnabled: true`), keep the default Vercel Nitro preset — `detectRuntime()` then returns `vercel` automatically.
- Env (server-only, never `NUXT_PUBLIC_`): `NUXT_HUB_APP_SECRET` (or an enrolled device credential), `SUPABASE_URL`/`SUPABASE_KEY`, Hub storage settings, optional `DOCUMENT_STORAGE_DRIVER=hub`.
- Env (public): `NUXT_PUBLIC_HUB_URL` (the Hub origin), `NUXT_PUBLIC_HUB_APP_ID`.
- The build must **not** bundle `resources/*.exe` or the `.onnx` — already true after the packaging change (`electron-builder.yml` excludes them; Vercel only ships the Nuxt output anyway).

## 6. Interfaces

**Client capability contract** (new): `useCapabilities()` → `{ platform: 'desktop'|'web', isDesktop, isDesktopOnlyPath(path) }`.

**Operation availability contract** (existing, unchanged): `/api/v1/documents/operations` returns each op with `available` and `runtimeSupport { enabled, reasonDisabled, maxInputFiles, maxPages, … }`. Phase A adds no fields; it makes the UI honour them on direct pages.

**Server refusal contract** (new, one route): `POST /api/v1/documents/image-model/install` and `GET …/status` return `501` on `vercel` (consistent `DOCUMENT_OPERATION_NOT_SUPPORTED`), so a web client cannot start a model download.

## 7. Risks and open decisions

1. **AI extraction is off on Vercel today** (`OVERRIDES.vercel` sets `enabled:false, executionMode:'worker'`). Enabling it on the web requires either (a) accepting inline-only, short runs, or (b) provisioning an external worker. This spec leaves it **off** and records the decision; enabling is a separate change.
2. **`pdf.export → png` and structured exports** pull dependencies: `png` needs the native canvas (off on web); structured exports need cached AI rows (which need AI extraction, itself off). Web users get docx/xlsx/csv/json/xml export only when their input path supports it. The UI must reflect this via `available`/`reasonDisabled`, not silently fail.
3. **`webp → PDF` on web** transcodes with `@napi-rs/canvas`, a native module that does not run on Vercel. On the web, a `.webp` input to images→PDF will fail. Either accept it (reject webp on web with a clear message) or add a pure-JS webp decoder later. Recorded as a known web limitation.
4. **Supabase / Hub reachability** — Mongo/Postgres must be reachable from Vercel's network; Supabase pooler is recommended. Hub storage grant must exist or the deployment silently falls to ephemeral ≤3 MB.
5. **Cold-start latency** for large pdf-lib jobs inside a Function; bounded by Vercel function limits and the runtime's `maxInlineDurationMs` (60 s on vercel). Large operations may need a worker later.

## 8. Verification (definition of done for Phase 1)

- **Client gate:** on a web build, `/browser-hub`, `/media/video`, `/media/download` are absent from the sidebar and a direct visit redirects to `/`.
- **Document Studio web:** `/document-studio` lists only `available` tools; the five JS ops run end-to-end against Hub storage + Supabase in a Vercel preview; results download.
- **Honest refusals:** `tools/extract`, `tools/images`, `tools/watermark`, `tools/remove-bg`, `tools/image-convert` show the "not available on this runtime" panel on web; the model-install route returns 501.
- **Desktop unchanged:** the Electron build still shows and runs every tool; its gates still pass (`nuxt typecheck`, eslint, `pnpm test`, `build:electron`).
- **Auth:** login from the Vercel origin reaches Hub and returns a session; protected routes work.
- Gates: `nuxt typecheck` exit 0 / 0 `error TS`, eslint 0 on touched files after config regen, `pnpm test` green.

## 9. Phases after this spec (not built here)

- **Phase B — chat on Mongo:** replace `better-sqlite3` in `server/modules/chat/store.ts` with the Mongo adapter (`@tuanmjnh/tm-mongo` / `mongodb`); same `/chat/*` routes.
- **Phase D — media on web:** `@ffmpeg/ffmpeg` (WASM) for render/convert, rewritten to run in-browser; **YouTube download stays desktop-only or moves to a dedicated VPS/container** — `ytdlp-nodejs`/`youtube-dl-exec` are binary wrappers (not serverless-viable) and `youtubei.js` is an unofficial, easily-blocked engine.
