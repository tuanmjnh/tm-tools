# Document Studio — Format Expansion Plan

**Status:** proposal, nothing implemented yet.
**Date:** 2026-11-17
**Basis:** measured against the working tree, not the v5 documents. Every claim below
about what exists comes from `server/modules/document/operations.ts`,
`shared/types/document/formats.ts` and the engines under `server/modules/pdf/`.

---

## 1. What exists today

Seven operations were registered when this plan was written; ten exist now
(see §7 for the three added since — two image-cleanup ops and `image.convert`):

```
pdf.split              pdf.merge            pdf.rasterize
pdf.images-to-pdf      document.convert-to-pdf
pdf.export             document.ai-extract
```

The conversion matrix already declares 19 edges. Fifteen are `available: true`;
four are declared but disabled with `reasonDisabled: 'Not implemented'`.

| Source | Target | Strategy | State |
|---|---|---|---|
| pdf | pdf | binary | available (split, merge) |
| pdf | png | layout | available, local/electron only |
| png, jpg | pdf | layout | available |
| docx, xlsx, csv, json, xml | pdf | layout | available |
| pdf | docx | layout | available |
| pdf | xlsx, csv, json, xml | structured-data | available (needs cached AI rows) |
| xlsx → docx, docx → xlsx, xml → json, json → xml | | | **declared, not implemented** |

Engines already installed: `pdf-lib`, `pdf-to-img`, `mammoth`, `docx`, `exceljs`.

**What is genuinely missing for the formats you asked about:**

- **Icon** — nothing. No `svg`, `ico`, `icns` in the format registry, no engine.
- **Word** — `docx` reads only. `doc` (legacy binary) is declared in
  `DOCUMENT_FORMAT_IDS` but has no converter; it is not in
  `document.convert-to-pdf`'s accepted extensions.
- **Excel** — `xlsx` reads to PDF. `xls` (legacy) is declared but unsupported.
  `csv → xlsx` and `xlsx → csv` are not implemented.
- **Image** — `png`/`jpg` → PDF and PDF → PNG exist. `webp` is declared in the
  format IDs but is **not** in `pdf.images-to-pdf`'s accepted list
  (`IMAGES = ['png','jpg','jpeg']`), and no image↔image conversion exists.

This gap between "declared" and "runs" is the main risk: a user sees `webp` in
the picker, picks it, and the operation rejects the file.

---

## 2. Principle for this expansion

One rule, taken from the v5 contract and worth restating because it decides the
shape of everything below:

> A conversion is reachable only if an executor exists. The UI shows the edges
> the matrix marks `available: true`, and nothing else.

So every item below follows the same three-step shape:

1. Add the engine and an executor.
2. Flip the edge to `available: true` (or add it).
3. Add the capability note the user needs to judge the result
   (`layout` reconstruction is not pixel-identical; `ai-assisted` needs a model).

No new page per conversion — the existing Convert page picks its edges from the
matrix.

---

## 3. Phases

Each phase is independently shippable and independently verifiable.

### Phase A — Close the declared-but-missing gap (no new engines)

**Why first:** these are promises already in the code. A user can select a format
the app then refuses.

| Work | Detail |
|---|---|
| `webp` → PDF | Add `webp` to the images-to-pdf accepted list. `pdf-lib` already embeds it after a probe. |
| `jpeg` alias audit | `IMAGES` lists `jpg` and `jpeg`; confirm the extension check accepts both everywhere. |
| `xls`, `doc` honesty | Either implement or remove them from `DOCUMENT_FORMAT_IDS` and the picker. Removing a lie is cheaper than shipping one. |

**Verification:** a real `.webp` through `pdf.images-to-pdf` on local and
Electron; the picker no longer offers `xls`/`doc` unless they work.

**Risk:** `pdf-lib` needs `jpeg`/`png` only. `webp` requires decoding to PNG first,
so this phase may pull in an image decoder — confirm before committing to it.

### Phase B — Image format conversion (new, small, deterministic)

**Why:** you asked for image handling, and this is the cheapest real win. An
image→image conversion is `decode → encode`, no layout guessing.

| Edge | Strategy | Engine |
|---|---|---|
| png/jpg/webp → png/jpg/webp | binary | one decoder + one encoder |
| any image → ico | binary | ICO container is a header plus PNG payloads || svg → png | layout | vector rasterise at a chosen size |

**Decision needed:** SVG rasterisation is the only non-trivial piece. Options are
a headless renderer already present (`pdf-to-img` renders PDF, not SVG) or a
dedicated rasteriser. I would **not** start with SVG — it is the one case where
"just convert it" hides real work (fonts, external references, CSS).

**Recommendation:** ship png/jpg/webp ↔ png/jpg/webp and → ico in Phase B.
Treat svg as its own phase (see D).

**Verification:** one file per edge, both directions, byte-size sanity plus a
decoded-dimension check.

### Phase C — Spreadsheet and structured data (deterministic)

**Why:** four edges are declared and off. All are pure data mapping, no model.

| Edge | Needs deciding |
|---|---|
| csv → xlsx | delimiter, encoding, quoting, date/number coercion |
| xlsx → csv | sheet selection (index or name), multi-sheet behaviour |
| xml → json | attributes, namespaces, repeated nodes, mixed content |
| json → xml | root name, arrays, scalar roots, nulls |

**These are the decisions that make or break the feature**, and they are cheap to
get wrong. Each needs a written rule before code, otherwise the first user with a
multi-sheet workbook or a namespaced XML file gets silently wrong output.

**Verification:** one fixture per decision (two-sheet workbook, namespaced XML,
JSON with an array root), asserting the chosen rule, not just "it produced a
file".

### Phase D — Icon pipeline (new subsystem)

**Why it is separate:** icons are not documents. They have size ladders, alpha,
and platform-specific containers.

| Capability | Detail |
|---|---|
| source → png ladder | render at 16/32/48/64/128/256/512 |
| png set → ico | multi-size ICO container |
| png set → icns | macOS container |
| svg → any | requires a vector rasteriser (see Phase B decision) |

**This is the largest single item and the least certain.** ICO and ICNS are
containers; the real work is the SVG rasteriser and the size ladder policy
(padding, nearest vs smooth scaling).

**Recommendation:** scope Phase D to "a PNG set in, a valid ICO/ICNS out" first.
SVG input is a later increment.

### Phase E — Word depth

| Gap | Detail |
|---|---|
| `doc` legacy | Requires an external converter (LibreOffice) or a paid library. **Do not promise it.** Either mark it unavailable in the picker or ship a clear "convert to docx first" path. |
| docx → text/markdown | `mammoth` already produces HTML; a markdown pass is small. |
| pdf → docx quality | Already exists; the capability note must say it is reconstruction. |

---

## 4. What I would do first, and why

Order by **user-visible truth**, then by cost:

1. **Phase A** — makes the picker honest. Small, no new dependency.
2. **Phase C** — four declared edges become real; pure logic, easy to test.
3. **Phase B** — real image conversion; one dependency decision.
4. **Phase E** partial — docx → markdown, and an honest `doc` decision.
5. **Phase D** — icons. Largest, least certain; do it when B's decoder exists.

Phases A and C together remove every "declared but broken" promise, which is the
worst state for a tool that tells users what it can do.

---

## 5. Open questions for you

1. **SVG input** — do you need it, or is "PNG set → ICO/ICNS" enough?
2. **`doc` / `xls` legacy** — implement with an external converter, or remove from
   the picker?
3. **Multi-sheet `xlsx → csv`** — one file per sheet, or first sheet only?
4. **Icon size ladder** — fixed set, or user-chosen?
5. **Cloud runtime** — should any of these run on Vercel, or local/Electron only?
   (Rasterisation and ICO packing are best kept local, as `pdf.rasterize` already is.)

---

## 6. What is not in this plan

- No OCR. It is a separate subsystem with its own accuracy story.
- No format *detection* by content sniffing; the plan works from the extension as
  the current code does.
- No new page per conversion. The Convert page keeps a single form.

---

## 7. Implemented — image ↔ image and image ↔ .ico (2026-11-17)

Phase B (image half) and the `webp → PDF` item from Phase A shipped as the
`image.convert` operation. Measured against the working tree, not promised.

**Operation inventory is now ten**, not seven: `pdf.split`, `pdf.merge`,
`pdf.rasterize`, `pdf.images-to-pdf`, `document.convert-to-pdf`, `pdf.export`,
`document.ai-extract`, `image.watermark-remove`, `image.background-remove`,
`image.convert`. (The §1 list predates the two image-cleanup operations.)

| Capability | Implementation |
|---|---|
| png/jpg/webp → png/jpg/webp | decode → encode on `@napi-rs/canvas` (JPEG flattens alpha onto white) |
| svg → png/jpg/webp | `loadImage(Buffer)` on the SVG, drawn at source size, then encoded |
| image / svg → `.ico` | PNG payloads packed into an `ICONDIR` (`server/modules/image/ico.ts`) |
| ico → png | largest PNG payload read back out of the container |
| webp → PDF | `isImageName` accepts webp; `imagesToPdf` transcodes webp→PNG before `pdf-lib` embeds it |

**No new dependency.** The one open risk from §3 was whether webp rasterisation
would "pull in an image decoder"; `@napi-rs/canvas` was already a direct
dependency (used by image cleanup) and its native module is already in the
packaged app, so square/scale/encode and SVG decode all reuse it.

**ICO size ladder — user picks, with a hard format limit.** The config panel
offers 16/32/48/64/128/256/512 as checkboxes. `ICONDIRENTRY` stores each
dimension in a single byte (0 means 256), so a standard `.ico` cannot hold a
512×512 entry; a selected **512 is exported as a PNG beside the `.ico`**, and the
packer rejects any >256 entry with `ICO_SIZE_TOO_LARGE` rather than writing a
misread icon. An empty/512-only selection falls back to `16/32/48/256`.

**Runtime:** `image.convert` is `local` + `electron` only (native canvas),
disabled on Vercel with `native-canvas-unavailable`, exactly like
`pdf.rasterize`; scratch multiplier 4.

**Verification (real, not typecheck-only):**
- `tests/unit/document_image_convert.spec.ts` — 10/10: ICONDIR bytes
  (reserved/type/count/entries/offsets), 256-as-0 encoding, 512 rejection, size
  normalisation, truncation detection.
- Real-runtime proof: a 300×200 source packed into a valid 6-entry ICO
  (16–256, all PNG-signed, not truncated), re-read from disk; real `.webp`
  through `imagesToPdf` produced a `%PDF-` file.
- Gate ladder: `nuxt typecheck` exit 0 (0 `error TS`), eslint 0 on touched files
  after config regen, `pnpm test` 78/78.

**Phase C (csv↔xlsx, xml↔json) and Phase D (SVG→ICO already covered; ICNS not
built) remain open** — they were not part of this increment.
