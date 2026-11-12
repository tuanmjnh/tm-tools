# Document Studio v5 Implementation Status & Completion Report

**Date**: 2026-11-09  
**Branch**: `feat/document-studio-v5`  
**Quality Verification Gates (All Passed)**:
- `pnpm test:unit`: 43/43 tests PASSED at the time of this report; 51/51 after the 2026-11-09 relay and tool-layout passes (§7)
- `pnpm check:hygiene`: CLEAN (no rogue `.js` emitted files)
- `pnpm typecheck`: PASSED (0 errors)
- `pnpm build` + `electron-builder --win`: PASSED (client, Nitro server, `win-unpacked` and NSIS installer)

---

## 1. Executive Summary & Phases Completed

| Phase | Description | Key Deliverables & Commit | Status |
| :--- | :--- | :--- | :--- |
| **P0** | Baseline Audit & Status Freeze | `docs/document-studio/V5-IMPLEMENTATION-STATUS.md` (`dbd1c7f`) | Completed |
| **P1** | Route & Component Foundation | 2-root Library (`/document-studio/library.vue`), backend library API, composable `useDocumentLibrary.ts`, dynamic tool page `[slug].vue`, operation configs (`2226092`) | Completed |
| **P2** | Format Registry & Conversion Matrix | 13 canonical formats typed in `#shared/types/document/formats.ts`, API endpoint `server/api/v1/documents/operations.get.ts`, conversion edges (`88d673c`) | Completed |
| **P3** | AI Extraction Job Pipeline | `AiExtractExecutor` integration, `AiExtractionConfig.vue` with model selection, preset management, output format checkboxes (`193d67e`) | Completed |
| **P4** | Activity Artifact Action Triad | Clear separation in `app/pages/document-studio/activity.vue`: OS Open vs safe in-app Preview vs Download (`e4e7ef5`) | Completed |
| **P5** | Legacy Migration Engine | Non-destructive dry-run migration engine `server/modules/document/legacy-migration.ts` with SHA-256 verification and API `server/api/v1/documents/migration.ts` (`249cdf1`) | Completed |
| **P6** | Cutover & Route Retirement | Route `/document-studio/tools/extract.vue`, updated `DOCUMENT_STUDIO_OPERATIONS`, updated TM Hub route seeds for `document_library` & `document_extract` (`07e8427`, Hub `6d27c3e`) | Completed |
| **P7** | Smart Output & Preview Enhancement | Direct file preview popup (`INLINE_MIME` expanded for PDF, images, JSON, txt, md), local OS opener endpoint (`/api/v1/documents/open-local`), output destination selection & change in `settings.vue` and `OperationPageShell.vue` (`split`, `merge`, `rasterize`, `images-to-pdf`, `convert`, `export`, `extract`) | Completed |

---

## 2. Route & Component Architecture

### Active Document Studio Routes (`app/pages/document-studio/`)
1. `/document-studio` — Central Dashboard & operations launcher.
2. `/document-studio/library` — 2-root Explorer (`input` / `output`) with folder breadcrumbs, creation, rename, and deletion.
3. `/document-studio/activity` — Job execution log with OS Open (`openLocalPath`), in-app safe preview (`INLINE_MIME`), and download.
4. `/document-studio/settings` — Storage runtime and execution preference management.
5. `/document-studio/tools/[slug]` — Dynamic runner for operations (`split`, `merge`, `images`, `images-to-pdf`, `convert`, `export`, `extract`).
6. `/document-studio/tools/extract` — Dedicated AI extraction runner with model dropdown, prompt preset manager, and multi-format export checkboxes.

### Legacy Compatibility
- Legacy pages (`/pdf/extract`, `/pdf/library`, etc.) are retained for non-breaking backward compatibility.
- TM Hub route seed (`scripts/seed/data.ts`) now points active menu entries to the v5 routes:
  - `document_library` -> `/document-studio/library`
  - `document_extract` -> `/document-studio/tools/extract`
  - Legacy `pdf_library` & `pdf_extract` marked `is_visible: false` in primary navigation.

---

## 3. Format Registry & AI Extraction Capabilities

- **13 Canonical Formats**: `pdf`, `docx`, `doc`, `xlsx`, `xls`, `csv`, `json`, `xml`, `png`, `jpg`, `webp`, `txt`, `zip`.
- **AI Extraction Options**:
  - Live model resolution via TM Hub AI Provider connections.
  - Preset guidance management (`description`, `sample`).
  - Output formats: `png`, `docx`, `xlsx`, `csv`, `json`, `xml`.
  - Progress reporting streamed to `OperationExecutionContext`.
  - Checkpoint and force-rerun support.

---

## 4. Verification Evidence

- `pnpm test`: 55/55 specs passing (latest run 2026-11-10).
- `pnpm check:hygiene`: Clean tree.
- `npx nuxt typecheck`: exit 0, 0 `error TS` across frontend and backend.
- `nuxt build` (via `pnpm build:electron`): successful production build (`node .output/server/index.mjs`), followed by the pdfjs runtime copy step.
- `electron-builder --win`: `release/win-unpacked` and `release/tm-tools-1.0.0-setup.exe` built; `app.asar` carries 0 link records; exe branding applied with asar integrity preserved.

---

## 5. Local Web & Electron Runtime Integration (P7 Upgrades)

- **Direct File Preview Window**:
  - `INLINE_MIME` extended to support: PDF, PNG, JPG, JPEG, WebP, GIF, SVG, TXT, Markdown, HTML, and JSON.
  - Sized popup window (`window.open(..., '_blank', 'popup=yes,width=...,height=...')`) provides responsive in-place preview for all browser-supported formats with `?inline=1`.
- **Local OS Opener**:
  - `server/api/v1/documents/open-local.post.ts`: Executes platform-native openers (`explorer.exe /select,"..."` or `start` on Windows, `open -R` on macOS, `xdg-open` on Linux) when running in Local/Desktop mode.
  - `app/utils/desktop.ts`: `openLocalPath` and `revealLocalPath` transparently invoke Electron IPC (`electronAPI.openPath` / `showItemInFolder`) in Electron, or fall back to `/api/v1/documents/open-local` on Local Web.
- **Output Folder Customization**:
  - Global default configurable in `/document-studio/settings` via path input or folder browser (`pickFolder` on Electron).
  - Per-operation live override in `OperationPageShell.vue` with "Đổi thư mục" button, enabling dynamic selection per execution across all tool pages (`split`, `merge`, `images`, `images-to-pdf`, `convert`, `export`, `extract`).
  - Runner and delivery adapters accept `customOutputDir` and dispatch artifacts directly to the requested folder.

---

## 6. Packaged Electron Hardening (2026-11-09)

Symptom report from `release/win-unpacked`: `settings` and `activity` rendered "Something went wrong", `tools/extract` never populated its model picker, the dashboard claimed "Local runtime" with no operations, and no page exposed an output-folder control. Each symptom traced to a distinct defect.

| # | Root cause | Fix |
| :--- | :--- | :--- |
| 1 | `dereference-links` was never run before packing, so Nitro's pnpm symlinks landed in `app.asar` as 38 link records; the packaged server could not resolve them | `pnpm dereference:output` in `build:electron`; verified 0 `LINK` records in the packed header |
| 2 | The Hub App Secret, JWT secrets, Supabase service role, Cloudinary, Firebase and Web Push keys had hard-coded fallbacks, so the build baked them into `.output` | Fallbacks removed; secrets resolve from the runtime environment only, and `server_config_secrets.spec.ts` / `secret_slots.spec.ts` lock the behaviour |
| 3 | A packaged install had no way to set its own Hub connection | `electron/tools/secret-slots.cjs` + `set-config` IPC write `userData/config.env` with safeStorage-encrypted secret slots; `/system/settings/hub` edits them (any signed-in user, not just root) |
| 4 | `aiRelay` and `hubStorage` read `useRuntimeConfig()`, a snapshot taken at server start, so a saved secret needed a restart | Both read the live `config.hub` getters (`process.env` per call), matching the auth middleware |
| 5 | Dashboard printed a "Local runtime" chip when capabilities had failed; extract rendered an empty select; settings reported "Job database: Not configured" on desktop | Chip hidden without capabilities; explicit "No model selected" empty state; local/electron report the filesystem job repository as connected |
| 6 | `electron-builder` writes exe resources with no retry; a ~2 s external lock after the asar-integrity write aborted the pack with `EBUSY` | `win.signAndEditExecutable: false` plus `electron/tools/brand-exe.cjs` in `afterPack`: same resedit branding through a retry loop, asserting the `INTEGRITY` resource survives |

### Secret leak report

The app-secret fingerprint `df514c9ced4d` was present in `.output/server/chunks/_/nitro.mjs` of the previous build; it is absent from the current `.output` (0 hits). Hard-coded fallbacks existed for the JWT access/refresh secrets, the Supabase service-role key, Cloudinary key/secret, the Firebase private key and the Web Push private key. **No secret was rotated** — the build path that baked them is closed, and rotation remains an operator action.

### Packaged-window verification

Run against `release/win-unpacked/TM Tools.exe --user-data-dir=.tmp-gate-data` with a synthetic Hub stub (identity + AI relay catalogue only) and a locally minted throwaway token. This is a harness result, not a real signed-in pass.

| Route | Result |
| :--- | :--- |
| `/document-studio` | 7 operation cards, "Desktop runtime", no exception, no "Something went wrong" |
| `/document-studio/settings` | Loads; output-folder `Select folder` / `Save` / `Reset`; "Job database Connected" |
| `/document-studio/activity` | Loads; filter chips, `Open output folder`, `Refresh` |
| `/document-studio/tools/extract` | Model picker shows `Gemini 2.0 Flash (Gate Gemini)`; `Change folder` present |
| `library`, `split`, `merge`, `images`, `images-to-pdf`, `convert`, `export` | All render; each exposes an output-folder control (`Change folder`, plus `Select folder` where a source folder is picked) |

Console noise limited to the stub's 404 on `/apps/:id/routes` and `/apps/:id/notifications`; a real Hub answers both.

### Open items

- A legitimately signed-in UI pass still requires a human sign-in; the harness cannot substitute for it.
- Electron `openPath` / `showItemInFolder` click-through was not exercised (buttons render, IPC not triggered).

---

## 7. Relay catalogue, preset editor and failure copy (2026-11-09)

Audit follow-up on chat and extraction provider/model handling for the packaged
Electron build. P5 of that audit (verify `NUXT_PUBLIC_HUB_URL` and the JWKS kid
before packaging) is **not** part of this pass.

| Item | Change |
| :--- | :--- |
| Shared filter | `server/utils/relayModels.ts` — one `isTextModel()` / `chatModelsFromCatalog()` used by both `/api/v1/chat/models` and `server/modules/pdf/extract/models.ts`; drops TTS/audio/live/transcribe/image/video/embedding/imagen/veo/AQA/lyria/nano-banana/diffusion/clip and keyless connections. `/` counts as a token boundary and compound ids (`embedqa`, `diffusiongemma`) are matched, so vendor-prefixed catalogue entries (`nvidia/embed-qa-4`, `google/diffusiongemma-*`) no longer reach either picker |
| Extract failure surface | `AiExtractionConfig.vue` renders a `UAlert` with the relay reason, a forced refresh (`?refresh=1`) and a link to `/system/settings/hub`; the empty state keeps the same actions |
| Preset CRUD | Create/edit modal over `GET/POST /api/v1/pdf/extract/presets`, delete through `BaseConfirmModal` + `DELETE .../presets/:id`; inline `PDF_PRESET_NAME_REQUIRED` / `PDF_PRESET_LIMIT`; selected preset description shown under the select |
| Preset actions | The three inline icon buttons were replaced by one `UDropdownMenu` (new / edit / delete) next to the preset select, so the actions are never clipped in the narrow configuration column |
| Tool page layout | `OperationPageShell` now declares `lg:grid-rows-[minmax(0,1fr)]` and hides grid overflow at `lg`, so both columns scroll independently instead of an auto row growing past the panel; the run button moved into a `shrink-0` action bar below the scrolling config area, together with progress and error, so it is always visible |
| Preset hint | `pdf.extract.cacheHint` now states that rows are reused per file/model/preset and a different pick starts a fresh run, matching the checkpoint fingerprint |
| Chat failure surface | `modelsError` alert and the no-models welcome state both link to `/system/settings/hub` alongside the existing AI Key Vault button |
| Error copy | `error.aiRelayNotConfigured` / `error.aiRelayUnauthorized` now describe device enrollment in Settings → Hub connection and no longer tell desktop users to set `NUXT_HUB_APP_SECRET` (en + vi) |

### Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| Unit | `pnpm test` | 52/52 specs passed, exit 0 (re-run after the catalogue filter widening and the staged-source fix) |
| New specs | `relay_model_filter.spec.ts`, `pdf_presets.spec.ts`, `ai_relay_ui.spec.ts`, `document_tool_layout.spec.ts`, `pdf_extract_staged_source.spec.ts` | 6/6, 4/4, 8/8, 4/4, 4/4 |
| Typecheck | `npx nuxt typecheck` | exit 0, 0 `error TS` |
| Lint | `npx eslint` on every touched file, after the last `.nuxt/eslint.config.mjs` regeneration (16:54 local, unchanged by the final build) | exit 0 |
| Build | `npx nuxt build` | exit 0, all SFC templates compiled (re-run after the filter change and the staged-source fix, 2m31s) |

`ai_relay_ui.spec.ts` locks the contracts by reading the sources: the chat route
must call `chatModelsFromCatalog`, the extract config must surface
`modelsError` / `getErrorMessage` / `/system/settings/hub` / `refresh=1` and use
the preset endpoints, `chat.vue` must link `/system/settings/hub`, and the en/vi
relay strings must not mention `NUXT_HUB_APP_SECRET`. `document_tool_layout.spec.ts`
locks the shell layout (explicit 1fr grid row, mobile scroll, run action outside
the scrolling config area) and the single preset dropdown.
`relay_model_filter.spec.ts` pins the vendor-prefixed and compound non-chat ids
(`nvidia/embed-qa-4`, `nvidia/nv-embedqa-*`, `nvidia/nvclip`, `models/lyria-*`,
`models/gemini-nano-banana-*`, `google/diffusiongemma-*`, `transcribe`,
`OmniVoice`, `ai-synthetic-video-detector`) that the live local catalogue
actually serves.

Formatting note: `chat.vue` and `AiExtractionConfig.vue` already carried 243
pre-existing `vue/max-attributes-per-line` problems against the regenerated
ESLint config before this pass; `eslint --fix` reflowed attributes in those two
files only. No behaviour changed and the full suite was re-run afterwards.

### Signed-in local pass (2026-11-09)

Run in Chrome DevTools against the local stack — tm-hub `http://localhost:4000`,
tm-tools `http://localhost:4002` — with a session issued by the local login form.
No credential was read or typed by the harness; the browser's own autofill
submitted the form.

| Check | Observed |
| :--- | :--- |
| Extract route | `/document-studio/tools/extract` loads signed in; model select live from the relay catalogue (`Gemini 3.5 Flash (google_ai-main)`); no `modelsError` |
| Preset create | Dropdown → New → fill name/description → Save: `POST /api/v1/pdf/extract/presets` 200, list refreshed `GET` 200, new preset auto-selected and its description rendered under the select |
| Preset edit | Dropdown → Edit opens prefilled name + description; Save: `POST` 200, select value became `Verify gate preset (edited)` |
| Preset delete | Dropdown → Delete → confirm ("Jobs that already used it keep their output."): `DELETE .../presets/:id` 200, selection fell back to `Default rules`; probe preset removed, no test data left |
| Dropdown clipping | Menu teleports above the card and renders in full; New enabled, Edit/Delete disabled while no user preset is selected, enabled after create |
| Run action bar | Disabled at 0 files; after staging one PDF (`Browse files`) it became enabled and stayed outside the scrolling card. Measured at 1920×953: grid `overflow-y:hidden`, row `800px`, config scroller `scrollHeight 789 / clientHeight 729`, run button `top 883 bottom 915`, inside the scroller = false. At 1280×700 and 1280×560 the button stayed visible (`490–522`) while the right column stayed scrollable |
| Column scroll | Scrolling the right column to the end revealed the last format card and the cache checkbox with the run bar unmoved |
| Chat route | `/chat` loads signed in with a live model (`GLM-5.3-Flash`, `Amd_radeon`); `/api/v1/chat/models` 200 |
| Filter fix | The live catalogue exposed `nvidia/embed-qa-4`, `nvidia/nv-embedqa-*`, `nvidia/nvclip`, `models/lyria-*`, `models/gemini-nano-banana-*`, `google/diffusiongemma-*`, `models/gemini-3.5-transcribe`, `OmniVoice`, `nvidia/ai-synthetic-video-detector`. After widening the shared filter, chat and extract both return **116** entries (from 130) and **zero** ids match the non-text rule |
| Console | No runtime errors, no Vue warnings, no failed requests on either page; one pre-existing DevTools a11y issue ("No label associated with a form field") from the hidden file input in the shared shell |

### Real extraction run and staged-source fix (2026-11-09)

The first live run exposed a pipeline bug: `POST .../start` returned **503
`DOCUMENT_STORAGE_UNAVAILABLE`** after 7 ms. The manifest showed the job failed
before any page was split, and `.data/pdf/input` was empty.

Root cause: `AiExtractExecutor` called `startExtraction(input.safeName, …)`, and
`runJob` resolved that name through `anySourcePath()`, which only reads
`pdfDirs.input`. A document job stages its upload inside the job workspace
(`…/.system/jobs/<jobId>/input/<inputId>/<name>`) and deliberately never copies it
into the input library, so `sourcePath()` threw a plain `PDF_SOURCE_NOT_FOUND`,
which `startDocumentJob` normalized to `DOCUMENT_STORAGE_UNAVAILABLE`. The
normalization also hid the real code from the HTTP body.

Fix:

- `server/modules/pdf/extract/jobs.ts` — new exported `resolveExtractSource(source,
  stagedSource)` plus an optional `PdfExtractStagedSource` argument on
  `startExtraction`. The logical `source` name still drives products and
  checkpoints; only the bytes come from the staged path. `runJob` uses the same
  resolver, so the create-time check and the run agree. A missing staged file
  still throws `PDF_SOURCE_NOT_FOUND`.
- `server/modules/document/executors.ts` — the AI-extract executor passes
  `{ path: input.stagedPath, kind: … }`. The library flow is unchanged: callers
  without a staged source fall through to `anySourcePath()`.
- `tests/unit/pdf_extract_staged_source.spec.ts` — RED first (`resolveExtractSource
  is not a function`), now 4/4: job-staged file, library fallback, unknown bare
  name, and missing staged bytes.

Live result (Chrome DevTools, same signed-in session, tm-hub local relay):

| Step | Observed |
| :--- | :--- |
| Upload + config | `price-list-probe.pdf` (1.9 KB, 5 hardware rows) staged as `1 files`; model `Gemini 3.5 Flash (google_ai-main)`; CSV selected; cache ignored |
| Requests | `POST /api/v1/documents/jobs` 200, `POST .../inputs` 200, `POST .../start` **200** (was 503) |
| Job `82701bda-cb24-4f2c-8869-13f705ee4418` | `status: completed`, 1/1 units, 0 failed, 23 s wall time, 1 artifact |
| Artifact | `price-list-probe_products.csv`, 1974 bytes, published to `.data/pdf/output/` and job output |
| Content | 5 rows with the source SKUs and prices (`HW-1001` 1 890 000 … `HW-1005` 120 000), 25 normalized columns, UTF-8 BOM |
| UI | Step moved to **Save**, `RESULTS (1)` row with `Open output folder`, `Preview`, `Download`, `More actions` |

`Preview` for `text/csv` resolves through `openLocalPath()` (OS opener), so it is
inert in a plain browser and only testable in Electron. All probe artifacts
(output CSV, products CSV, split pages, checkpoints, temp PDF) were removed after
verification; the completed job manifest remains until retention cleanup.

Known gap, not changed here: `startDocumentJob` normalizes every non-`DocumentError`
to `DOCUMENT_STORAGE_UNAVAILABLE`, so an executor-side plain error reads as a
retryable storage failure and its real code never reaches the client. That is why
this bug surfaced as a 503 instead of `PDF_SOURCE_NOT_FOUND`. Adding a generic
processing-failure code is a contract change, so it is recorded for the next
taxonomy revision rather than bundled into this fix.

Not exercised: the `modelsError` / no-models states (need a broken relay) and the
Electron window. Those remain contract-locked by `ai_relay_ui.spec.ts` and
`relay_model_filter.spec.ts` only.

---

## 8. Packaged rasterize failure — pdfjs runtime not traced (2026-11-09)

The packaged build answered every **PDF to images** run with the generic banner
"Storage is unavailable right now. Try again." Five job manifests
(`d455f49a…`, `81ec1432…`, `1ebbfc9c…`, `852b9729…`, `4c50cccb…`) in
`%APPDATA%\tm-tools\pdf\.system\jobs` all showed `operationId: pdf.rasterize`,
`status: failed`, `errorCode: DOCUMENT_STORAGE_UNAVAILABLE` and a 9 ms lifetime
— the job died before rendering a single page.

Root cause: `pdf-to-img` drives `pdfjs-dist` in its "fake worker" mode. The
statically imported `legacy/build/pdf.mjs` dynamically imports
`legacy/build/pdf.worker.mjs` from its own directory and `require`s
`@napi-rs/canvas` for the raster surface. Nitro's file tracer only follows
static imports, so `.output/server/node_modules/pdf-to-img/node_modules/pdfjs-dist`
contained `pdf.mjs` alone: no worker, no `standard_fonts` / `cmaps` / `wasm` /
`iccs` / `image_decoders`, and no canvas package. Running the built tree's own
`pdf-to-img` reproduced the executor failure in isolation with
`Setting up fake worker failed: Cannot find module ...pdf.worker.mjs`. The
runner then normalized that plain error to `DOCUMENT_STORAGE_UNAVAILABLE`
(see the §7 known gap), which is why the UI spoke about storage.

Fix: `electron/tools/copy-pdf-runtime.cjs` resolves the runtime from the
project tree (`pdf-to-img` → `pdfjs-dist`, `@napi-rs/canvas` optional platform
packages) and copies it into `.output/server/node_modules` after `nuxt build`:
the legacy worker, the five pdfjs data directories, and
`@napi-rs/canvas` + `@napi-rs/canvas-win32-x64-msvc` (`skia.win32-x64-msvc.node`).
It is exposed as `pnpm copy:pdf-runtime` and wired into `build:electron` ahead of
`dereference:output`, so the copies are real directories in the archive. The
generic `build` script stays deploy-agnostic: a Vercel build has no
`.output/server` to patch, and the script refuses to run without it rather than
package a broken tree.

| Gate | Command | Result |
| :--- | :--- | :--- |
| New specs | `pnpm test` → `pdf_runtime_copy.spec.ts` | 3/3: resolver finds the legacy worker + data dirs + canvas platform binary; copy places them under `server/node_modules`; a missing `.output` throws |
| Unit suite | `pnpm test` | 53/53 specs passed, exit 0 |
| Typecheck | `npx nuxt typecheck` | exit 0, 0 `error TS` (19:00 local) |
| Lint | `npx eslint electron/tools/copy-pdf-runtime.cjs tests/unit/pdf_runtime_copy.spec.ts`, after the 18:59 regeneration of `.nuxt/eslint.config.mjs` | exit 0 |
| Build | `pnpm build:electron` | exit 0; 38 links replaced / 19 targets removed; `release/tm-tools-1.0.0-setup.exe` 466 613 001 bytes |
| Built tree | `.output`, then `app.asar.unpacked/.output` | worker, five data dirs, `@napi-rs/canvas` and the `.node` binary present in both |

Packaged end-to-end run (`release/win-unpacked/TM Tools.exe`, signed in, tm-hub
local relay, no harness stub):

| Step | Observed |
| :--- | :--- |
| Tool page | `/document-studio/tools/images` reached from the Document Studio sidebar; `Browse files` opened the native picker at the folder holding the failing input |
| Input + run | `20261109044915416.pdf` (439 138 bytes) staged as `1 files`; `Run` enabled |
| Job `cc6dcfcd-8d91-4af1-887c-15f63f0b5bd9` | `status: completed`, runtime `electron`, 1/1 units, 0 failed, 944 ms (was 9 ms / failed) |
| Artifact | `20261109044915416/page_0001.png`, 767 003 bytes on disk, real PNG header, 1190 × 1683 RGBA |
| UI | Step moved to **Save**, `RESULTS (1)` with `Open output folder` / `Preview` / `Download` / `More actions`; no storage banner |

Pre-existing noise, unchanged by this fix: pdfjs logs
`Unable to load font data at: standard_fonts/FoxitSerif.pfb` and
`LiberationSans-Bold.ttf` in dev and packaged runs alike. The warning does not
change output: dev, the repaired `.output` and the packaged tree each rendered
`private/pdf/page_0005.pdf` at scale 2 to exactly 541 609 bytes, so the fallback
fonts resolve and the warning is cosmetic.

Still open: the §7 normalization means any future executor exception will again
present as a retryable storage failure. Logging the cause to `logs/app.log`
before normalizing (without changing the public error contract) is the
suggested next step and was not bundled into this fix.

---

## 9. Artifact preview and where extraction presets live (2026-11-09)

Two packaged-only reports.

### Preview forced a download

`electron/main.cjs` turned every same-origin `/api/` popup into
`webContents.downloadURL`, and the artifact preview route is
`/api/v1/documents/jobs/:jobId/artifacts/:artifactId/download?inline=1` — so
"Preview" always saved the file. The route itself was correct: it answers
`content-disposition: inline` when `inline=1` and only for inline-renderable
MIME types.

Fix: the decision moved to `electron/tools/window-open.cjs`
(`decideWindowOpen`), which returns one of `external` / `download` / `popup` /
`allow`. `?inline=1` (or `=true`) on a same-origin `/api/` link returns `popup`
with `pdfPlugins: true`, which enables Electron's built-in PDF viewer; a plain
API link still downloads. An unknown caller origin (destroyed window) is
treated as "maybe same origin" and never forced into a download. OAuth hosts
and external links keep their previous behaviour.

`tests/unit/window_open.spec.ts` — 8 checks written RED first (module missing),
now green: inline preview vs. plain download, `inline=0`, OAuth popup, external
browser, internal route, unknown origin, unparsable URL.

### Presets "missing" in the packaged build

Not a code defect: the two runtimes keep separate data roots. Presets are a
plain JSON file, `join(pdfDirs.root, 'presets.json')`
(`server/modules/pdf/extract/presets.ts`), and `pdfDirs.root` comes from
`config.pdf.dir` = `PDF_DATA_DIR` or `TOOLS_DATA_DIR/pdf`:

| Runtime | Data root | Presets file |
| :--- | :--- | :--- |
| `pnpm dev` / local web | `<project>/.data` | `D:\Applications\tm-tools\.data\pdf\presets.json` |
| Packaged Electron | Electron `userData` (`electron/main.cjs` sets `TOOLS_DATA_DIR`) | `%APPDATA%\tm-tools\pdf\presets.json` |

The packaged file did not exist, so the picker only offered "Default rules".
The route and the UI were fine — a packaged install simply starts with an empty
library. Carrying the existing preset across is a file copy into the packaged
root (only when that file is absent; the dev file is left untouched):

```powershell
Copy-Item 'D:\Applications\tm-tools\.data\pdf\presets.json' `
  "$env:APPDATA\tm-tools\pdf\presets.json"
```

Verified in the packaged window: after the copy, the Extraction presets select
lists "Ghế lãnh đạo — Hòa Phát (The One)" and selecting it renders its
description. Presets created inside the packaged app already persist to the
`%APPDATA%` file across restarts.

### Evidence

| Gate | Result |
| :--- | :--- |
| Unit | 54/54 specs passed (`window_open.spec.ts` 8/8, RED first) |
| Typecheck | `nuxt typecheck` exit 0, 0 `error TS` |
| Lint | exit 0 on `electron/main.cjs`, `electron/tools/window-open.cjs`, `tests/unit/window_open.spec.ts`, after config regeneration |
| Build | `pnpm build:electron` exit 0, installer rebuilt |
| Packaged preview (PNG) | PDF to images → 1 artifact → **Preview** opened a window titled `download (1190×1683)` rendering the PNG; no file appeared in `~/Downloads` or `~/AppData/Roaming/tm-tools/downloads` |
| Packaged preview (PDF) | Split PDF → 1 artifact → **Preview** opened Chromium's PDF viewer (`mhjfbmdgcfjbbpaeojofohoefgiehjai`) with page 1/1 at 96%, thumbnail bar and Download/Print — i.e. `plugins: true` took effect |
| Packaged presets | Preset select lists the imported preset and shows its description |

---

## 10. Preset JSON export / import (2026-11-10)

Presets were trapped in one machine's `presets.json`, so moving rules between
`pnpm dev` and the packaged app meant a manual file copy (§9). Both entry points
now speak JSON.

| Surface | Action | Behaviour |
| :--- | :--- | :--- |
| Preset dropdown (`UDropdownMenu`) | **Export preset** | Downloads only the currently selected preset, disabled while no user preset is selected; there is no export-all action |
| Preset dropdown | **Import presets** | Merges every entry in the file, then selects the first newly created preset |
| Add modal | **Import JSON** | Loads the first preset in the file into the form for review; nothing is saved until **Save preset** |
| Edit modal | **Export JSON** | Downloads the preset currently in the form, filename derived from its name |

The add/edit modal lives in its own component,
`app/components/document-studio/operations/configs/ExtractPresetModal.vue`
(props `open` / `preset`, emits `update:open` / `saved`); the host
`AiExtractionConfig.vue` keeps the select, dropdown, delete confirm and list
import. The modal shows **Import** only when adding (`v-if="!isEditing"`) and
**Export** only when editing (`v-else`), so a new preset is never offered an
export of nothing and an edit never offers an import that would clobber the form.

`shared/utils/presetTransfer.ts` owns the format so the browser bundle and the
specs share one implementation:

- **Accepted shapes** — a preset object, a bare array (exactly what the server
  writes to `presets.json`, so an exported file re-imports unchanged), or
  `{ "version": 1, "exportedAt": …, "presets": [ … ] }` (what this UI exports).
- **Normalization** — `\\r\\n` → `\\n`, trim, then clamp to the server limits
  (name 80, description 6000, sample 16000). Entries with no usable name are
  skipped and counted.
- **Merge** — an incoming `id` that already exists on this device is skipped,
  never overwritten; ids the file omits stay absent so the server mints one;
  the plan stops at `MAX_PRESETS` (40) and reports the overflow.
- **File name** — `presetFileName()` NFD-strips and slugifies, so
  `Ghế lãnh đạo — Hòa Phát (The One)` becomes
  `extraction-preset-ghe-lanh-dao-hoa-phat-the-one.json`.

Failures are user-facing: `presetImportNotJson`, `presetImportEmpty` and
`presetImportBadShape` (en + vi; the copy avoids literal braces because
`@intlify` reads them as interpolation — the first build failed on exactly that).

### Evidence

| Gate | Result |
| :--- | :--- |
| Unit (feature) | `preset_transfer.spec.ts` 11/11 — RED first (`Cannot find module ... presetTransfer`), then GREEN; the last case drives the real `savePreset` / `listPresets` store and proves a second import of the same ids adds nothing and leaves the existing preset's name untouched |
| Unit (UI contract) | `ai_relay_ui.spec.ts` 12/12 — locks the dedicated `ExtractPresetModal`, the conditional new→import / edit→export surfaces, dropdown export-selected (never all), one `.json` file input per surface, and that the import path performs no `DELETE` |
| Unit suite | `pnpm test` → **55/55 specs passed**, exit 0 |
| Typecheck | `npx nuxt typecheck` exit 0, 0 `error TS` |
| Lint | exit 0 on `ExtractPresetModal.vue`, `AiExtractionConfig.vue`, `app/shared/utils/errors.ts`, `shared/utils/presetTransfer.ts`, after `.nuxt/eslint.config.mjs` regeneration (26 449 bytes, 10:15); one `eslint --fix` pass reflowed the SFC templates, then re-linted clean |
| Build | `pnpm build:electron` exit 0 → `release/win-unpacked/TM Tools.exe` (10:26) and `release/tm-tools-1.0.0-setup.exe` (10:28, 466 626 113 bytes); 38 links dereferenced, exe branding integrity preserved |
| Packaged bundle | `.output/public/_nuxt` carries `extraction-preset-` (single-preset export) and **zero** hits for `extraction-presets.json` or `presetExportAll` — export-all is gone from the shipped client |
| Interactive packaged pass | **Not performed** — no legitimately issued session was available; signing in with repository seed credentials is out of bounds. Button-level behaviour rests on the specs above, not on a click-through |

---

## 11. Legacy `pdf` component retirement (2026-11-10)

After the v5 cutover the old `app/components/pdf/` tree was dead weight: a
tree-wide search across `app/`, `shared/`, `server/`, `tests/` and `electron/`
found no live consumer. `app/pages/pdf/` had already been removed, and the only
`<Pdf…>` tags left were the components referencing each other. Nothing needed
moving into `document-studio`, so the whole folder was deleted.

| Removed | Reason |
| :--- | :--- |
| `app/components/pdf/` (17 SFCs: `ConfirmAction`, `DocumentDataFlowNote`, `ExportFormatPicker`, `FileActions`, `FileBrowser`, `FileRow`, `FolderModal`, `FolderRow`, `FolderTree`, `OperationResult`, `PresetSampleEditor`, `PreviewFile`, `PreviewTable`, `PreviewText`, `RenameModal`, `TrashModal`, `WorkspaceShell`) | Orphans — no page or `document-studio` component imports or tags them |
| `app/composables/usePdfMenus.ts` | Consumed only by `pdf/FileRow`, `pdf/FileActions`, `pdf/FolderRow`; dead once the folder is gone |
| `pdf_contract.spec.ts` → "desktop actions in the PDF workspaces" block | Pinned the deleted `pdf/OperationResult.vue`; removed with the component |

Kept: `usePdfStudio` (live in `app/pages/index.vue`), `usePdfExplorer` and
`usePdfSelection` (composables outside the component-cleanup scope; the
"lazy explorer reload" contract still reads `usePdfExplorer`). The shared
`getPresetErrorMessage` helper now centralizes the `PDF_PRESET_*` error copy for
both the modal and the host.

### Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| Typecheck | `npx nuxt typecheck` | exit 0, 0 `error TS` (config regenerated 10:15) |
| Lint | `npx eslint` on the four touched source files, after regeneration | exit 0 |
| Unit suite | `pnpm test` | **55/55 specs passed**, exit 0 (`pdf_contract` green without the removed block) |
| Build | `pnpm build:electron` | exit 0; installer rebuilt 10:28 |
| Packaged bundle | grep `.output/public/_nuxt` | 0 hits for `PdfWorkspaceShell` / `PdfFileBrowser` / `PdfOperationResult` — the deleted components are absent from the shipped client |

---

## 12. Batch processing — multi-file selection, concurrency and progress (2026-11-12)

Every Document Studio tool can now take many files at once and run them as a
managed batch: sequential or parallel (1–10 workers, default 1), a short rest
between launch cycles, per-file progress, pause/resume/stop, retry, and a
`partial` finish when any item fails. The server pipeline is unchanged — the
batch is a **client-side async pool** over N independent single-input jobs
(Approach A from the design spec), so local-web, Electron and cloud all share it.

### Architecture

| Layer | File | Responsibility |
| :--- | :--- | :--- |
| Pure scheduling core | `app/utils/batchPool.ts` | Framework-agnostic `runBatchPool(items, opts)`: cooperative launch up to `concurrency()`, retry-by-requeue under `maxRetry()`, `pauseMs()` rest between launch cycles, `isPaused()`/`isStopping()` gates, injectable `delay`/`tickMs` for tests. No Vue import. |
| Shared single-job helper | `app/composables/useDocumentRun.ts` → `runSingleDocumentJob` | Ref-free create → stage → start lifecycle, reused verbatim by both the single-job wrapper and the batch pool. `AbortSignal` threaded through every API call; one idempotency key per attempt so a retried POST returns the same draft. |
| Reactive batch state | `app/composables/useDocumentBatch.ts` | Module-global per-`operationId` state (survives navigation). Keeps `File` blobs in a plain `Map` outside reactivity, one `AbortController` per item, a 1 s job-progress poll cleared on finalize, and a `BatchViewModel` snapshot for the shell. |
| Run funnel | `app/composables/useDocumentOperationPage.ts` | `isPerFileBatch = definition.batch?.mode === 'per-file'`; per-file runs route to `batch.start(...)`, combine ops keep the single `session.run(...)`. |
| Panel UI | `app/components/document-studio/BatchPanel.vue` | Concurrency / pause / max-retry inputs, per-item status icon + `UBadge` + `UProgress`, capped `max-h-64` scroll, retry button. Token-only motion (`animate-pulse` on the running icon); concurrency locked to 1 with a hint when `concurrencyCap === 1`. |
| Shell + page wiring | `OperationPageShell.vue`, `tools/[slug].vue` | Dual-mode action bar (batch start/pause/resume/stop vs single run); real `overallProgress` replaces the old fake `uploading ? 15 : 60`; batch artifacts surfaced as results with per-job archive guard and `removeArtifact` routing. |

### Operation contract (`server/modules/document/operations.ts`)

| Operation | Input | Batch | Concurrency cap |
| :--- | :--- | :--- | :--- |
| `pdf.split` | single-file | per-file, maxFiles 50 | 10 |
| `pdf.rasterize` | single-file | per-file, maxFiles 50 | 10 |
| `document.convert-to-pdf` | single-file | per-file, maxFiles 50 | 10 |
| `pdf.export` | single-file | per-file, maxFiles 50 | 10 |
| `document.ai-extract` | single-file | per-file, maxFiles 50 | **1 (locked)** |
| `pdf.merge` | multi-file (2–50, ordered) | — combine N→1 | n/a |
| `pdf.images-to-pdf` | multi-file (1–200, ordered) | — combine N→1 | n/a |

Defaults: concurrency 1, pause 300 ms, maxRetry 0 (UI cap 5). `concurrencyCap =
definition.batch?.maxConcurrency ?? 10`; AI-extract is forced sequential because
the relay extractor is not safe to parallelize per device.

### `useDocumentRun` optimization

No new algorithm was added to `useDocumentRun`. The optimization was to **extract**
its job lifecycle into the ref-free `runSingleDocumentJob` helper that the pool
reuses, and add `AbortSignal` + per-attempt idempotency so parallel runs can be
cancelled and retried safely. Concurrency/pause/retry scheduling lives in the pure
pool; putting parallelism inside `useDocumentRun` would duplicate the pool and
break the single-responsibility split. The single-job path keeps its inline
fast-path (ephemeral cloud) and signed-plan direct upload (cloud storage).

### Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| Typecheck | `npx nuxt typecheck` | exit 0, 0 `error TS`; `.nuxt/eslint.config.mjs` regenerated 2026-11-12 11:58:50 (27488 bytes) |
| Lint | `npx eslint` on 16 touched files, **after** regeneration | exit 0; config mtime unchanged on re-lint (style-only fixes committed `9ec05e9`, assertions untouched) |
| Unit suite | `pnpm test` | **65/65 specs passed**, exit 0 |
| Batch core (real async) | `document_batch_pool.spec.ts` | 5/5 — concurrency cap never exceeded, failure→partial counts, retry-then-succeed, stop cancels waiting, paused launches nothing |
| Batch composable / funnel | `document_batch_composable.spec.ts` | 8/8 — wraps `runBatchPool`, blobs outside reactivity, pause/resume/stop/retry, job poll + `clearInterval`, finalize→`partial`, per-file funnel |
| Batch UI / i18n / shell | `document_batch_ui.spec.ts` | 12/12 — en+vi keys, concurrency cap + extract lock, per-item badge/progress, retry, capped scroll, token-only motion, shell mounts panel + real progress + start/pause/resume/stop |
| Build | `pnpm build:electron` | exit 0; `release/tm-tools-1.0.1-setup.exe` (466,661,972 bytes, 12:20) + `win-unpacked`; code signing skipped (no cert configured) |
| Dev runtime compile | `nuxt dev --port 4002`, `curl /_nuxt/@fs/…` | Ready 27.2 s; `[vue-tsc] Found 0 errors`; all 7 batch modules → HTTP 200 `text/javascript`, 0 transform errors; compiled markers present (`concurrencyCap`, `extractLocked`, `batchViewModel`, `resultArtifacts`, `runBatchPool`) |
| Auth intact | navigate `/document-studio/tools/split` | redirects to `/login?redirect=…` (global middleware unchanged) |

### Live signed-in golden path — BLOCKED (no legitimate session)

The rendered batch run (3-PDF split at concurrency 2 observing per-file progress
and `{done}/{total}`, an invalid file → `partial`, extract concurrency locked to 1)
was **not** exercised. `auth.global.ts` protects every Document Studio route; the
connected Chrome held no `:4002` session and native autofill did not populate the
local login form. No credential was read or typed, auth was not disabled, and no
signed-in pass is claimed. Probe fixtures (3 valid PDFs + 1 corrupt) were generated
under `.probe-batch/` and removed; the dev server was stopped after verification.

Functionality is covered by the real-async pool spec, the composable/funnel/UI
contract specs, and clean dev-runtime compilation of all batch modules. To capture
the live UI evidence, sign in to `:4002` in the browser and re-run the golden path;
the tm-hub local stack on `:4000` is up.

---

## 13. Fix: per-file tools ran the batch invisibly (2026-11-12)

**Symptom (live report).** On `extract`, clicking Run cleared the selected-file
list, showed no progress, produced no visible result and no notification. The same
held for `split`, `convert`, `export` and `images` (rasterize).

**Root cause — route shadowing.** Every friendly route in
`DOCUMENT_STUDIO_OPERATIONS` (`/tools/extract`, `/split`, `/images`, `/convert`,
`/export`, `/merge`, `/images-to-pdf`) resolves to a **static** page file. Nuxt
gives static routes precedence over the dynamic `tools/[slug].vue`, so `[slug].vue`
is unreachable dead code. Task 7 (§12) wired batch mode into `[slug].vue` and the
shell only — never the static pages that actually render. Those pages passed no
`:batch` prop and bound `:running`/`:artifacts` to the single-job `session`.

The funnel `useDocumentOperationPage.run()` routes every `per-file` operation to
`batch.start(...)` followed by `selection.clear()`. The shell renders the batch
panel, progress and pool controls only `v-if="batch"`. With no `:batch` prop the
batch ran in module-global `useDocumentBatch` state the page never displayed: the
list cleared, jobs executed invisibly, and `session.artifacts` stayed empty.
`convert`/`export`/`images` also omitted `:multiple`, so multi-select was disabled
there (shell default `multiple: false`).

**Why the §12 gate was falsely green.** `document_batch_ui.spec.ts` asserted the
page wiring against `tools/[slug].vue` — the dead page. The contract tested a file
that never renders, so it passed while every live page was unwired.

**Fix.**

| File | Change |
| :--- | :--- |
| `app/composables/useDocumentOperationPage.ts` | Added `batchViewModel` (`isPerFileBatch ? batch.viewModel : null`), `resultArtifacts` (`isPerFileBatch ? batch.artifacts : session.artifacts`) and a `removeArtifact(id)` dispatcher; exposed all three. Single source of truth for batch-vs-session routing. |
| `tools/extract.vue`, `split.vue`, `convert.vue`, `export.vue`, `images.vue` | Pass `:batch="page.batchViewModel.value"`, `:artifacts="page.resultArtifacts.value"`, `:multiple="page.multiple.value"`, `@deleted="page.removeArtifact"` and the eight pool events (`batch-start`→run handler, pause/resume/stop/retry + concurrency/pause-ms/max-retry→`page.batch.*`). |
| `tools/[slug].vue` | Refactored to the same funnel helpers (removed local duplicates) so the fallback stays consistent. |
| `tests/unit/document_batch_ui.spec.ts` | Repointed the page contract to the five **live** per-file pages and added funnel-helper guards. The existing `[slug].vue` assertion is kept, not weakened. |

Combine ops (`merge`, `images-to-pdf`) were already correct (`isPerFileBatch`
false → `session.run`, `multiple` set) and are unchanged.

### Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| Contract RED | `node --import tsx --test document_batch_ui.spec.ts` (before fix) | 45 tests, **31 fail** — missing `:batch`, pool controls, `:multiple`, funnel helpers |
| Contract GREEN | same, after fix | **45/45 pass**, exit 0 |
| Typecheck | `npx nuxt typecheck` | exit 0, 0 `error TS`; config regenerated 12:50:07 (27488 bytes) |
| Lint | `npx eslint` on 8 touched files, after regen | exit 0; `[slug].vue` confirmed processed via `--format json` (1 file, 0/0) — the bracket path needs the `[[]slug]` literal-bracket glob |
| Unit suite | `pnpm test` | **65/65 specs passed**, exit 0 |
| Dev runtime compile | running `:4002`, `curl -g /_nuxt/@fs/…` | all five pages → HTTP 200 `text/javascript` with `batchViewModel`, `resultArtifacts`, `onBatchStart` markers; funnel exposes helpers; HMR applied, 0 transform errors |

**Live click-through.** Not recorded by the agent: the user was actively testing in
their own signed-in browser, and driving it would create server-side jobs/output
during their session. The fix is applied via HMR on the running `:4002`; reload
`extract` and Run to confirm the batch panel, per-file progress and results now
appear. No signed-in UI pass is claimed beyond the runtime-compile evidence above.



