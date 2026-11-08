# Document Studio v5 Implementation Status & Baseline Audit (Phase P0)

**Date**: 2026-11-08  
**Baseline Commit**: `01aeae96ae85787d97994981eae35b1ce3f784ab`  
**Active Branch**: `feat/document-studio-v5`  
**Quality Status**:
- `pnpm test:unit`: 40/40 tests PASSED (100% green)
- `pnpm check:hygiene`: CLEAN (no rogue `.js` emitted files)
- `pnpm typecheck`: PASSED (0 errors)
- `pnpm build`: PASSED (Full client + Nitro server build completed)

---

## 1. Inventory of Active Pages & Route Ownership

### Document Studio v5 Pages (`app/pages/document-studio/`)
| Route / Page | File | Status & Notes |
| :--- | :--- | :--- |
| `/document-studio` | `app/pages/document-studio/index.vue` | Active Dashboard / Hub entry |
| `/document-studio/activity` | `app/pages/document-studio/activity.vue` | Active Job Activity log; needs P4 action fixes (Open OS vs inline Preview vs Download) |
| `/document-studio/settings` | `app/pages/document-studio/settings.vue` | Active configuration page |
| `/document-studio/library` | *Pending P1* | To be introduced with two roots: `input` and `output` |
| `/document-studio/tools/[slug]` | *Pending P1* | Dynamic tool operation runner replacing individual static pages |
| `/document-studio/tools/split` | `app/pages/document-studio/tools/split.vue` | Static v4 tool page (to be unified via `[slug]`) |
| `/document-studio/tools/merge` | `app/pages/document-studio/tools/merge.vue` | Static v4 tool page (to be unified via `[slug]`) |
| `/document-studio/tools/images` | `app/pages/document-studio/tools/images.vue` | Static v4 tool page (to be unified via `[slug]`) |
| `/document-studio/tools/images-to-pdf` | `app/pages/document-studio/tools/images-to-pdf.vue` | Static v4 tool page (to be unified via `[slug]`) |
| `/document-studio/tools/convert` | `app/pages/document-studio/tools/convert.vue` | Static v4 tool page (to be unified via `[slug]`) |
| `/document-studio/tools/export` | `app/pages/document-studio/tools/export.vue` | Static v4 tool page (to be unified via `[slug]`) |

### Legacy PDF Pages (`app/pages/pdf/`)
| Route / Page | Callers / Composables Used | Migration Target |
| :--- | :--- | :--- |
| `/pdf/index` | `usePdfStudio` | Legacy PDF home; redirects to `/document-studio` in P6 |
| `/pdf/library` | `usePdfStudio`, `usePdfExplorer` | Legacy 11-area file browser; redirects to `/document-studio/library` in P6 |
| `/pdf/extract` | `usePdfStudio`, `usePdfExplorer`, `/api/v1/pdf/extract/**` | Legacy AI extraction UI; to be migrated into Document Job pipeline (`AiExtractionExecutor`) in P3 |
| `/pdf/split`, `/pdf/images`, `/pdf/export`, `/pdf/import`, `/pdf/preview` | `usePdfStudio`, `usePdfExplorer` | Legacy PDF operations; compat redirects to `/document-studio/tools/*` in P6 |

---

## 2. Inventory of Callers & Legacy Bindings

### Composables
- **`usePdfStudio`**: Used in `app/pages/pdf/*.vue`, `app/components/pdf/PreviewFile.vue`, `app/components/pdf/TrashModal.vue`, `app/pages/index.vue`.
  - *Standard*: Must NOT be imported in any new `app/pages/document-studio/**` pages.
- **`usePdfExplorer`**: Used in legacy PDF tool pages.
  - *Standard*: Replaced by `useDocumentFiles` / new Document Library explorer in `document-studio/library.vue`.

### Backend API Routes
- **`/api/v1/pdf/**`**:
  - `/api/v1/pdf/extract/models`, `/api/v1/pdf/extract/presets`, `/api/v1/pdf/file`, `/api/v1/pdf/inspect`, etc.
  - *Standard*: Keep as backward-compatibility adapters during transition; no breaking deletions until P6 audit.

---

## 3. Data Root Inventory (`.data/pdf/`)

Physical layout verified on disk:
- Legacy input areas: `sources/`, `inputs/`, `word/`
- Legacy output areas: `split/`, `images/`, `merged/`, `products/`, `office/`
- System state: `checkpoints/`, `presets.json`, `.trash/`, `audit.jsonl`
- Canonical v5 directories: `input/`, `output/`, `.system/`

---

## 4. Phase Execution Roadmap

```
[x] P0: Audit & Baseline Freeze (Complete)
[ ] P1: Route & Component Foundation (/document-studio/library + tools/[slug].vue)
[ ] P2: Format Registry & Conversion Matrix
[ ] P3: AI Extraction Integration into Document Job Pipeline
[ ] P4: Activity Action Fixes (OS Open vs Preview vs Download)
[ ] P5: Legacy Data Migration (Dry-run, Checksum Verification, Non-destructive)
[ ] P6: Cutover & Legacy Redirects
```

