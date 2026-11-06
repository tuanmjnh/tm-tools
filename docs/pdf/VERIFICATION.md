# PDF module verification

Evidence for the profile relocation (phase 1) and the PDF workspace (phase 2),
captured on 2026-11-02. The TMCut audit gate doc moved to
`docs/archive/2026-10-31-v1-pre-tmcut-extraction/`, so PDF evidence lives here.

## Phase 1 — profile relocation (2026-11-02) — SUPERSEDED by phase 4

Browser profiles were briefly moved from top-level `/profiles/*` into Settings.
That move was reverted; see phase 4. The original record is kept verbatim so the
revert is auditable:

- Deleted `app/pages/profiles/{index,groups,proxies}.vue`.
- Added `app/pages/system/settings.vue` (BasePage + BaseSectionNav → `NuxtPage`)
  with tabs Appearance `/system/settings`, System `/system/settings/system`,
  Profiles `/system/settings/profiles`, Groups `…/profiles/groups`, Proxies
  `…/profiles/proxies`.
- tm-hub seed: removed `group_profiles`, reparented `profiles`, `profiles_groups`,
  `profiles_proxies` under `system_settings` (sort 721–723).

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` (re-run at phase-3 close) | PASS | exit 0, 0 × `error TS` |
| 2 Lint | `npx eslint` on `system/settings.vue` + 5 leaf pages | PASS | exit 0, 0 problems |
| 4 Live | 5 Settings tabs on :4002 | PASS | only the allowed `<Suspense>` info |

## Phase 2 — PDF workspace (2026-11-02)

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`; `.nuxt/eslint.config.mjs` regenerated 14:57 |
| 2 Lint | `npx eslint` on the 5 PDF pages, `pdfStudio.ts`, `usePdfStudio.ts`, `server/modules/pdf`, `server/api/v1/pdf`, both specs | PASS | exit 0, 0 errors (2 warnings: JSON locales not matched by ESLint) |
| 3 Tests | `npx tsx tests/unit/run-all.mts` | PASS | 12/12 specs, exit 0 |
| 4 Live | `/pdf`, `/pdf/library`, `/pdf/convert`, `/pdf/extract` on :4002 | PASS | only the allowed `<Suspense>` info; empty states resolve to `pdf.convert.noImages*` / `noOutputs*` |
| 5 Docs | scratch removed, this file added | PASS | `.data/pdf` back to empty subfolders |

### Backend surface

- `server/modules/pdf/` — `library`, `security`, `paths`, `document`, `extract/{jobs,normalize,provider,export}`.
- `server/api/v1/pdf/` — library, upload, split, merge, rasterize, images→PDF, products, merged deletes, extraction jobs.
- Verified end to end without AI: upload → split (3 pages) → merge (3 pages) → rasterize (3 PNG) → images→PDF (3 pages) → cleanup, all HTTP 200.
- Extraction without a configured key fails fast: job status `failed`, `PDF_AI_KEY_MISSING`, header-only products files.

### Not proven

- Real Gemini extraction: no API key is configured in this environment and key handling belongs to the owner.
- Real browser file-picker upload: exercised the equivalent multipart request through in-page `fetch`.
- Production build (`nuxi build`) and mobile layout below ~884 px.

## Phase 3 — design language + centralized config (2026-11-02)

Ported the tm-data-manager linear flat glass look and removed hardcoded
configuration from pages and components.

- `app/assets/css/glass.css` — token layer imported right after
  `@import "@nuxt/ui"`: `--ui-radius: 0.25rem`, `--tm-ambient`,
  `--tm-panel-alpha`, plus `.tm-backdrop`, `.panel`, `.panel-flat`, `.mono`,
  `.scroll-thin`.
- `app/utils/constants.ts` is the single source for `PAGE_SIZE`, `POLLING`,
  `UPLOAD_CONCURRENCY`, `FILE_EXTENSIONS`, `VIDEO_ASPECT_SIZES`,
  `VIDEO_DEFAULT_SIZE`, `TOOL_DEFAULTS`, `PROFILE_DEFAULTS`, `FALLBACK_AVATAR`,
  `STORAGE_KEYS`; pages/composables stop declaring their own copies.
- Auto-import pitfall: mlly 1.8.2's export regex silently dropped
  `TOOL_DEFAULTS` when the preceding `VIDEO_DEFAULT_SIZE` was a one-line object
  with a comma. It is now multi-line, and `TOOL_DEFAULTS` is a plain object
  literal (no `as const`) so its fields widen for `reactive()` assignment.

Runtime/a11y fixes found by the sweep:

- `/tools/download` — `loadFormats`/`loadConfigs` now return early when
  `taskManager.api` is undefined (web mode threw an uncaught promise); the
  Download Mode field uses `URadioGroup legend` instead of an orphan `<label>`.
- `/tools/video` — `checkGpu()` guards a missing `api` (was
  `Cannot read properties of undefined (reading 'detectGpuSupport')`); the two
  orphan labels became `span` + `aria-labelledby`.
- `/administration/logs`, `/administration/routes`, `/chat` — added `name` to
  inputs/textareas so Chrome stops flagging "form field without id or name".

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`; `.nuxt/eslint.config.mjs` regenerated 15:28 |
| 2 Lint | `npx eslint` on 9 touched files, after gate 1 | PASS* | 0 problems on every edited line; 387 pre-existing owner-WIP problems remain (`download.vue` 385, `InboxMail.vue:187` `vue/no-v-html`, `routes.vue:27` unused `hubFetch`) |
| 3 Tests | `npx tsx tests/unit/run-all.mts` | PASS | 12/12 specs, exit 0 |
| 4 Live | 21 routes on :4002 — 4 PDF, 5 Settings tabs, download, video, admin configs/logs/routes, resources inbox/connections, chat, ai-keys, hub-integration, login, home | PASS | only the allowed `<Suspense>` info on every route |
| 5 Docs | scratch removed; `AGENTS.md`, `docs/README.md`, user guide updated | PASS | — |

### Not proven

- Real Electron IPC and the real browser file picker (web mode exercised).
- Real Gemini extraction (no key configured; key handling belongs to the owner).
- Production build (`nuxi build`) and layout below ~884 px.
- tm-hub seed **applied to the database** — `scripts/seed/data.ts` is updated and
  typechecked, but the run awaits owner confirmation.

## Phase 4 — Browser Hub reverted, account profile into Settings, chat relay fixed (2026-11-02)

The phase-1 relocation was wrong for Browser profiles and right for the account
profile. This phase splits the two.

**Browser profiles back at top level**

- Restored `app/pages/profiles/{index,groups,proxies}.vue` verbatim from `HEAD`;
  removed the moved copies under `app/pages/system/settings/profiles/`.
- Reverted every link that pointed at `/system/settings/profiles*`
  (`app/pages/index.vue`, `app/components/home/HomeStats.vue`).
- tm-hub seed: `group_profiles` + `profiles`, `profiles_groups`, `profiles_proxies`
  are back as a top-level section (sort 4 / 40–42).

**Account profile is now a Settings tab**

- `app/pages/system/settings.vue` owns the shell (BasePage + BaseSectionNav +
  `NuxtPage`) with six tabs: Appearance, System, Information, Security, Sessions,
  Push Notifications.
- `app/pages/system/profile/{index,security,sessions,push}.vue` moved to
  `app/pages/system/settings/profile/` and rewritten as fragments (no BasePage,
  no per-page section nav); internal links point at the new paths.
- `app/middleware/auth.global.ts` redirects the legacy URLs
  `/system/profile*` → `/system/settings/profile*` and
  `/system/settings/profiles*` → `/profiles*`.
- tm-hub seed: `system_profile` now lives at `/system/settings/profile`, hidden
  from the sidebar (`is_visible: false`) so it stays grantable to non-root roles.
  The duplicate `system_settings_appearance` route (same path as `system_settings`)
  was dropped.

**Chat 502 `error.aiRelayUnauthorized`**

Root cause was not the relay code: the seed generated `apps.secret_key` but never
wrote it to `tm-tools/.env`, and `upsertApp` skipped returning it for existing
apps, so `NUXT_HUB_APP_SECRET` was stale and `requireAppAuth` answered 401 —
which `relayUpstreamError` deliberately surfaces as 502.

- `scripts/seed/shared.ts`: `upsertApp` now returns the effective `secret_key`;
  new `syncAppSecretEnv()` mirrors it into the satellite `.env` (value never logged).
- `scripts/seed/apps/tm-tools.ts`: calls `syncAppSecretEnv` after `upsertApp`.
- `tm-tools/.env.example`: documents `NUXT_HUB_APP_SECRET`.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS` |
| 1b Seed types | `npx tsc -p tsconfig.seed.json` (tm-hub) | PASS | exit 0 |
| 2 Lint | `npx eslint` on 10 touched files, after gate 1 | PASS | exit 0, 0 problems |
| 3 Tests | `npx tsx tests/unit/run-all.mts` | PASS | 12/12 specs, exit 0 |
| 4 Live | `/chat`, `/system/settings`, `.../system`, `.../profile`, `.../profile/{security,sessions,push}`, `/profiles`, `/profiles/groups`, legacy `/system/profile/security` | PASS | only the allowed `<Suspense>` info; `/profiles*` also show the pre-existing "form field without id/name" issue (unchanged files) |
| 4b Relay | `GET /api/v1/apps/:id/ai/relay/catalog` with the seeded secret | PASS | HTTP 200; `/api/v1/chat/models` in-browser HTTP 200 (was 502) |
| 5 Docs | `AGENTS.md`, user guide, `docs/README.md` corrected; section appended | PASS | — |

### Not proven

- The seeded secret is the app's current `secret_key`; if it is rotated in the hub
  UI, `NUXT_HUB_APP_SECRET` in `tm-tools/.env` must be re-synced (`pnpm seed:tools`)
  and the dev server restarted. Rotation itself is the owner's call.
- Real chat completion against a provider (catalogue and model listing verified;
  no message was sent).
- Production build and Electron mode.

## Phase 5 — Browser Hub rename (2026-11-02)

The profile pages folder and their URLs now match the menu route name.

- `app/pages/profiles/` → `app/pages/browser-hub/` (same three pages, untouched
  contents apart from route paths).
- URLs: `/browser-hub`, `/browser-hub/groups`, `/browser-hub/proxies`;
  in-page links (`viewGroupProfiles`, `viewProxyProfiles`, back buttons), the home
  dashboard tiles and `HomeStats` all point at the new paths.
- `app/middleware/auth.global.ts` redirects the old `/profiles*` URLs (and the
  short-lived `/system/settings/profiles*` ones) to `/browser-hub*`.
- tm-hub seed: `group_profiles` path `#browser-hub`, label `nav.browser_hub`;
  children re-pathed to `/browser-hub*`. Route **ids** are unchanged
  (`group_profiles`, `profiles`, `profiles_groups`, `profiles_proxies`) so existing
  role `allowed_routes` rows in the database keep working.
- Components stay at `app/components/profiles/*` and i18n keys under `profiles.*`
  — they describe the domain, not the URL.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`; `.nuxt/eslint.config.mjs` regenerated 17:27 |
| 1b Seed types | `npx tsc -p tsconfig.seed.json` (tm-hub) | PASS | exit 0, 0 errors |
| 2 Lint | `npx eslint` 6 touched files, after gate 1 | PASS | exit 0, 0 problems |
| 3 Tests | `npx tsx tests/unit/run-all.mts` | PASS | 12/12 specs |
| 4 Live | `/browser-hub`, `/browser-hub/groups`, `/browser-hub/proxies`, legacy `/profiles` | PASS | old URL 301s to `/browser-hub`; sidebar submenu links all `/browser-hub*`; only the allowed `<Suspense>` info plus the pre-existing "form field without id/name" issue carried over from the unchanged pages |
| 4b Seed | `pnpm seed:tools` (tm-hub) | PASS | `group_profiles` + 3 children updated to `#browser-hub` / `/browser-hub*` |
| 5 Docs | `AGENTS.md`, user guide, `docs/README.md`, `DEVELOPMENT_PLAN.md`, this section | PASS | — |

### Not proven

- Non-root role visibility: verified as root only. Ids are unchanged, so roles that
  already list `profiles*` ids need no seeding.
- Production build and Electron window.

## Phase 6 — extraction through the AI relay (2026-11-03)

Extraction no longer talks to Google directly. A run picks any model of any
connected AI provider, and the page travels through the hub relay as an image.

- `server/modules/pdf/extract/models.ts` — lists every model of every usable
  connection from `GET /api/v1/apps/:id/ai/relay/catalog` (5 min cache, no local
  allowlist), filters models that cannot return text, puts the suggested model
  first. `resolveExtractTarget` validates the picker value and falls back to the
  default when a stale tab sends an id that no longer exists.
- `provider.ts` — renders the single-page PDF to PNG (`pdf-to-img`, scale =
  `PDF_IMAGE_SCALE`) and calls `relayChat` with the image attachment; the JSON
  schema is rendered into the system prompt because the relay is text-only.
- `config.pdf.extract` — dropped `apiKey`/`baseUrl`/`models`; `model` is only the
  suggestion (`PDF_EXTRACT_MODEL`, default `gemini-3.5-flash`).
- tm-hub — `RelayMessage.attachments` (`{ mimeType, data }`, base64, allowlist
  png/jpeg/webp/pdf, 8 MB per part, 12 MB per turn) mapped per adapter;
  chat timeout 60 s → 120 s for vision turns.
- UI — the picker consumes the catalogue directly (`connectionId` + `modelId`),
  the "no Gemini key" banner became a "no AI model available" banner, and the
  overview badge reports whether any model is selectable.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` (tm-tools + tm-hub) | PASS | tm-hub exit 0; tm-tools only the pre-existing `useHub.ts` TS2578 pair |
| 2 Live catalogue | `GET /api/v1/pdf/extract/models` | PASS | HTTP 200, 37 selectable models, `models/gemini-3.5-flash` first with `isDefault: true` |
| 3 Real run | `POST /api/v1/pdf/extract/start` on a generated 1-page price table | PASS | job `done`, 1/1 page, 4 products, 6 CSV rows; `gemini-3.5-flash` via `google_ai-main`, prices and W/D/H read correctly |
| 4 UI | `/pdf/extract` on :4002 | PASS | picker defaults to "Gemini 3.5 Flash", options load from the catalogue, no missing-model banner |

### Not proven

- Providers other than Google: the hub mapping for Anthropic `document`/`image`
  and OpenAI-compatible `file`/`image_url` is implemented but no non-Google
  connection exists in this environment to exercise it.
- Variant-level prices on dense real pages: the sample page returned the correct
  product/price rows, but two variants of one SKU inherited the same price, so
  real-catalogue accuracy still needs a run on an actual Hòa Phát page.
- `pnpm dev` (forked mode) currently fails at Nitro startup with
  `Cannot add property setup, object is not extensible`; the server was restarted
  with `npx nuxt dev --port 4002 --no-fork`. That failure happens before any PDF
  code loads and is unrelated to this change.

## Phase 6b — real pages 5–7 vs the reference CSV (2026-11-03)

Ran `private/pdf/page_0005.pdf`, `page_0006.pdf` and `page_0007.pdf` one at a
time through the live pipeline (`gemini-3.5-flash` via `google_ai-main`) and
diffed the export against `danh_sach_san_pham_ghe_lanh_dao_cao_cap-567.csv`.

| Page | Status | Products | CSV rows | Wall time |
|---|---|---|---|---|
| `page_0005.pdf` | done | 9 | 21 | 33 s |
| `page_0006.pdf` | done | 11 | 21 | 33 s |
| `page_0007.pdf` | done | 9 | 22 | 30 s |
| combined | — | 29 | 64 (reference: 64) | — |

Row coverage is exact: 64 produced = 64 reference, with no missing or extra SKU
apart from two variant labels spelled `Da` instead of `Da thật` (SG350, SG350B).

Per-field agreement on the 62 key-matched rows:

- Exact: `sku`, `basePrice`, `salePrice`, `opt1_name`, `opt1_val`, `v_sku`,
  `v_basePrice`, `attributes` (W/D/H + option), `stock`, `manageStock`,
  `status`, `opt2_*`.
- `title` 56/62 — SG350/SG350B drop the `cao cấp` word.
- `categories` / `tags` / `keywords` 41/62 — the model swaps `ghe-van-phong`
  for an invented `ghe-lanh-dao-cao-cap-dong-tq` leaf.
- `description` 0/62, `shortDesc` 1/62 — correct meaning, paraphrased wording;
  `description` also says `bọc da thật` for every variant instead of
  `da thật, da công nghiệp hoặc PVC`.

### Not proven

- The category tree is not supplied to the model, so it guesses slugs from the
  page header — the cause of the `categories`/`tags`/`keywords` gap.
- Reference prose (`description`, `shortDesc`) is generated rather than copied;
  matching it exactly would need a template or few-shot examples from the CSV.

## Phase 6c — extraction presets (2026-11-03)

A run can now carry an operator-written description and a reference sample, so
the pipeline is not tied to one catalogue layout.

- `server/modules/pdf/extract/presets.ts` — JSON store at `.data/pdf/presets.json`
  (max 40; name ≤ 80, description ≤ 6000, sample ≤ 16000 chars);
  `sanitizeInstructions()` normalises what the start endpoint received.
- Routes: `GET/POST /api/v1/pdf/extract/presets`, `DELETE /api/v1/pdf/extract/presets/:id`
  (`PDF_PRESET_NAME_REQUIRED` / `PDF_PRESET_LIMIT` → 422).
- `prompt.ts` — `buildSystemPrompt()` appends "HƯỚNG DẪN BỔ SUNG" (highest
  priority on conflict) and "MẪU THAM KHẢO" (imitate wording, never copy values).
- UI — preset select with edit/new/delete, plus a modal for name, description and
  sample; the selected preset's content is sent with the job.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS` |
| 2 Lint | `npx eslint` on 13 touched files | PASS | exit 0, 0 problems |
| 3 API | presets list/create/update/delete | PASS | HTTP 200, preset round-tripped with `id` preserved on update |
| 4 Run with preset | `page_0005.pdf`, preset describing the category path + description template + 1 sample product | PASS | 21/21 rows; vs the reference CSV: `title`, `basePrice`, `v_basePrice`, `attributes`, `categories`, `tags`, `keywords`, `description` all 21/21, `shortDesc` 18/21 |
| 5 UI | `/pdf/extract` on :4002 | PASS | preset select lists "Default rules" + the saved preset, hint shows its description, edit modal opens with all three fields populated |

Same page **without** a preset scored `categories` 41/62 and `description` 0/62 on
pages 5–7, so the preset is what makes a document type reproducible.

### Not proven

- Preset `sample` is free text: a malformed sample is passed through as prose
  rather than parsed, so a bad example costs tokens without a validation error.
- Deleting or editing a preset does not touch finished jobs (by design), but no
  UI surfaces which preset a historical job used beyond the stored name.

## Phase 7 — Word and office documents (2026-11-03)

Four capabilities added on top of the PDF pipeline: .docx intake, Word→PDF,
PDF→Word, and XLSX/DOCX exports.

- `server/modules/pdf/office/` — `docxParse` (mammoth → blocks → flat text),
  `docxToPdf` (pdf-lib layout + embedded host font), `pdfToDocx` (pdfjs text →
  docx), `rowExports` (xlsx via exceljs, docx via docx), `font` (Vietnamese
  TrueType discovery, `PDF_FONT_PATH` override).
- Extraction now branches per source: a `.docx` is chunked (~12k chars) and sent
  through the text-only relay path; a PDF still renders pages as images.
- Deleting a source now also removes its split folder, rendered images,
  checkpoints, merged file and product exports (previously left behind).
- `readLibrary()` exposes `word` and `office`; new routes under `/word` and
  `/office`; `sources/:name` is served inline for preview.

| Gate | Command / input | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS` |
| 2 Lint | `npx eslint` on module, routes, pages, composables | PASS | 0 problems |
| 3 Word→PDF | `word-probe.docx` (Vietnamese heading, paragraph, 7-column price table) | PASS | 1 page; text read back by pdfjs is correct: "BẢNG GIÁ GHẾ LÃNH ĐẠO HÒA PHÁT 2026 …"; rendered PNG shows table rules and wrapped cells, no tofu |
| 4 PDF→Word | converted PDF → `/sources/:name/docx` | PASS | 9.9 KB .docx, read back with mammoth: accents and line order intact, "Trang 1" heading added |
| 5 Word extraction | `.docx` price list, preset applied | PASS | job `done`, 3 products / 4 rows, prices 5.160.000 · 4.180.000 · 4.950.000 · 3.850.000, categories exact, descriptions Vietnamese |
| 6 Exports | product xlsx/docx after the run | PASS | xlsx opens with 5 rows × 25 columns (header `sku`); docx readable, 2.4 KB of text |
| 7 UI | `/pdf/library`, `/pdf/extract` on :4002 | PASS | Word panel lists the upload, "To PDF" and "To Word" buttons present, no error overlay; Word files appear in the extraction source picker as "… · Word" |

### Fixed during this phase

- Table blocks were dropped entirely by the first parser (the placeholder was
  never inside a tag), so Word extraction returned 0 products; blocks are now
  scanned in document order.
- `productCount` ignored pages restored from checkpoints.
- `?format=` on the products route silently fell back to CSV for unknown types.

### Not proven

- Word→PDF fidelity beyond headings/paragraphs/lists/tables: images, columns,
  headers/footers and footnotes are ignored by design.
- Legacy `.doc` is rejected rather than converted.
- PDF→Word on documents whose fonts lack a ToUnicode map produces wrong
  characters; tested only on PDFs with a proper map.

## Phase 8 — workspace IA: `.data/pdf` explorer and the split/images split (2026-11-04)

Two problems were fixed at the information-architecture level: the library only
showed `sources`, and `/pdf/split` carried two unrelated flows (page folders and
page images).

- `app/pages/pdf/library.vue` is now an explorer over `D:\Applications\tm-tools\.data\pdf`:
  the tree lists `sources`, `inputs`, `split`, `images`, `merged`, `products` and
  `office` as read-only area roots (label "PDF storage"); only `sources` accepts
  upload and folder CRUD, every area still previews, downloads and deletes files.
- `server/api/v1/pdf/explorer.get.ts` returns the folder tree of every area in one
  call (`usePdfStudio().getExplorerTrees()`), so switching areas costs one
  directory request instead of a tree rebuild.
- `/pdf/split` keeps only split → merge (page folders + merged PDFs).
- New `/pdf/images` renders a source to one PNG per page, lists image folders and
  rebuilds a PDF from one; both actions share the per-page overwrite checkbox.
- `/pdf/export` dropped the images/office/products panels it duplicated; it is now
  the source picker, the format picker and the per-format result list.
- tm-hub seed gained route `pdf_images` (`/pdf/images`, `i-lucide-images`, sort 33,
  admin `allowed_routes`), with export/import/extract moving to sort 34–36.

| Gate | Command / input | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS` |
| 2 Lint | `npx eslint` on the 7 PDF pages, `FolderTree`, `WorkspaceShell`, `FileBrowser`, `FolderRow`, `usePdfDirectory`, `usePdfStudio`, `usePdfMenus`, `explorer.get.ts` | PASS | exit 0, 0 problems, re-run after the last `.nuxt/eslint.config.mjs` regeneration |
| 3 Tests | `pnpm test` | PASS | 12/12 specs, exit 0 |
| 4 Seed types | `pnpm typecheck:seed` in tm-hub | PASS | exit 0 with `pdf_images` in routes and admin `allowed_routes` |

### Not proven

- No live browser pass on `/pdf/library` or `/pdf/images`: both need an
  authenticated Hub session and the gate did not handle credentials.
- The tm-hub seed was type-checked, not applied (`pnpm seed --app=tools` writes the
  database and was not run).
- `pdfToDocx()` in `usePdfStudio` and the `force` option of `startExtraction()`
  remain unwired.


## Phase 9 — document workspace upgrade (2026-11-04)

Implements [WORKSPACE-UPGRADE-PLAN.md](./WORKSPACE-UPGRADE-PLAN.md) on top of the
audit in [WORKSPACE-AUDIT.md](./WORKSPACE-AUDIT.md). The spec then carried an
Electron-IPC premise that did not apply here; Nitro already owns the PDF
filesystem, so the registry and the permission checks live on the server. The
spec has since been corrected to say so.

> **Superseded in Phase 14:** this phase made every generated area
> (`split`, `images`, `merged`, `products`, `office`) folder-immutable. Phase 14
> reversed that — only the *area root* is fixed; subfolders inside it are
> editable again in every area except legacy `word`. Read Phase 14 for the
> current rule; the rows below are kept verbatim as history.

- `server/modules/pdf/workspace.ts` is the single permission table
  (`PdfAreaDescriptor` per area, `outputMapping`, `workspaceReport`).
  `sources` and `inputs` own their subfolders; `split`, `images`, `merged`,
  `products`, `office` are folder-immutable; legacy `word` is fully read-only.
- `createAreaFolder`, `renameAreaItem` and `deleteAreaItem` call
  `assertFolderWritable` for directory targets, so a client cannot create,
  rename or delete a managed folder even though the UI hides the actions.
  New code `PDF_FOLDER_IMMUTABLE` maps to 409 and `pdf.errors.folderImmutable`.
- `GET /api/v1/pdf/workspace` returns descriptors, per-area file/folder counts,
  `needsRepair` and `outputMapping`, read-only.
- `WorkspaceShell` gained a persisted resizable explorer (220–420 px, splitter,
  collapse rail) that only collapses on desktop; `FolderTree` gained a debounced
  folder filter and a collapse button; `FileBrowser` gained a toolbar with
  search, sort (name / modified / size) and a compact density applied through
  `FileRow` and `FolderRow`.
- `/pdf` overview lists each tool's output folder from the workspace report.

| Gate | Command / input | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`, config regenerated (24050 bytes) |
| 2 Lint | `npx eslint` on the touched PDF components, `pages/pdf/index.vue`, `usePdfStudio.ts`, `workspace.ts`, `directory.ts`, `workspace.get.ts`, `shared/types/pdf.ts`, `pdf_workspace.spec.ts` | PASS | exit 0, run after the last config regeneration |
| 3 Tests | `pnpm test` | PASS | 13/13 specs, exit 0 (new `pdf_workspace.spec.ts`, 11 assertions) |
| 4 SFC compile | dev server `/_nuxt/…` for the 5 changed components + overview page | PASS | HTTP 200 for every path |
| 5 Route | `GET /api/v1/pdf/workspace` | PASS (registered) | 401 from the auth middleware, not 404 |

### Not proven

- Live UI interaction (splitter drag, collapse persistence, folder filter,
  toolbar sort/density) — needs a signed-in browser session; the gate did not
  handle credentials.
- An authenticated `POST /pdf/directory/folder` against a managed area was not
  executed; the 409 path is covered by the registry spec and the call sites.
- No auto-repair: `needsRepair` is reported, `checkpoints`/trash cleanup is
  unchanged.

## Phase 10 — workspace integrity repair (2026-11-04)

Closes the last open item in [WORKSPACE-UPGRADE-PLAN.md](./WORKSPACE-UPGRADE-PLAN.md)
Phase 6. The report was already read-only; this adds the manual repair the plan
promised, with a scope narrow enough that it cannot destroy work.

- `workspaceRepair()` in `server/modules/pdf/workspace.ts` recreates only roots
  that the registry already declares (`mkdirSync recursive`) and returns the
  created areas plus the fresh `needsRepair`.
- `POST /api/v1/pdf/workspace/repair` exposes it behind the same `runPdf`
  wrapper; a missing folder is no longer an error path, so no new error code.
- `/pdf` overview shows a "Repair folders" button only while `needsRepair` is
  true, with a tooltip stating that it creates folders only.

| Gate | Command / input | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`, config regenerated (24092 bytes) |
| 2 Lint | `npx eslint` on `pages/pdf/index.vue`, `usePdfStudio.ts`, `workspace.ts`, `repair.post.ts`, `shared/types/pdf.ts`, `pdf_workspace_repair.spec.ts` | PASS | exit 0, after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 14/14 specs, exit 0 (new `pdf_workspace_repair.spec.ts`, 3 assertions) |
| 4 Routes | `POST /api/v1/pdf/workspace/repair`, `GET /api/v1/pdf/workspace` | PASS (registered) | 401 from auth middleware, not 404 |
| 5 SFC compile | dev server `/_nuxt/pages/pdf/index.vue` | PASS | HTTP 200 |

### Not proven

- The button has not been clicked in a signed-in browser; the endpoint contract
  and the repair semantics are covered by the temp-root spec instead.
- Repair runs synchronously per area; with eight areas that is a few `mkdir`
  calls, so it was not made async or job-backed.

## Phase 11 — live UI pass and dead-path cleanup (2026-11-04)

Verified the workspace upgrade in the signed-in `localhost:4002` tab instead of
only compiling it, and removed the last dead export path.

- Folder filter, file filter, sort, density, collapse/expand and both empty
  states were exercised in the browser; results are listed in
  [WORKSPACE-UPGRADE-PLAN.md](./WORKSPACE-UPGRADE-PLAN.md#verification).
- New `tests/unit/pdf_area_guard.spec.ts` runs against a temp `PDF_DATA_DIR` and
  proves the folder rules on disk: `sources` writes work, a managed area refuses
  create/rename/delete with `PDF_FOLDER_IMMUTABLE`, a file inside a managed area
  stays deletable, and the folder still lists.
- Deleted `pdfToDocx()` from `usePdfStudio` plus its two unused i18n keys. It had
  no caller: `POST /sources/:name/docx` is superseded by
  `POST /sources/:name/export` with `formats: ['docx']`, which the export page
  already drives. The server module `office/pdfToDocx.ts` stays because
  `source-export.ts` uses it.

| Gate | Command / input | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`, config regenerated (24092 bytes) |
| 2 Lint | `npx eslint` on the touched composable, overview page, 5 PDF components, `workspace.ts`, `directory.ts`, the two workspace routes, `shared/types/pdf.ts`, and the two workspace specs | PASS | exit 0, after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 14/14 specs, exit 0 |
| 4 Browser | signed-in `/pdf/library`, `/pdf`, `/pdf/split` | PASS | filter/sort/density/collapse measured; 7 mapping rows; repair hidden on a healthy tree |
| 5 Routes | `GET /api/v1/pdf/workspace`, `POST /api/v1/pdf/workspace/repair` | PASS (registered) | 401 from auth middleware, not 404 |

### Not proven

- Splitter pointer drag: the preview tool exposed no page-evaluation API and no
  mouse driver, so the drag was not measured. Click collapse/expand and the
  persisted flag were measured.
- Linting the whole `server/modules/pdf` tree reports pre-existing errors in
  files this work did not touch (`trash.ts`, `inspect.ts`, `data/parse.ts` and the
  trash routes). The gate lints only the touched files, as recorded above.

## Phase 12 — full-surface lint and DOCX preview hardening (2026-11-04)

The PDF surface had never been linted under the current `.nuxt/eslint.config.mjs`;
linting it directly reported 101 errors and 19 warnings across 16 files. This
phase brought the whole surface to zero.

- `eslint --fix` resolved the mechanical rules (`vue/max-attributes-per-line`,
  `vue/html-indent`, `@stylistic/no-multiple-empty-lines`, quotes, quote-props).
- Hand fixes: `inspect.ts` `let relative` gets a definite assignment instead of a
  dead `''` default; `trash.ts` drops the unused `safeRelativePath` import and
  replaces four `delete meta[key]` calls with a `withoutKey()` helper plus a
  heartbeat rebuild in `listTrashItems` (same behaviour, no dynamic delete);
  `PresetSampleEditor` marks `modelValue` optional (it has a default) and restores
  the `catch` in `formatJson` that an edit had dropped.
- **Real issue found:** `PreviewFile.vue` rendered mammoth's DOCX→HTML output
  through `v-html` unsanitized. DOCX files are user uploads, so that was a stored
  XSS path. New `app/utils/sanitizeHtml.ts` strips script/style/iframe/object/
  embed/svg/math elements, inline `on*` handlers and `javascript:` /
  `data:text/html` URLs; the viewer now pipes the HTML through it, with a
  documented `eslint-disable-next-line vue/no-v-html`.
- New `tests/unit/sanitize_html.spec.ts` (6 assertions) covers the removal
  cases and proves ordinary formatting survives.

| Gate | Command / input | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`, config regenerated (24107 bytes) |
| 2 Lint | `npx eslint` over `app/components/pdf`, `app/pages/pdf`, the two PDF composables, `app/utils/pdfStudio.ts`, `app/utils/sanitizeHtml.ts`, `server/modules/pdf`, `server/api/v1/pdf`, `server/utils/pdfApi.ts`, `shared/types/pdf.ts`, `sanitize_html.spec.ts` | PASS | exit 0, 0 problems, after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 16/16 specs, exit 0 |
| 4 Browser | `/pdf/library` filter/sort/density/collapse, `/pdf/images`, `/pdf/split`, `/pdf/export`, `/pdf/extract` | PASS | re-measured after the auto-fix; filtered 3 rows, size sort 246→18 KB, compact 7 rows, collapse rail 36 px |

### Not proven

- The sanitizer is a conservative regex pass, matching the existing
  `sanitizeEmailHtml` approach; it is not a full HTML5 parser. Nested or
  mutated-markup bypasses are not exhaustively tested.
- Splitter pointer drag still unmeasured (no page-evaluation or mouse driver in
  the preview tool).

## Phase 13 — close the gaps found while auditing "is it complete?" (2026-11-04)

An audit against the code, not the docs, found three places where the written
claims and the running code disagreed.

- **Upload accepted a format the converter cannot read.** `inputKind()` in
  `server/modules/pdf/data/parse.ts` treated `.webp` as an image, but `pdf-lib`
  embeds only PNG/JPEG and `isInputName()` hides non-PNG/JPEG images. A `.webp`
  upload succeeded, then vanished from the list and failed at conversion. The
  allowlist now matches what the converter supports (`png|jpg|jpeg`).
- **`outputMapping` was documentation only.** The plan said tools stop joining
  `pdfDirs` by hand, but every writer still did. New `outputDir(tool)` and
  `areaDir(area)` in `workspace.ts` now back split, rasterize, merge,
  images→PDF, convert, the source-export formats and the DOCX route; the
  directory listing takes `areaAcceptPredicate` instead of its own if-chain.
- **A dropped `catch`.** An earlier edit left `formatJson` with an unreachable
  warning call; restored while clearing the surface lint.

| Gate | Command / input | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`, config 24107 bytes |
| 2 Lint | `npx eslint` over the whole PDF surface and its 6 specs | PASS | exit 0, 0 problems |
| 3 Tests | `pnpm test` | PASS | 16/16 specs, exit 0 (`pdf_workspace.spec.ts` now 14 assertions) |
| 4 Registry wiring | `pdf_workspace.spec.ts` → `outputDir` + `areaDir` | PASS | every tool resolves to `AREA_DIRS[outputArea(tool)]`; unknown area throws |

### Not proven

- No live browser re-run after the `outputDir` refactor: the browser session was
  reset. The refactor is a rename of the same constants, and the spec asserts
  each tool resolves to the identical `AREA_DIRS` entry the old code used.

## Phase 14 — system folder markers and full-card tree selection (2026-11-04)

Folder-tree UX pass driven by user feedback on `/pdf/library`.

- **System roots are locked, contents are not.** Every area root is drawn with a
  single `i-lucide-folder-lock` icon (tooltip `pdf.tree.systemRootHint`) and its
  dropdown offers only "New subfolder" — no rename, no delete. Subfolders keep
  the plain folder icon and the full rename/delete menu. Selection is shown by
  icon colour and label weight (primary when open), not by a second badge, so the
  row stays uncluttered.
- **Server rules follow the same split.** All generated areas moved to
  `writableFolders: true` with `systemRoot: true`; `assertFolderWritable` now
  only rejects the legacy `word` area, and `renameAreaItem` / `deleteAreaItem`
  already refuse an empty relative path, so an area root can never be addressed
  while its subfolders stay editable. `/pdf/library` reads `writableFiles` /
  `writableFolders` from `GET /api/v1/pdf/workspace` instead of hard-coding
  "sources only".
- **The whole card selects.** `HeTreeMenu` gained an opt-in `cardClickable` prop:
  the node card emits `node:click`, with `@click.stop` on the drag handle,
  checkbox, chevron and "…" so those controls stay independent. Routes admin
  keeps the old label-only behaviour by not setting the prop.
- `usePdfDirectory` carries the area for each create/rename/delete target, so the
  library can act on any area node without switching the visible listing first.
- **`HeTreeMenu.vue` is clean under the current lint config.** It carried 33
  errors at `HEAD` (25 × `no-explicit-any`, 4 × `no-unused-vars`, 3 ×
  `unified-signatures`, 1 × `vue/no-parsing-error`). The component is now
  generic over `TNode`, the unused `class` prop (whose `:class="class"` binding
  broke template parsing) is gone — callers' `class` still falls through to the
  root element — and the dead `initTree` / `onChange` code and the unused
  `isInitial` binding are deleted. `onClick:node` stays opt-in through the same
  `cardClickable` prop, so the routes admin keeps its label-only behaviour.
  `app/pages/administration/routes.vue` also dropped an unused `hubFetch`
  destructure that the stricter pass surfaced.

| Gate | Command / input | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`, config regenerated (24107 bytes) |
| 2 Lint | `npx eslint` on the 5 touched components/composable/page, `administration/routes.vue`, `workspace.ts`, `shared/types/pdf.ts` and the 2 specs | PASS | exit 0, run after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 16/16 specs, exit 0 |
| 4 Lock markers | signed-in `/pdf/library` | PASS | 8 `folder-lock` icons (virtual root + 7 areas), 0 secondary lock badges, 7 plain folder icons |
| 5 Card click | click the folder icon inside a card (a hit target outside the label) | PASS | heading switched `PDF gốc` → `Ảnh PDF` |
| 6 Menus | system root vs subfolder dropdown | PASS | root: `['Thư mục con mới']`; subfolder: `['Thư mục con mới','Đổi tên','Xoá thư mục']` |
| 7 Folder rows | `Trang tách` area row menu | PASS | `Mở thư mục`, `Đổi tên`, reveal, copy path, `Xóa` — files/subfolders still editable |
| 8 Tool page | `/pdf/split` tree | PASS | lock icon on the `sources` root, card click keeps `PDF nguồn` selected |
| 9 Routes admin | `/administration/routes` card after the generic rewrite | PASS | card keeps no `cursor-pointer` (so `cardClickable` stays false), chevron and checkbox open no dialog, 9 route nodes still render |

### Not proven

- Exact pointer coordinates inside a card are not measurable here: the browser
  shim's `locator.click({ position })` ignores `position`, so clicks land at the
  element centre. Card-click coverage therefore comes from clicking a real child
  target outside the label (gate 5) plus the served module's
  `onClick: ($event) => $props.cardClickable && $setup.onNodeClick(node)` gating,
  not from padding coordinates.
- `tests/unit/dev_port.spec.ts` (committed 2026-10-31, unrelated to PDF) still
  reports two style errors under the current rule set; it is out of scope here
  and was not modified.

## Phase 15 — atomic output, audit log, lazy tree, viewer controls (2026-11-05)

Closes the four items left open by the P0–P3 audit: writers are atomic, every
mutation is audited, the explorer loads per node, and the image viewer has
zoom/rotate.

- `writeFileAtomic` (`paths.ts`) writes `.<name>.tmp` beside the target and
  renames over it, removing the temp file on failure; every PDF writer now uses
  it (`document`, `merge`, `images-to-pdf`, `raster`, `convert`, `source-export`,
  `extract/export`, `extract/presets`, `trash`, `audit`, the DOCX export route).
- `server/modules/pdf/audit.ts` appends JSONL to `<pdfRoot>/audit.jsonl`, caps
  the file at 500 events by atomically rewriting the tail, and `recordAudit`
  swallows write failures. `GET /api/v1/pdf/audit?limit=` reads newest events.
  Actions: `upload`, `output` (with `tool`), `folder-create`, `rename`,
  `delete`, `restore`, `purge`, `repair`, `denied`.
- `GET /api/v1/pdf/explorer` returns depth 1; `GET /api/v1/pdf/explorer/children`
  loads one folder. Both the library and all five tool pages pass `lazy`, keep a
  `loadedChildren` map, and switch to `?depth=full` only while a folder search is
  active. `HeTreeMenu` treats `hasChildren: true` as expandable.
- `PreviewFile` image viewer gained zoom (50–300 %, seven steps), ±90° rotation
  and reset; all three i18n labels exist in both locales.
- Two routes still read raw router params (`split/[name]/merge.post.ts`,
  `images/[name]/pdf.post.ts`); both now use `pathParam`, matching the rest of
  the API.

| Gate | Command / input | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | exit 0, 0 × `error TS`, config regenerated |
| 2 Lint | `npx eslint` on every touched server module, route, composable, component and page, plus the four new specs | PASS | exit 0, after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 22/22 specs, exit 0 (`pdf_atomic_write`, `pdf_audit`, `pdf_audit_output`, `pdf_lazy_tree` added) |
| 4 Routes | `GET /explorer`, `GET /explorer/children`, `GET /audit` | PASS (auth-gated) | 401 `error.tokenMissing`, not 404 |
| 5 Library tree | signed-in `/pdf/library` | PASS | 7 area roots + nested folders after the lazy switch |
| 6 Deep search | type `page` in the folder filter | PASS | nested `page_0005…0007` appear under `Trang tách` from `?depth=full` |
| 7 Image viewer | `/pdf/preview?area=images&name=bang-gia-ghe/page_0001.png` | PASS | zoom → `matrix(1.25…)`, 125 % label; rotate → `matrix(0,1.25,-1.25,0)`; reset re-disables |

### Not proven

- No screenshot of the viewer: the in-app browser reported no visible viewport,
  so the toolbar state and computed `transform` are the evidence.
- The audit log was exercised through the temp-root specs only; the live
  `audit.jsonl` was not inspected because the dev data root was not modified.
- Lazy expand was verified through the shallow tree plus the deep-search query;
  clicking a lazy chevron in the signed-in tab was not needed once deep search
  proved the children endpoint returns the same nested nodes.

## Phase 16 — v3 rebuild Phase 0: audit and baseline (2026-11-05)

Baseline taken before any v3 code change, per
[TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md](./TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md) §15.
No source file was modified in this phase.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, `grep -c "error TS"` = 0; `.nuxt/eslint.config.mjs` regenerated 24107 bytes at 19:26 |
| 2 Lint | `npx eslint` on `app/pages/pdf`, `app/components/pdf`, the 3 PDF composables, `app/utils/pdfStudio.ts`, `shared/types/pdf.ts`, `server/modules/pdf`, `server/utils/pdfApi.ts` | PASS | `LINT_EXIT=0`, 0 problems, run after the config regeneration |
| 3 Tests | `pnpm test` | PASS | `22/22 specs passed`, `TEST_EXIT=0` |

### §1 reconciled against code

| §1 claim | Verified with |
|---|---|
| 7 UI routes, no `/pdf/merge` | `ls app/pages/pdf` = `export, extract, images, import, index, library, preview, split` |
| 16 components in `app/components/pdf/` | `ls app/components/pdf` matches the §1.4 table exactly |
| 3 composables + `app/utils/pdfStudio.ts` | `usePdfDirectory`, `usePdfMenus`, `usePdfStudio` present |
| Server modules and 48 API routes | `ls server/modules/pdf`, `find server/api/v1/pdf` count matches §1.7 |
| 7-key `outputMapping`, `word` read-only, every root `systemRoot` | `server/modules/pdf/workspace.ts` |
| Three codes missing from `PDF_ERROR_STATUS` | `server/utils/pdfApi.ts` has none of `PDF_FOLDER_NAME_REQUIRED`, `PDF_TRASH_ITEM_NOT_FOUND`, `PDF_EXPORT_FAILED` |

§1 needed no edits; the audit stands as written on 2026-11-05.

## Phase 17 — v3 rebuild Phase 1: Home (2026-11-05)

- New [app/utils/pdfOperations.ts](../../app/utils/pdfOperations.ts): the seven running
  operations with `group`, `route`, `input`, `output.mappingKey`, `execution`,
  `config` and `resultHint`, plus the naming formulas read from
  `server/modules/pdf/security.ts` and the three route handlers.
- `/pdf` rebuilt: search over the operation list, three groups
  (organize / convert / extract), the Library card, the repair banner when
  `needsRepair`, and one collapsed `<details>` holding the limits and the
  `outputMapping` table. The pipeline list and the six workspace cards are gone.
- Counts come from `GET /library`; a card shows `—` until the library resolves,
  never a fake `0`. AI state now comes from `GET /extract/models`.
- i18n: `pdf.operations.*` and the new `pdf.overview.*` keys in both locales; the
  dead `overview.kpi`, `overview.pipeline` and `overview.config.description`
  blocks were removed.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config regenerated 24446 bytes at 19:42 |
| 2 Lint | `npx eslint app/pages/pdf/index.vue app/utils/pdfOperations.ts` | PASS | exit 0, run after the regeneration |
| 3 Tests | `pnpm test` | PASS | 22/22 specs |
| 4 SFC compile | dev server `/_nuxt/pages/pdf/index.vue`, `/_nuxt/utils/pdfOperations.ts` | PASS | HTTP 200 both |

### Not proven

- The rebuilt Home has not been opened in a signed-in browser yet; acceptance
  checks for all rebuilt pages are batched with the Phase 3 pass.

## Phase 18 — v3 rebuild Phase 2: one explorer for six pages (2026-11-05)

- New [app/composables/usePdfExplorer.ts](../../app/composables/usePdfExplorer.ts)
  moves the seven-area tree, lazy children, deep search, folder modal state and
  the server-decided `writableFiles`/`writableFolders` out of `library.vue`.
  It takes the page's `library` ref so the area roots count the same data the
  page already fetched. A request sequence guard stops a slow folder response
  from overwriting a folder opened after it.
- `library.vue`, `split.vue`, `images.vue`, `import.vue`, `export.vue` and
  `extract.vue` all use it; `usePdfDirectory` now has **no caller** and is left
  in place only until Phase 5 decides whether anything still needs it.
- Every tool page now shows the same seven area roots, follows the active area
  when the tree switches area, and hides its per-operation row action outside
  the area that action accepts (`sources` for split/rasterize/export/extract,
  `inputs` for convert).
- `library.vue` lost its `overwrite` footer checkbox and its auto-select of the
  first source: neither had a meaning on a browse-only page.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24484 bytes at 20:06 |
| 2 Lint | `npx eslint app/pages/pdf app/composables/usePdfExplorer.ts app/utils/pdfOperations.ts` | PASS | exit 0 after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 22/22 specs; `i18n_keys` green in both locales |
| 4 SFC compile | six PDF pages + `usePdfExplorer.ts` on the dev server | PASS | HTTP 200 for each |

### Not proven

- No signed-in browser pass yet: the seven-root assertion, area switching and
  permission-derived edit affordances are read from the code path, not observed
  in the running app. Batched with the Phase 3 browser pass.

## Phase 19 — v3 rebuild Phase 3: Active Input split from Active Folder (2026-11-05)

- `shared/types/pdf.ts` gained `PdfDocumentRef` (area + relativePath + name +
  kind) and `PdfSelection` (one `mode`, one item). There is no `multi-file`
  mode because no endpoint accepts several inputs.
- New [app/composables/usePdfSelection.ts](../../app/composables/usePdfSelection.ts):
  `pickFile` / `pickFolder` / `clear` / `compatible` / `isValid`. A pick whose
  kind or area does not match the operation is refused with a reason key
  instead of replacing the selection.
- `FileBrowser.vue`: `selectable` and its second row template are gone; a file
  name click always opens the preview, and the new `pickable` prop renders the
  dedicated pick button. New `folder-actions` slot, and `FileRow` gained a
  `selected` highlight. `FolderRow` gained an `actions` slot so a page can put
  an operation button on a folder.
- `FolderTree.vue` passes `hide-checkbox`, a new `HeTreeMenu` prop defaulting to
  `false`, so `administration/routes.vue` keeps its checkbox while the explorer
  no longer shows a dead one.
- `export.vue` and `extract.vue` use `usePdfSelection`. Both dropped the
  "select the first file on mount" behaviour, so the input only changes on an
  explicit pick; switching folders keeps it.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24566 bytes at 20:16 |
| 2 Lint | `npx eslint app/pages/pdf app/components/pdf app/components/shared/HeTreeMenu.vue app/composables/usePdfExplorer.ts app/composables/usePdfSelection.ts app/utils/pdfOperations.ts shared/types/pdf.ts` | PASS | exit 0 after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 22/22 specs |
| 4 SFC compile | `FileBrowser`, `FileRow`, `FolderRow`, `FolderTree`, `HeTreeMenu`, `usePdfSelection`, `export.vue`, `extract.vue` | PASS | HTTP 200 for each |

### Not proven

- Selection persistence across folder switches is read from the composable's
  scope, not observed in the running app; the same browser pass covers it.

## Phase 20 — v3 rebuild Phase 4: Data Flow Note and result panel (2026-11-05)

- New [app/components/pdf/DocumentDataFlowNote.vue](../../app/components/pdf/DocumentDataFlowNote.vue)
  renders `Đầu vào → Xử lý → Đầu ra` in one `panel-flat` row (stacked below
  `md`). It takes the strings as props, emits `openOutput`, and never resolves a
  path itself.
- New [app/components/pdf/OperationResult.vue](../../app/components/pdf/OperationResult.vue)
  summarises a finished run: status icon, one line per format, and the area it
  landed in. It renders inside `FileBrowser`'s `flow-note` slot or as its own
  panel, never as a second file list.
- `usePdfExplorer` now keeps `outputMapping` from `GET /workspace` and exposes
  `outputArea(tool)`, so every flow note reads its destination from the server
  mapping instead of hard-coding an area.
- Split, Images, Import, Export and Extract each render a flow note for the
  operation their active area drives, and "open output folder" switches the
  explorer to that area instead of leaving the page.
- Export declares all three destinations: the picked formats map to `images`,
  `office` or `products`, and the note lists the others as "also writes".
  `PdfExportFormatResult` drives `OperationResult`, including the real partial
  state where only some formats succeeded.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24566 bytes at 20:28 |
| 2 Lint | `npx eslint app/pages/pdf app/components/pdf app/composables/usePdfExplorer.ts app/composables/usePdfSelection.ts app/utils/pdfOperations.ts shared/types/pdf.ts app/components/shared/HeTreeMenu.vue` | PASS | exit 0 after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 22/22 specs; `i18n_keys` green |
| 4 SFC compile | the 5 tool pages + the 2 new components | PASS | HTTP 200 for each |

### Not proven

- The notes were not read in a signed-in browser yet. The area labels come from
  the live `GET /workspace` response, which needs the auth session.

## Phase 21 — v3 rebuild Phase 5: one list per page (2026-11-05)

Each tool page now has exactly one `PdfFileBrowser`; the operation panels became
row or folder actions.

| Page | Before | After |
|---|---|---|
| `/pdf/split` | FileBrowser + "Page folders" + "Built PDFs" panels | "Merge to PDF" button on every folder row while browsing `split` |
| `/pdf/images` | FileBrowser + "Image folders" panel | "Build PDF" button on every folder row while browsing `images` |
| `/pdf/import` | FileBrowser + "Created PDFs" panel | panel removed; converted files are browsed in `merged` |
| `/pdf/export` | always-open format panel | format picker + overwrite moved into a modal opened by "Export" |
| `/pdf/extract` | always-open model/preset/format panel + results panel | settings modal opened by "Start extraction"; results panel removed; **Jobs panel kept** |

Other changes in this phase:

- `split.vue` and `images.vue` no longer compute `split`/`images`/`merged` lists;
  everything comes from the explorer listing.
- Extract lost `outputFormats` and its `localStorage` preference (the server
  always writes five formats), and `force` moved into the settings modal.
- Every operation now navigates the explorer to its output area after a
  successful run, so the result is visible without a second list.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24566 bytes at 20:41 |
| 2 Lint | `npx eslint` over the PDF surface | PASS | exit 0 after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 22/22 specs |
| 4 Panels | `grep -n 'class="panel'` per tool page | PASS | only the action bar, the extract Jobs panel and the import empty-state tiles remain |
| 5 Row lists | `grep -n "PdfOutputFolderRow\\|PdfFileRow" app/pages/pdf/*.vue` | PASS | no matches outside `FileBrowser` |

### Not proven

- No click-through of the new folder actions in a signed-in browser; the wiring
  is covered by the compile gate and the type checks on the emitted payloads.


## Phase 22 — v3 rebuild Phase 6: contract mismatches (2026-11-05)

Every option the UI offered but the server ignored is gone, and every action
that writes now asks first.

| §10 item | Fix | Where |
|---|---|---|
| 10.5 — three codes fell through to 500 | `PDF_FOLDER_NAME_REQUIRED` 422, `PDF_TRASH_ITEM_NOT_FOUND` 404, `PDF_EXPORT_FAILED` 422 added to `PDF_ERROR_STATUS`; the map is exported so a spec can read it | `server/utils/pdfApi.ts` |
| 10.7 — `outputFormats` never reached the server | checkbox, `localStorage` preference and both i18n keys deleted; the five formats are shown as information under `formatsHint` | `app/pages/pdf/extract.vue`, both locales |
| 10.6 — Library overwrite applied to one row action | footer checkbox removed; the quick split opens `PdfConfirmAction` with overwrite defaulting on and names the destination folder | `app/pages/pdf/library.vue` |
| 10.4 — the source-delete confirm promised a cascade that `/directory/delete` did not do | cascade extracted to `removeDerivedOutputs()` and called from `deleteAreaItem` for `sources`, so the explorer path matches `removeSource` | `server/modules/pdf/library.ts`, `server/modules/pdf/directory.ts` |
| 8.3/8.4/8.5 — footer overwrite on tool pages | split, images and import each open `PdfConfirmAction` with the same checkbox; the modal states the real output folder or file name | new `app/components/pdf/ConfirmAction.vue` |
| all six pages — deletes ran with no confirm | export and extract deleted through the explorer silently; now every page routes deletion through `BaseConfirmModal` and the text distinguishes a cascading source delete from a plain one | all six pages |
| extract — a stopped poll read as success | result status now comes from the job record (`failed`/`cancelled` → failed, `queued`/`running` → partial, done with failed pages → partial) | `app/pages/pdf/extract.vue` |
| dead code after the migration | `OutputFolderRow.vue` had no reader once split and images moved to the folder slot, so it is deleted; `PDF_PAGE_SIZE` was declared and never used, so it is deleted too | `app/components/pdf/OutputFolderRow.vue`, `app/utils/pdfStudio.ts` |

The confirm text repeats the naming formulas from `pdfOperations.ts`
(`pdfDocumentStem`, `pdfMergeOutputName`, `pdfImagesToPdfOutputName`,
`pdfConvertOutputName`) rather than inventing new strings, so a change to a
formula breaks one spec instead of silently mislabelling the modal.

Not done, deliberately: §8.6 asks for the data formats to be disabled when a
source has no AI cache. No v3 endpoint reports cache availability, so the
picker would have to guess; guessing would either block a valid export or
promise one that fails with `PDF_NO_ROWS`. The routing note in the flow note
and the `PDF_NO_ROWS` error message carry that information instead.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24569 bytes at 21:59 |
| 2 Lint | `npx eslint` over pages, pdf components, the two composables, `pdfOperations`, `pdfStudio`, shared types, `HeTreeMenu`, `directory.ts`, `library.ts`, `pdfApi.ts`, `pdf_contract.spec.ts` | PASS | exit 0 after the last regeneration |
| 3 Tests | `pnpm test` | PASS | 26/26 specs; `pdf_contract.spec.ts` covers 8 assertions |
| 4 SFC compile | the 7 pages + 5 pdf components through Vite | PASS | HTTP 200 for each |

### Not proven

- The cascade was proven on a temp `PDF_DATA_DIR` (spec), not on the real
  workspace through the API.
- No signed-in browser pass over the new modals; the auth gate returns 401
  without a session, so the visual check was not performed.

## Phase 23 — post-commit audit: dynamic keys, area captions, counts (2026-11-06)

A second pass over the rebuilt surface, looking for places where the UI shows
something it cannot actually know.

| Finding | Fix | Where |
|---|---|---|
| Four toast titles rendered the literal string `pdf.actions.deleteItem` (and `renameItem`, `restoreTrash`, `deleteTrashPermanent`): the composable built `pdf.actions.${action}` from a `busy` marker, and those four ids are not key names | `PDF_ACTION_LABELS` maps every action id to its real key; `run()`/`fail()`/`notifySaved()` take `PdfActionId`, so an unmapped id is now a type error | `app/composables/usePdfStudio.ts` |
| Every tool page captioned the list with one fixed area's description, so browsing `products` on the extract page still read "Each file becomes one PDF in the merged folder" | one `AREA_DESCRIPTION_KEYS` map in the explorer; all six pages bind `explorer.areaDescription` | `app/composables/usePdfExplorer.ts`, 6 pages |
| Home mixed counting bases: `extract` showed the products count (an output) while `convertInput` showed its inputs, and no card said which area the number belonged to | every card counts its declared `input.areas[0]` and prints the area name beside the number | `app/pages/pdf/index.vue` |

`tests/unit/pdf_action_labels.spec.ts` pins both halves of the toast fix: every
mapped key exists in `en.json` and `vi.json`, and every id passed to `run()` is
in the map.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24603 bytes at 06:28 |
| 2 Lint | `npx eslint` over the touched PDF surface, `usePdfStudio`, both specs | PASS | exit 0 |
| 3 Tests | `pnpm test` | PASS | 27/27 specs |
| 4 SFC compile | 7 pages + 3 new/edited pdf components through Vite | PASS | HTTP 200, non-empty; dev log has no warnings |
| 5 Dynamic keys | script check of `pdf.status.*`, `pdf.overview.groups.*`, `config.*`, `mapping.tools.*`, `pdf.areas.*` | PASS | all present in both locales (`pdf.areas.word` intentionally absent — `word` is never in the explorer tree) |

### Not proven

- Still no signed-in browser pass: `/api/v1/pdf/*` answers 401 without a
  session, so the counts, captions and toasts were verified statically and by
  compile only.

## Phase 24 — dead surface removal (2026-11-06)

The v3 migration left code and copy with no reader. Everything below was
checked against the whole tree (`app/`, `shared/`, `server/`, `electron/`)
first, and the runtime-composed key families (`pdf.areas.*`,
`pdf.overview.groups.*`, `pdf.overview.config.*`,
`pdf.overview.mapping.tools.*`, `pdf.status.*`, `pdf.workspaces.*`) were
excluded from the scan so a live key could not be mistaken for a dead one.

| Removed | Why it was dead |
|---|---|
| `uploadWord`, `wordToPdf`, `removeWord`, `removeOffice` | no page calls them; `word` is a read-only legacy area no explorer page exposes |
| `removeSource`, `removeSplitFolder`, `removeImagesFolder`, `removeMerged`, `removeProduct` | deletes now go through `explorer.removeItem`, which calls `/directory/delete` |
| the matching `PDF_ACTION_LABELS` ids (`uploadWord`, `wordToPdf`, `removeWord`, `removeOffice`, `removeSource`, `removeFolder`, `removeOutput`) | their `run()` callers are gone, so the label entries had no reader either |
| 98 `pdf.*` i18n keys in each locale | the whole `pdf.convert` namespace (26 keys), the Word-upload block in `pdf.library`, the old panel/table headers in `split`, `images`, `extract`, `export`, `import`, plus `selection.none`, `flow.selectedFile`, `flow.selectedFolder`, `flow.openOutput` |

Both locales stayed identical: 2755 keys each, no en-only or vi-only entry.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24603 bytes at 11:36; the dev-server vue-tsc watcher also ends at "Found 0 errors" |
| 2 Lint | `npx eslint` over the touched PDF surface | PASS | exit 0 |
| 3 Tests | `pnpm test` | PASS | 27/27 specs; `i18n_keys` still green after the purge |
| 4 SFC compile | 7 pages through Vite | PASS | HTTP 200 with non-empty output |

Two intermediate states during this phase produced `vue-tsc` errors in the dev
log (shorthand properties whose functions had just been deleted). They were
fixed in the same phase; the log's final entry is `Found 0 errors`.

### Not proven

- Still no signed-in browser pass over the PDF pages.

## Phase 25 — last orphan removal (2026-11-06)

| Removed | Why it was dead |
|---|---|
| `app/composables/usePdfDirectory.ts` (152 lines) | `usePdfExplorer` replaced it in Phase 2; a tree-wide search across `app/`, `shared/`, `server/`, `tests/` and `electron/` found no reference other than its own definition |

The file held a second, older implementation of folder listing, breadcrumbs
and rename/delete plumbing. Leaving it in place meant two sources of truth for
the same server calls, and any later edit would have had to guess which one the
pages used.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config regenerated to 24585 bytes at 11:43 |
| 2 Lint | `npx eslint` over `pages/pdf`, `components/pdf`, `usePdfStudio`, `usePdfExplorer`, `usePdfSelection`, both new specs | PASS | `LINT_EXIT=0`, run after that regeneration |
| 3 Tests | `pnpm test` | PASS | `TEST_EXIT=0`, 27/27 specs |
| 4 SFC compile | all 7 PDF pages through Vite | PASS | HTTP 200 for `index`, `library`, `split`, `images`, `import`, `export`, `extract` |
| 5 Dead reference | `grep -rn usePdfDirectory` | PASS | no matches (exit 1) |

The dev log still contains older `vue-tsc` errors from the intermediate states
of Phase 24 and a `[Server Error] Missing authorization token` from an
unauthenticated curl. Neither reflects this phase: the watcher converged to
`[vue-tsc] Found 0 errors. Watching for file changes.` and gate 1 above is a
fresh, full run.

### Not proven

- Still no signed-in browser pass over the PDF pages.

## Phase 26 — documentation caught up with the code (2026-11-06)

§17 of the v3 spec lists the docs that must reflect the shipped state. Three of
them still described the pre-rebuild tree, and one claimed the work had not
started.

| File | Was | Now |
|---|---|---|
| `WORKSPACE-UPGRADE-PLAN.md` | v3 "**not started**"; phase 2 Explorer "**Partial** — only `/pdf/library` shows all seven areas"; eight open items that Phases 4–6 closed | v3 "done 2026-11-06"; phase 2 "Done"; closed items struck through with the phase that closed them, and the two genuinely open ones left standing |
| `WORKSPACE-AUDIT.md` | component inventory listed `OutputFolderRow.vue` and `usePdfDirectory.ts` as current; composables table listed only the old pair | inventory lists `ConfirmAction`, `DocumentDataFlowNote`, `OperationResult`, notes the two removals; composables table lists `usePdfExplorer` and `usePdfSelection`; §10 findings marked as fixed by v3 |
| `TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md` (v2) | status table still said the 7-area tree, Data Flow Note and lazy tree were missing; component/state tables named `usePdfDirectory` and `OutputFolderRow` | status table updated with the phase that delivered each; new components added; state table describes the three-way split (explorer / selection / view prefs) |
| `TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md` (this spec) | no status line; §0.1 and §1 read as current code | status paragraph added: Phases 0–6 done, 7 optional, 8 out of scope, §12 not started; §0.1/§1 explicitly labelled as the pre-rebuild snapshot and the two removed symbols called out |

The spec keeps its pre-rebuild sections verbatim: they are the evidence for why
the rebuild happened, and rewriting them would erase the audit trail. The new
paragraph tells a reader where the current state lives instead.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24585 bytes at 11:56 |
| 2 Lint | `npx eslint` over the touched PDF surface + both new specs | PASS | `LINT_EXIT=0`, after that regeneration |
| 3 Tests | `pnpm test` | PASS | `TEST_EXIT=0`, 27/27 specs |
| 4 Docs links | every relative link in `docs/pdf/*.md` resolved against the filesystem | PASS | 0 broken |

Only Markdown changed in this phase, so the gates above confirm the edits did
not disturb the code surface they describe.

## Phase 27 — row feedback, explorer refresh, honest labels (2026-11-06)

A read-through of the five tool pages plus `FileBrowser` and `usePdfExplorer`,
looking for state that could never match its source of truth.

| Finding | Why it was wrong | Fix |
|---|---|---|
| Four row spinners compared `activeSource` / `converting` against `file.path` | The markers are stored as `file.relativePath \|\| file.name`, but `PdfFileInfo.path` is the **absolute** on-disk path. The comparison never held, so the "Split"/"Rasterize"/"Convert" button never showed its spinner and the row looked frozen for the whole run | compare against the same identifier the action stores, in `library`, `split`, `images`, `import` |
| `loadExplorer()` reset `loadedChildren` to `{}` on every reload | The shallow tree endpoint returns only the first level. Any folder the user had expanded collapsed to an empty list after an upload, split or delete — and `expand()` refuses to re-fetch while `loadedChildren[key]` is absent… it was absent, so the folder stayed open with no children until a manual collapse | re-fetch the keys that were loaded before the reload, in parallel; a failed re-fetch is left out of the map so the next expand retries instead of caching an empty folder |
| `split.vue` computed a `file` it could never reach | The `find()` ran before the `activeSource` branch that returns, and `activeSource` is the only way the lookup could ever have produced a value | removed the dead lookup |
| `export.vue` captioned the browser "Source PDF" regardless of the browsed area | every other page names the active area; export alone showed a fixed label while the user browsed `images`/`products`/`office` | title is `pdf.areas.<activeArea>`, and the now-unused `pdf.export.source` key is gone from both locales |
| Delete dialogs named the row after its path | `extract.vue` and `export.vue` passed only `path`, so the confirm read `Delete "bang_gia/page_0001.pdf"` instead of the file name | both take `name` and fall back to the path |

`tests/unit/pdf_contract.spec.ts` gained two guards: no page compares a row
marker against `file.path`, and `loadExplorer` must re-fetch the previously
opened keys rather than clear them.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24585 bytes at 12:17 |
| 2 Lint | `npx eslint` over `pages/pdf`, `components/pdf`, three composables, both specs | PASS | `LINT_EXIT=0` after the config regeneration and after `--fix` rewrote one regex to `\n {2}\}` |
| 3 Tests | `pnpm test` | PASS | `TEST_EXIT=0`, 27/27 specs; the contract spec now runs 10 assertions |
| 4 SFC compile | all 7 PDF pages through Vite | PASS | HTTP 200 |
| 5 i18n parity | flattened key sets of both locales | PASS | 2754 keys each, no en-only or vi-only entry |

### Not proven

- Still no signed-in browser pass. The spinner fix in particular is a visual
  behaviour: the static guard proves the comparison now uses a comparable
  value, not that the spinner renders during a real split.

## Phase 28 — `removeInput` was dead client code (2026-11-06)

`usePdfStudio.removeInput()` called `DELETE /inputs/<name>` and reported
`pdf.notices.removed`, but no page or component ever called it: the explorer's
delete already goes through `/directory/delete`. The server route stays (it is
a public API the app is not the only caller of); only the unused client
wrapper, its `PDF_ACTION_LABELS` entry and the two now-unread locale strings
were removed.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24585 bytes at 12:25 |
| 2 Lint | `npx eslint` over the same surface | PASS | `LINT_EXIT=0` |
| 3 Tests | `pnpm test` | PASS | `TEST_EXIT=0`, 27/27 specs |
| 4 SFC compile | all 7 PDF pages through Vite | PASS | HTTP 200 |
| 5 i18n parity | flattened key sets | PASS | 2752 keys each (two removed per locale), no drift |

## Phase 29 — unnamed exports with no reader (2026-11-06)

A script compared every name in the three PDF composables' return objects
against all of `app/` and `tests/`, so the check could not be fooled by a
destructuring site the earlier greps missed.

| Removed | Why it was dead |
|---|---|
| `usePdfStudio.jobDetail()` | no caller; the extract page reads progress from the `jobs` list it already polls, and `GET /extract/<id>` stays available to the API |
| `usePdfExplorer.directoryListing` | the pages read `folders`/`files`/`breadcrumbs`/`parentFolder`; the raw listing was never destructured |
| `usePdfExplorer.outputMapping` | pages call `explorer.outputArea(tool)`; `index.vue` keeps its own copy from the same report |
| `usePdfExplorer.rules` | used internally for permissions; no page asked for the helper itself |

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24585 bytes at 12:31 |
| 2 Lint | `npx eslint` over the same surface | PASS | `LINT_EXIT=0` |
| 3 Tests | `pnpm test` | PASS | `TEST_EXIT=0`, 27/27 specs |
| 4 SFC compile | all 7 PDF pages through Vite | PASS | HTTP 200 |
| 5 Export check | names in each composable's return object vs every `app/` + `tests/` file | PASS | no unused name left |

## Phase 30 — confirmations and preview actions that could not work (2026-11-06)

Reading the remaining components (`TrashModal`, `PreviewFile`, `FileActions`,
`usePdfMenus`, `FolderRow`) instead of only the pages.

| Finding | Why it was wrong | Fix |
|---|---|---|
| "Empty trash" asked for confirmation; the per-item "Delete permanently" button did not, although it is the same irreversible disk erase | one click on a trash-row icon destroyed a file, while the bulk equivalent asked first | single delete now opens its own `BaseConfirmModal` naming the item (`pdf.trash.deletePermanentDesc`) |
| The DOCX fallback offered "Convert to PDF" for every `.docx`, in every area | `POST /inputs/<name>/pdf` resolves the name through `inputs/` (plus the legacy `word/`), so a DOCX opened from `office/` or `products/` always failed with `PDF_INPUT_NOT_FOUND` | the button is only rendered for `inputs`/`word`; elsewhere the panel explains why (`pdf.preview.docxNoConvert`) |

`TrashModal` is reached from `library` and `import`, so both pages inherit the
confirmation without touching them.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24585 bytes at 15:20 |
| 2 Lint | `npx eslint` over `pages/pdf`, `components/pdf`, three composables, both specs | PASS | `LINT_EXIT=0` |
| 3 Tests | `pnpm test` | PASS | `TEST_EXIT=0`, 27/27 specs |
| 4 SFC compile | 8 pages (incl. `preview`) + 6 pdf components through Vite | PASS | HTTP 200 each |
| 5 i18n parity | flattened key sets | PASS | 2754 keys each, zero drift |

### Not proven

- The trash confirmation and the hidden convert button are interaction states;
  no signed-in browser pass was possible, so both are verified by compile and
  by reading the code path they guard.

## Phase 31 — 18 more unreachable `pdf.*` keys (2026-11-06)

Re-ran the dead-key scan after the recent code cuts, this time comparing every
flattened `pdf.*` key against the whole of `app/`, `shared/`, `server/` and
`tests/`, with the runtime-composed families excluded
(`pdf.areas.*`, `pdf.status.*`, `pdf.overview.groups.*`,
`pdf.overview.config.*`, `pdf.overview.mapping.tools.*`, `pdf.workspaces.*`,
`pdf.operations.*`, `pdf.errors.*`).

Each of the 18 was then grepped individually as `'<key>'` to confirm nothing
built it at runtime:

| Removed group | Keys |
|---|---|
| Word-era actions | `actions.uploadWord`, `actions.wordToPdf`, `actions.removeWord`, `actions.removeOffice`, `notices.wordToPdfDone` |
| Per-area deletes replaced by the explorer | `actions.removeSource`, `actions.removeFolder`, `actions.removeOutput` |
| Old panel and column headings | `split.folders`, `split.merged`, `images.folders`, `import.inputs`, `export.data`, `extract.results`, `library.empty` |
| Unused controls | `actions.preview` (preview is `actions.previewWindow`), `extract.presetNew` / `extract.presetEdit` (`presetNewTitle` / `presetEditTitle` are the live pair) |

| Gate | Command | Result | Evidence |
|---|---|---|---|
| 1 Types | `npx nuxt typecheck` | PASS | `TC_EXIT=0`, 0 × `error TS`; config 24585 bytes at 15:27 |
| 2 Lint | `npx eslint` over the same surface | PASS | `LINT_EXIT=0` |
| 3 Tests | `pnpm test` | PASS | `TEST_EXIT=0`, 27/27 specs; `i18n_keys` green |
| 4 SFC compile | 8 PDF pages through Vite | PASS | HTTP 200 |
| 5 i18n parity | flattened key sets | PASS | 2736 keys each (18 removed per locale), zero drift |
