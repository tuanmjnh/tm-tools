# Archive — v3 rebuild spec draft

> Archived on **2026-11-05**, before the v3 spec was rewritten against the code.

## What this is

`TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.draft.md` is the first v3 draft. It was
written from a product description and a multi-runtime proposal, not from the
repository, so several of its premises do not hold here.

Kept verbatim for history; **do not implement from this file**.

## Why it was rewritten

| Draft claim | Reality in this repo |
|---|---|
| There is a `/pdf/merge` route | No such route. Merge is an action on a `split/` folder inside `/pdf/split` |
| The app declares its own Document Studio menu (`Tools / Files / Activity / Settings`) | Sidebar routes come from tm-hub `system_routes` (`tm-hub/scripts/seed/data.ts:362-369`); changing the menu means re-seeding tm-hub plus i18n keys in both locales |
| Explorer tree uses folder checkboxes with multi-select | `HeTreeMenu` always renders a checkbox, but the PDF tree never handles `node:select` — it is a dead control, not a feature |
| An `OperationInputPicker` is needed for multi-file operations | No PDF route accepts more than one input file; the picker has no consumer yet |
| `ERROR` codes such as `PERMISSION_DENIED`, `PATH_OUTSIDE_WORKSPACE` | Real codes are `PDF_*` (`pdfHttpStatus` in `server/utils/pdfApi.ts`) |
| Warp filesystem through Electron main/IPC | Nitro owns the filesystem; `electron/ipcPolicy.cjs` has no PDF channel |

## Where the current content lives

- Spec (canonical): [`docs/pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md`](../../pdf/TM-DOCUMENT-STUDIO-REBUILD-SPEC-v3.md)
- Filesystem / permission contract: [`docs/pdf/TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md`](../../pdf/TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md)
- Repo-vs-spec findings: [`docs/pdf/WORKSPACE-AUDIT.md`](../../pdf/WORKSPACE-AUDIT.md) §10
- Phase status: [`docs/pdf/WORKSPACE-UPGRADE-PLAN.md`](../../pdf/WORKSPACE-UPGRADE-PLAN.md)
- Gate evidence: [`docs/pdf/VERIFICATION.md`](../../pdf/VERIFICATION.md)

## Multi-runtime proposal

The proposal this draft leaned on (temporary workspace + private object storage
+ persistent job metadata) is kept as a **v4 design** in §12 of the canonical v3
spec, with the four blockers found against this repo: wrong proposed layout,
unbundled Vietnamese font, optional native canvas, and `process.cwd()` /
`better-sqlite3` on a read-only serverless filesystem.
