# Document Studio v5 Implementation Status & Completion Report

**Date**: 2026-11-08  
**Branch**: `feat/document-studio-v5`  
**Quality Verification Gates (All Passed)**:
- `pnpm test:unit`: 40/40 tests PASSED (100% green)
- `pnpm check:hygiene`: CLEAN (no rogue `.js` emitted files)
- `pnpm typecheck`: PASSED (0 errors via `vue-tsc --noEmit`)
- `pnpm build`: PASSED (Production client + Nitro server compiled successfully)

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

- `pnpm test:unit`: 40/40 test suites passing.
- `pnpm check:hygiene`: Clean tree.
- `npx vue-tsc --noEmit`: 0 TypeScript errors across frontend and backend (`tsconfig.app.json` and `tsconfig.server.json`).
- `pnpm build`: Successful production build (`node .output/server/index.mjs`).

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
