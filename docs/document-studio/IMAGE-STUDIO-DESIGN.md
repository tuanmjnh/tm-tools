# Image Studio — Watermark & Background Removal

**Status:** approved design, not implemented.
**Date:** 2026-11-17
**Approved decisions:** AI mode included (option a); three watermark modes
(manual, batch, auto-detect); fill by surrounding pixels.

---

## 1. Why this lives inside Document Studio

Two new operations join the existing `image` group on the Document Studio home
page (`DOCUMENT_STUDIO_GROUPS` already contains `rasterize` and `images-to-pdf`).

Keeping them inside buys the whole job machinery for free: job records,
artifacts, retention, the activity page, the batch pool, progress reporting and
the output-folder contract. A separate tree would either duplicate that or force
it to become generic — more work than the feature itself, for no user-visible
gain.

The engine still gets its own folder, mirroring how `server/modules/pdf/` sits
beside `server/modules/document/`:

```
server/modules/image/     engine: decode, encode, watermark, background
```

That boundary is the part worth keeping clean, and it needs no new app tree.

---

## 2. Decisions

| Question | Decision | Why |
|---|---|---|
| Operation names | `image.watermark-remove`, `image.background-remove` | The input is an image, so a `pdf.` prefix would be wrong. Existing `pdf.rasterize` keeps its name: renaming it would orphan job records that already reference it. |
| Segmentation model | **ISNet** (`isnet-general-use`, 178 MB) | Better on hair, edges and thin objects than U2Net at the same size. Measured: HTTP 200, `content-length: 178648008`. |
| Inference runtime | **`onnxruntime-web` (WASM)**, not `onnxruntime-node` | 150 MB vs 307 MB, and no native module to rebuild against the Electron ABI. **Verified under Node:** session created, inference returned `[1,2,3,4]` for an Identity graph. |
| Order of work | watermark → chroma key → AI | The first two need no download and ship value immediately; AI needs download infrastructure that is easier to build once the rest is proven. |

### What the user downloads

The AI mode is opt-in and pulls **~328 MB** (178 MB model + 150 MB runtime) into
`resources/`. The UI must show that number before the download starts, not after.

---

## 3. Operations

### 3.1 `image.watermark-remove`

```
input       single-file, png/jpg/jpeg/webp, max 50 MB
config      componentKey: 'watermark'
output      single PNG,  {stem}_clean.png
execution   inline, supportsProgress: true
batch       per-file, maxFiles: 50
runtime     local + electron; disabled on vercel ('native-canvas-unavailable')
```

Three modes, one shared region type:

```ts
interface WatermarkRegion { x: number, y: number, width: number, height: number }
```

| Mode | Behaviour |
|---|---|
| **manual** | Canvas overlay; drag a rectangle; the config component reports the region in source pixels plus its ratio of the image. |
| **batch** | One region selected once, stored as **ratios** (`x/w`, `y/h`, …). Applied to every file whose aspect ratio is within 2%. A file outside that tolerance is skipped with a reason, never cropped blindly. |
| **auto** | Scans the four corners for a band whose local contrast differs from its surroundings, proposes a region, and **waits for confirmation**. It never writes an output on its own: deleting part of a user's image without consent is not worth the convenience. |

### 3.2 Fill strategy

Sample the ring of pixels just outside the selected region, take the per-channel
median, and flood that value inward with a soft gradient so the seam is not a
hard edge.

**Stated limitation, shown in the UI:** this works on flat or gently graded
backgrounds. Over detailed content (text, pattern, photo) it leaves a visible
patch. The UI says so rather than promising a seamless result — and the AI mode
exists for the cases where the simple fill is not enough.

### 3.3 `image.background-remove`

```
input       single-file, png/jpg/jpeg/webp, max 50 MB
config      componentKey: 'background'
output      single PNG with alpha, {stem}_nobg.png
execution   inline, supportsProgress: true
batch       per-file, maxFiles: 50
runtime     local + electron; disabled on vercel
```

| Mode | Behaviour |
|---|---|
| **chroma** | Eyedropper picks the backdrop colour; a tolerance slider sets the alpha cut-off. Exact and instant; the UI states it needs a fairly uniform backdrop. |
| **ai** | ISNet through WASM. Produces a soft alpha matte. Requires the model; the config panel shows either the installed state or a download button with the real size. |

When the model is absent, `ai` is present but disabled with
`availability: 'model-missing'` and a link to install it. It is never silently
greyed out with no explanation.

---

## 4. Components

```
server/modules/image/
  decode.ts        bytes → { data: ImageData, width, height }
  encode.ts        ImageData → PNG bytes (alpha preserved)
  watermark.ts     locateRing + fillFromRing
  background.ts    chromaKey + matteFromMask
  matte.ts         adapter: ISNet session → alpha mask
  model-store.ts   resolve/verify/download the model under resources/models/

app/components/document-studio/operations/configs/
  WatermarkConfig.vue   overlay canvas, mode switch, region report
  BackgroundConfig.vue  mode switch, eyedropper, tolerance, model state
```

Each unit has one job: `decode`/`encode` know nothing about watermarks; `matte`
knows nothing about jobs; `model-store` knows nothing about pixels.

---

## 5. Model installation

Follows the existing `/system/tools` pattern rather than bundling:

- model lives at `resources/models/isnet-general-use.onnx`
- runtime is a normal dependency (`onnxruntime-web`)
- resolution mirrors `resolveBundledTool`: an env override first, then the
  bundled path, then "not installed"
- a SHA-256 check runs after download; a mismatch deletes the file and reports
  it, so a truncated download is never used

Download itself is a new server route; it streams to a temp file and renames on
success, so an interrupted download cannot look complete.

---

## 6. Runtime policy

| Runtime | watermark | background |
|---|---|---|
| local | enabled | enabled |
| electron | enabled | enabled (chroma + AI after model install) |
| vercel | **disabled** — native canvas unavailable | **disabled** — same |
| worker | not defined yet | not defined yet |

`SCRATCH_MULTIPLIER` takes the largest input; both operations need roughly the
decoded bitmap plus a copy: `4` is a safe figure and matches `images-to-pdf`'s
order of magnitude rather than `rasterize`'s 8.

---

## 7. Testing

**Unit (pure, no model):**
- `fillFromRing` on a synthetic red field with white text → the region becomes
  red within a tolerance; the ring outside is untouched.
- `chromaKey` on a two-colour image → alpha 0 on the backdrop, 255 on the
  subject, and a tolerance of 0 changes nothing.
- Batch mode rejects a file whose aspect ratio is outside the tolerance and says
  why.
- `model-store` reports "not installed" instead of throwing when the file is
  absent, and rejects a file whose hash does not match.

**Integration (real files):**
- one PNG through each watermark mode, asserting output dimensions equal input
- one PNG through chroma and AI, asserting the output has an alpha channel

**Browser:**
- drag a region on the overlay canvas, confirm the reported region matches the
  drawn rectangle in source pixels (canvas may be scaled on screen)

**Gate:** `pnpm typecheck`, `pnpm lint`, `pnpm test`. No new spec may weaken an
existing guard.

---

## 8. Out of scope

- Brush/eraser editing; only rectangular regions.
- Perspective or rotated region selection.
- Video frames.
- Inpainting with a model (content-aware fill). The simple fill is the stated
  design; adding a generative fill is a separate decision with its own quality
  story.

---

## 9. Open risk

The AI path is the only part that cannot be fully verified without the 178 MB
model on disk. The mitigation is that `matte.ts` is written against an interface
(`mask from image`) that a small stub model can satisfy in tests, so the
pipeline is proven before the real model is installed. If ISNet's real
output shape differs from the interface, that is discovered on first install —
which is why the install step includes a self-test on a bundled 64×64 fixture.

---

## 10. Implemented — model install path (2026-11-17)

The AI background-removal model is now obtainable at runtime; the design above
(§5) is realised by `server/modules/image/model-installer.ts`.

| Concern | Resolution |
|---|---|
| Source | Official rembg v0.0.0 release: `danielgatis/rembg` → `isnet-general-use.onnx` (178,648,008 bytes). Verified against the asset byte-for-byte. |
| Integrity | SHA-256 `60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a`, embedded as the default. `IMAGE_MODEL_SHA256` overrides it; the hash is checked **before** the file is renamed into place. |
| Location | The writable data dir, not the read-only install dir: `IMAGE_MODEL_PATH` → `TOOLS_DATA_DIR/models/isnet-general-use.onnx` (`userData` under Electron, `.data` in dev, `/tmp` on a serverless host). The old cwd-relative path was wrong for a packaged app. |
| Download | Streams to `<target>.part`, reports percent, then atomically renames. A hash mismatch or non-2xx deletes the partial and throws — a truncated file never looks installed. Single-flight so a second click cannot start a second 178 MB transfer. |
| Surface | `GET /api/v1/documents/image-model/status` (installed/verified/expectedBytes/version) and `POST …/install` (authed, local/electron only). The AI mode in `BackgroundConfig.vue` shows the state, the real size before download, live progress, and retry on failure. |

**Important:** the `.onnx` is **not** shipped in the installer
(`electron-builder.yml` excludes `**/*.onnx`); it is downloaded on first use into
the data dir. The model is therefore a runtime artifact, not a packaged asset.

**Verification:** `image_model_install.spec.ts` (8/8) covers path/hash defaults,
verify accept/reject, streaming install + atomic rename, hash-mismatch cleanup
and non-2xx rejection. Real-runtime: the official on-disk file reports
`installed: true, verified: true, bytes: 178648008`. Gate ladder:
typecheck 0 errors, eslint 0, `pnpm test` **80/80**.
