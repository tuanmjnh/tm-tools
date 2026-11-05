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
