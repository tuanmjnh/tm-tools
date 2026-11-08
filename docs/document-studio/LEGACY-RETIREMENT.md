# Legacy retirement audit — Phase 9

The rule from the completion guide §9.1: nothing legacy is removed until the v4
path has parity **and** every consumer has moved. This document records the
consumer map and what is deliberately kept.

## 1. What is still shipped

| Surface | Count | Consumers | Retire? |
| --- | --- | --- | --- |
| `/api/v1/pdf/**` routes | 48 | `usePdfStudio`, `usePdfExplorer`, `/pdf/*` pages, `PreviewFile`, `TrashModal` | **no** |
| `/pdf/extract` + `/api/v1/pdf/extract/**` | 8 routes | `/pdf/extract` page | **no** — Phase 7 kept it by design |
| `/pdf` explorer pages | 9 | the app navigation | **no** |
| `app/components/pdf/**` | shared explorer/browser | every `/pdf/*` page | **no** |
| `server/modules/pdf/**` engines | all | v4 executors + legacy routes | **no** — shared on purpose |

## 2. Cross-module import direction

```
server/modules/document/**  ──imports──►  server/modules/pdf/**   (engines only)
server/modules/pdf/**       ──imports──►  (nothing from modules/document)
server/api/v1/documents/**  ──imports──►  modules/document/**
server/api/v1/pdf/**        ──imports──►  modules/pdf/**
app/pages/document-studio/**  ──imports──►  app/composables/useDocument*
app/pages/pdf/**              ──imports──►  app/composables/usePdf*
```

Verified with a grep for the reverse direction (`modules/document` inside
`modules/pdf` or `api/v1/pdf`): **zero hits**. The two API families therefore
have no shared mutable state and either can be removed without touching the
other.

## 3. Parity status per operation

| Legacy page | v4 page | Engine parity | Input-model parity | Retirement |
| --- | --- | --- | --- | --- |
| `/pdf/split` → split a source | `/document-studio/tools/split` | same `splitPdf` | yes | blocked: legacy also merges a **folder** |
| `/pdf/split` → merge a folder | *(none)* | same `mergePdfFolder` | **no** — v4 merges a selected, ordered file list | keep legacy |
| `/pdf/images` → PDF→PNG | `/document-studio/tools/images` | same `rasterizePdf` | yes | possible, but the page also serves as the preview hub |
| `/pdf/images` → PNG→PDF | `/document-studio/tools/images-to-pdf` | same `imagesToPdf` | **no** — selected files vs folder | keep legacy |
| `/pdf/import` | `/document-studio/tools/convert` | same `inputBufferToPdf` | partial — legacy offers library browsing | keep legacy |
| `/pdf/export` | `/document-studio/tools/export` | same `writeProducts`/`pdfToDocx` | yes for docx/pdf; tabular formats still need cached extraction rows | keep legacy |
| `/pdf/extract` | *(none)* | same engine, now with fingerprints | — | keep; Phase 7 added durability, not a second UI |
| `/pdf/library` | *(none)* | — | — | keep; it is the only folder browser |

Nothing reaches "retire" this phase. The two real blockers are structural, not
technical debt to be cleaned up later:

1. **Merge/convert folder input.** v4 takes an ordered selection; the legacy
   pages operate on a folder. Both are legitimate product models, and removing
   the folder model would remove a capability.
2. **Preview and library.** `/pdf/images` and `/pdf/library` are the only
   browsers of stored files. v4 does not replace them.

## 4. What Phase 9 did change

- `readCachedRows` (used by the export executor and `source-export`) now reads
  both checkpoint layouts: the flat pre-fingerprint directory and the newest
  `v<n>-<hash>` subdirectory. Without that, every export after a fingerprinted
  extraction would have found no rows — a real regression, fixed rather than
  documented as a limitation.
- No route, page, component or engine was deleted.
- No user data under `.data/pdf` was moved.

## 5. Preconditions before anything is retired

1. A folder-input model exists in v4 for merge and image→PDF, or the user
   explicitly accepts losing it.
2. `/pdf/library` and the preview flow have a v4 equivalent, or remain.
3. A signed-in browser pass confirms the v4 pages do everything the legacy page
   did. That pass is still **NOT VERIFIED**.

Until 1–3 hold, the legacy surface stays. Deleting it now would remove working
features, which the guide forbids.
