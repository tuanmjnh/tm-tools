# Archive — Document Workspace spec v1

> Superseded on **2026-11-05** by
> [`docs/pdf/TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md`](../../pdf/TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md)
> (the v2 revision, now at the canonical filename).

The v1 spec was written before the code was read in depth, so it described a
layout and an architecture this repo never had. It is kept verbatim for history.

## Why it was replaced

| v1 claim | Reality in this repo |
| --- | --- |
| Numbered layout `01-sources/`, `02-pdf-processing/`, `03-images-processing/`, `04-document-conversion/`, `05-extractions/`, `06-exports/`, `99-system/` | Flat areas under `.data/pdf`: `sources`, `inputs`, `word`, `split`, `images`, `merged`, `products`, `office`, plus internal `checkpoints/` and `.trash/` |
| Filesystem behind an Electron main-process preload/IPC allowlist | Nitro server owns the filesystem; the renderer only calls `/api/v1/pdf/*` |
| `sources/` should not exist; `input/` is the only input zone | Both exist with distinct roles: `sources/` = PDFs (`isPdfName`), `inputs/` = docx/xlsx/csv/json/xml/images (`isInputName`) |
| All / Contextual / Recent / Favorites explorer modes | One full tree on every page; mode switch was dropped |
| Suggested IPC method names (`workspace:getInfo`, `documents:listFiles`, …) | HTTP routes under `/api/v1/pdf/*` with `PDF_*` error codes |
| Error codes `PERMISSION_DENIED`, `PATH_OUTSIDE_WORKSPACE`, `SYSTEM_FOLDER_IMMUTABLE`, … | Actual codes: `PDF_FOLDER_IMMUTABLE`, `PDF_INVALID_PATH`, `PDF_FILE_NOT_FOUND`, `PDF_INVALID_EXTENSION`, … |

## Where the current content lives

- Spec (canonical): [`docs/pdf/TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md`](../../pdf/TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md)
- Repo-vs-spec deviations: [`docs/pdf/WORKSPACE-AUDIT.md`](../../pdf/WORKSPACE-AUDIT.md)
- Delivered phases and open items: [`docs/pdf/WORKSPACE-UPGRADE-PLAN.md`](../../pdf/WORKSPACE-UPGRADE-PLAN.md)
- Gate evidence: [`docs/pdf/VERIFICATION.md`](../../pdf/VERIFICATION.md)
