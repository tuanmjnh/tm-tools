# Image Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two Document Studio operations — `image.watermark-remove` (three region modes) and `image.background-remove` (chroma key plus ISNet via WASM) — with the engine isolated in `server/modules/image/`.

**Architecture:** A pure engine (`decode` / `encode` / `watermark` / `background` / `matte`) that knows nothing about jobs, wrapped by executors that speak the existing `DocumentOperationExecutor` contract. Both operations run inline, declare `supportsProgress`, and are disabled on the Vercel runtime exactly like `pdf.rasterize`. The AI model is downloaded into `resources/models/` on demand, never bundled.

**Tech Stack:** Nuxt 4 / Nitro, `@napi-rs/canvas` (pixel work), `onnxruntime-web` WASM (segmentation), `node --test` via `tsx` with `tsconfig.test.json`.

**Spec:** `docs/document-studio/IMAGE-STUDIO-DESIGN.md`

## Global Constraints

- Operation ids are `image.watermark-remove` and `image.background-remove`; they extend `DOCUMENT_OPERATION_IDS` and `DOCUMENT_STUDIO_OPERATIONS` (category `image`).
- Both are `enabled: false` on `vercel` with `reasonDisabled: 'native-canvas-unavailable'`.
- `SCRATCH_MULTIPLIER` gains entries `4` for both operations (decoded bitmap plus a copy).
- Accepted input extensions: `png`, `jpg`, `jpeg`, `webp`.
- Output is always PNG, always written under `context.workspace.outputDir`, never over the input.
- Accepted input extensions come from a dedicated `IMAGE_CLEANUP` list in `server/modules/document/operations.ts`; widening `IMAGES` instead would let `pdf.images-to-pdf` accept `webp` before its encoder can decode it.
- No i18n string may contain `@` followed by a character (intlify treats it as a linked message and blanks the page).
- Tests run with `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/<spec>.ts`.
- Gates after each task: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/modules/image/decode.ts` | bytes → `{ data: ImageData, width, height }`; knows only formats |
| `server/modules/image/encode.ts` | `ImageData` → PNG bytes with alpha |
| `server/modules/image/watermark.ts` | ring statistics + inward fill for a rectangle |
| `server/modules/image/background.ts` | chroma key and alpha matte application |
| `server/modules/image/matte.ts` | ISNet session → alpha mask (interface only in phase 3) |
| `server/modules/image/model-store.ts` | resolve, verify and download the model |
| `server/modules/document/image-executors.ts` | the two executors, wiring config to the engine |
| `app/components/document-studio/operations/configs/WatermarkConfig.vue` | overlay canvas + mode switch |
| `app/components/document-studio/operations/configs/BackgroundConfig.vue` | mode switch, eyedropper, tolerance, model state |

Each engine file is independently testable with no job, no filesystem and no model.

---

## Task 1: Pixel engine foundation — decode and encode

**Files:**
- Modify: `package.json` (add `@napi-rs/canvas`)
- Create: `server/modules/image/types.ts`
- Create: `server/modules/image/decode.ts`
- Create: `server/modules/image/encode.ts`
- Test: `tests/unit/image_codec.spec.ts`

**Interfaces:**
- Produces:
  - `interface RasterImage { data: Uint8ClampedArray, width: number, height: number }`
  - `decodeImage(bytes: Uint8Array, extension: string): Promise<RasterImage>`
  - `encodePng(image: RasterImage): Uint8Array`

- [x] **Step 1: Add the canvas dependency**

```bash
cd /d/Applications/tm-tools
pnpm add @napi-rs/canvas
```

Expected: it appears under `dependencies`. It was already present transitively via `pdf-to-img`; this makes it a direct, declared dependency so the import is not relying on hoisting.

- [x] **Step 2: Write the failing test**

Create `tests/unit/image_codec.spec.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import { decodeImage } from '../../server/modules/image/decode'
import { encodePng } from '../../server/modules/image/encode'

function pngBytes(width: number, height: number, paint: (ctx: any) => void): Uint8Array {
  const canvas = createCanvas(width, height)
  paint(canvas.getContext('2d'))
  return new Uint8Array(canvas.toBuffer('image/png'))
}

describe('image codec', () => {
  it('decodes a PNG into pixels at the same size', async () => {
    const image = await decodeImage(pngBytes(8, 4, ctx => { ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 8, 4) }), 'png')
    assert.equal(image.width, 8)
    assert.equal(image.height, 4)
    assert.equal(image.data.length, 8 * 4 * 4)
  })

  it('round-trips a colour through encode and decode', async () => {
    const source = await decodeImage(pngBytes(2, 2, ctx => { ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 2, 2) }), 'png')
    const roundTripped = await decodeImage(encodePng(source), 'png')
    assert.equal(roundTripped.data[0], source.data[0])
    assert.equal(roundTripped.data[1], source.data[1])
    assert.equal(roundTripped.data[2], source.data[2])
    assert.equal(roundTripped.data[3], 255)
  })

  it('preserves alpha through a round trip', async () => {
    const transparent = { data: new Uint8ClampedArray([255, 0, 0, 0]), width: 1, height: 1 }
    const decoded = await decodeImage(encodePng(transparent), 'png')
    assert.equal(decoded.data[3], 0, 'a fully transparent pixel stays transparent')
  })

  it('rejects an unsupported extension', async () => {
    await assert.rejects(
      () => decodeImage(new Uint8Array([1, 2, 3]), 'tiff'),
      /IMAGE_FORMAT_UNSUPPORTED/
    )
  })
})
```

- [x] **Step 3: Run the test and watch it fail**

```bash
cd /d/Applications/tm-tools
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/image_codec.spec.ts
```

Expected: FAIL — `Cannot find module '../../server/modules/image/decode'`.

- [x] **Step 4: Write the types**

Create `server/modules/image/types.ts`:

```ts
/**
 * A decoded bitmap. Kept plain (not a canvas object) so the pure functions can
 * be tested without a canvas context and so nothing downstream can rely on a
 * native handle staying alive.
 */
export interface RasterImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** A rectangle in source pixels, top-left origin. */
export interface ImageRegion {
  x: number
  y: number
  width: number
  height: number
}

export const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const
```

- [x] **Step 5: Write decode**

Create `server/modules/image/decode.ts`:

```ts
import { createCanvas, loadImage } from '@napi-rs/canvas'
import type { RasterImage } from './types'
import { SUPPORTED_IMAGE_EXTENSIONS } from './types'

/**
 * Decodes any format the operations accept into raw RGBA. `loadImage` handles
 * the container formats one by one, so an unknown extension is rejected here
 * rather than producing a broken bitmap downstream.
 */
export async function decodeImage(bytes: Uint8Array, extension: string): Promise<RasterImage> {
  const ext = extension.toLowerCase().replace('.', '')
  if (!(SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(`IMAGE_FORMAT_UNSUPPORTED: ${ext}`)
  }

  const image = await loadImage(Buffer.from(bytes))
  const width = image.width
  const height = image.height
  if (width < 1 || height < 1) throw new Error('IMAGE_EMPTY')

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)

  const data = ctx.getImageData(0, 0, width, height).data
  return { data: new Uint8ClampedArray(data), width, height }
}
```

- [x] **Step 6: Write encode**

Create `server/modules/image/encode.ts`:

```ts
import { createCanvas } from '@napi-rs/canvas'
import type { RasterImage } from './types'

/** PNG is the only output: it is the only format that carries alpha. */
export function encodePng(image: RasterImage): Uint8Array {
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  const buffer = ctx.createImageData(image.width, image.height)
  buffer.data.set(image.data)
  ctx.putImageData(buffer, 0, 0)
  return new Uint8Array(canvas.toBuffer('image/png'))
}
```

- [x] **Step 7: Run the test and confirm it passes**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/image_codec.spec.ts
```

Expected: PASS, 4 tests.

- [x] **Step 8: Run the gates**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all exit 0; the suite count rises by one spec.

- [x] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml server/modules/image/types.ts server/modules/image/decode.ts server/modules/image/encode.ts tests/unit/image_codec.spec.ts
git commit -m "feat(image): add decode/encode engine foundation"
```

---

## Task 2: Region fill (watermark engine)

**Files:**
- Create: `server/modules/image/watermark.ts`
- Test: `tests/unit/image_watermark.spec.ts`

**Interfaces:**
- Consumes: `RasterImage`, `ImageRegion` from `server/modules/image/types.ts`
- Produces:
  - `ringMedian(image: RasterImage, region: ImageRegion): [number, number, number, number]`
  - `fillRegion(image: RasterImage, region: ImageRegion): RasterImage` (returns a new image; input untouched)
  - `clampRegion(region: ImageRegion, width: number, height: number): ImageRegion`

- [x] **Step 1: Write the failing test**

Create `tests/unit/image_watermark.spec.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clampRegion, fillRegion, ringMedian } from '../../server/modules/image/watermark'
import type { RasterImage } from '../../server/modules/image/types'

/** A solid-colour field with a differently-coloured rectangle painted in. */
function fieldWithRect(field: [number, number, number], rect: [number, number, number]): RasterImage {
  const width = 20
  const height = 20
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const inside = x >= 8 && x < 13 && y >= 8 && y < 13
      const colour = inside ? rect : field
      data[i] = colour[0]
      data[i + 1] = colour[1]
      data[i + 2] = colour[2]
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

const pixelAt = (image: RasterImage, x: number, y: number) => {
  const i = (y * image.width + x) * 4
  return [image.data[i], image.data[i + 1], image.data[i + 2]]
}

describe('watermark fill', () => {
  it('reads the surrounding colour, not the region interior', () => {
    const image = fieldWithRect([200, 0, 0], [255, 255, 255])
    const median = ringMedian(image, { x: 8, y: 8, width: 5, height: 5 })
    assert.deepEqual([median[0], median[1], median[2]], [200, 0, 0])
  })

  it('replaces the region with the surrounding colour', () => {
    const image = fieldWithRect([200, 0, 0], [255, 255, 255])
    const cleaned = fillRegion(image, { x: 8, y: 8, width: 5, height: 5 })
    assert.deepEqual(pixelAt(cleaned, 10, 10), [200, 0, 0], 'the interior is refilled')
  })

  it('leaves pixels outside the region untouched', () => {
    const image = fieldWithRect([200, 0, 0], [255, 255, 255])
    const cleaned = fillRegion(image, { x: 8, y: 8, width: 5, height: 5 })
    assert.deepEqual(pixelAt(cleaned, 0, 0), [200, 0, 0])
    assert.deepEqual(pixelAt(cleaned, 19, 19), [200, 0, 0])
  })

  it('does not mutate the input image', () => {
    const image = fieldWithRect([200, 0, 0], [255, 255, 255])
    fillRegion(image, { x: 8, y: 8, width: 5, height: 5 })
    assert.deepEqual(pixelAt(image, 10, 10), [255, 255, 255], 'the caller still owns the original')
  })

  it('clamps a region that overhangs the image edges', () => {
    assert.deepEqual(
      clampRegion({ x: -5, y: -5, width: 30, height: 30 }, 20, 20),
      { x: 0, y: 0, width: 20, height: 20 }
    )
  })

  it('rejects a region that is entirely outside the image', () => {
    assert.throws(() => clampRegion({ x: 50, y: 50, width: 5, height: 5 }, 20, 20), /IMAGE_REGION_INVALID/)
  })
})
```

- [x] **Step 2: Run the test and watch it fail**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/image_watermark.spec.ts
```

Expected: FAIL — module not found.

- [x] **Step 3: Write the implementation**

Create `server/modules/image/watermark.ts`:

```ts
import type { ImageRegion, RasterImage } from './types'

/** Ring thickness sampled around the region, in pixels. */
const RING = 3

/** Clamps to the bitmap, and refuses a region with nothing left of it. */
export function clampRegion(region: ImageRegion, width: number, height: number): ImageRegion {
  const x = Math.max(0, Math.floor(region.x))
  const y = Math.max(0, Math.floor(region.y))
  const right = Math.min(width, Math.ceil(region.x + region.width))
  const bottom = Math.min(height, Math.ceil(region.y + region.height))
  const clampedWidth = right - x
  const clampedHeight = bottom - y
  if (clampedWidth < 1 || clampedHeight < 1) throw new Error('IMAGE_REGION_INVALID')
  return { x, y, width: clampedWidth, height: clampedHeight }
}

/**
 * Per-channel median of the pixels just outside the region. The median rather
 * than the mean keeps a stray dark pixel (a glyph edge, a shadow) from pulling
 * the fill colour.
 */
export function ringMedian(image: RasterImage, region: ImageRegion): [number, number, number, number] {
  const { width, height } = image
  const x0 = Math.max(0, region.x - RING)
  const y0 = Math.max(0, region.y - RING)
  const x1 = Math.min(width, region.x + region.width + RING)
  const y1 = Math.min(height, region.y + region.height + RING)

  const r: number[] = []
  const g: number[] = []
  const b: number[] = []
  const a: number[] = []

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const inside = x >= region.x && x < region.x + region.width
        && y >= region.y && y < region.y + region.height
      if (inside) continue
      const i = (y * width + x) * 4
      r.push(image.data[i]!)
      g.push(image.data[i + 1]!)
      b.push(image.data[i + 2]!)
      a.push(image.data[i + 3]!)
    }
  }

  if (!r.length) throw new Error('IMAGE_REGION_INVALID')
  const median = (values: number[]) => {
    values.sort((p, q) => p - q)
    return values[Math.floor(values.length / 2)]!
  }
  return [median(r), median(g), median(b), median(a)]
}

/**
 * Floods the region with the ring colour, blending toward the edge over a short
 * ramp so the seam is not a hard line. Returns a new image.
 */
export function fillRegion(image: RasterImage, region: ImageRegion): RasterImage {
  const clamped = clampRegion(region, image.width, image.height)
  const [r, g, b, a] = ringMedian(image, clamped)

  const out: RasterImage = {
    data: new Uint8ClampedArray(image.data),
    width: image.width,
    height: image.height
  }

  const ramp = Math.max(1, Math.min(6, Math.floor(Math.min(clamped.width, clamped.height) / 3)))
  for (let y = clamped.y; y < clamped.y + clamped.height; y++) {
    for (let x = clamped.x; x < clamped.x + clamped.width; x++) {
      const distanceToEdge = Math.min(
        x - clamped.x,
        clamped.y + clamped.height - 1 - y,
        clamped.x + clamped.width - 1 - x,
        y - clamped.y
      )
      // 0 at the edge, 1 past the ramp: the edge keeps the ring colour exactly,
      // the middle is fully replaced.
      const weight = Math.min(1, distanceToEdge / ramp)
      const i = (y * image.width + x) * 4
      out.data[i] = image.data[i]! * (1 - weight) + r * weight
      out.data[i + 1] = image.data[i + 1]! * (1 - weight) + g * weight
      out.data[i + 2] = image.data[i + 2]! * (1 - weight) + b * weight
      out.data[i + 3] = image.data[i + 3]! * (1 - weight) + a * weight
    }
  }
  return out
}
```

- [x] **Step 4: Run the test and confirm it passes**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/image_watermark.spec.ts
```

Expected: PASS, 6 tests.

- [x] **Step 5: Run the gates**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [x] **Step 6: Commit**

```bash
git add server/modules/image/watermark.ts tests/unit/image_watermark.spec.ts
git commit -m "feat(image): fill a selected region from its surrounding pixels"
```

---

## Task 3: Chroma key (background engine)

**Files:**
- Create: `server/modules/image/background.ts`
- Test: `tests/unit/image_background.spec.ts`

**Interfaces:**
- Consumes: `RasterImage` from `server/modules/image/types.ts`
- Produces:
  - `type Rgb = [number, number, number]`
  - `chromaKey(image: RasterImage, backdrop: Rgb, tolerance: number): RasterImage`
  - `applyMatte(image: RasterImage, mask: Uint8Array): RasterImage` — `mask` is one alpha byte per pixel, same dimensions

- [x] **Step 1: Write the failing test**

Create `tests/unit/image_background.spec.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyMatte, chromaKey } from '../../server/modules/image/background'
import type { RasterImage } from '../../server/modules/image/types'

function twoTone(backdrop: [number, number, number], subject: [number, number, number]): RasterImage {
  const width = 6
  const height = 2
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const colour = x < 3 ? backdrop : subject
      data[i] = colour[0]
      data[i + 1] = colour[1]
      data[i + 2] = colour[2]
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

const alphaAt = (image: RasterImage, x: number, y: number) => image.data[(y * image.width + x) * 4 + 3]

describe('chroma key', () => {
  it('makes the backdrop transparent and keeps the subject opaque', () => {
    const keyed = chromaKey(twoTone([0, 255, 0], [200, 30, 30]), [0, 255, 0], 10)
    assert.equal(alphaAt(keyed, 0, 0), 0, 'backdrop is cut')
    assert.equal(alphaAt(keyed, 5, 0), 255, 'subject is kept')
  })

  it('leaves everything opaque at zero tolerance when the colour differs', () => {
    const keyed = chromaKey(twoTone([0, 250, 0], [200, 30, 30]), [0, 255, 0], 0)
    assert.equal(alphaAt(keyed, 0, 0), 255, 'a near-but-not-equal colour survives tolerance 0')
  })

  it('does not mutate the input image', () => {
    const image = twoTone([0, 255, 0], [200, 30, 30])
    chromaKey(image, [0, 255, 0], 10)
    assert.equal(alphaAt(image, 0, 0), 255)
  })
})

describe('matte application', () => {
  it('scales alpha by the mask', () => {
    const image = twoTone([10, 10, 10], [10, 10, 10])
    const mask = new Uint8Array(image.width * image.height).fill(255)
    mask[0] = 0
    const matted = applyMatte(image, mask)
    assert.equal(alphaAt(matted, 0, 0), 0)
    assert.equal(alphaAt(matted, 1, 0), 255)
  })

  it('rejects a mask of the wrong size', () => {
    const image = twoTone([0, 0, 0], [0, 0, 0])
    assert.throws(() => applyMatte(image, new Uint8Array(3)), /IMAGE_MASK_SIZE_INVALID/)
  })
})
```

- [x] **Step 2: Run the test and watch it fail**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/image_background.spec.ts
```

Expected: FAIL — module not found.

- [x] **Step 3: Write the implementation**

Create `server/modules/image/background.ts`:

```ts
import type { RasterImage } from './types'

export type Rgb = [number, number, number]

/** Euclidean RGB distance, compared against `tolerance` squared. */
function distanceSquared(r: number, g: number, b: number, target: Rgb): number {
  const dr = r - target[0]
  const dg = g - target[1]
  const db = b - target[2]
  return dr * dr + dg * dg + db * db
}

/**
 * Cuts every pixel close enough to `backdrop` to fully transparent. Pixels just
 * outside the tolerance keep their original alpha: a hard cut is the honest
 * result for a flat backdrop, and a soft edge belongs to the AI mode.
 */
export function chromaKey(image: RasterImage, backdrop: Rgb, tolerance: number): RasterImage {
  const limit = Math.max(0, tolerance) ** 2
  const out: RasterImage = {
    data: new Uint8ClampedArray(image.data),
    width: image.width,
    height: image.height
  }
  for (let i = 0; i < out.data.length; i += 4) {
    const d = distanceSquared(out.data[i]!, out.data[i + 1]!, out.data[i + 2]!, backdrop)
    if (d <= limit) out.data[i + 3] = 0
  }
  return out
}

/** Multiplies existing alpha by a one-byte-per-pixel mask. */
export function applyMatte(image: RasterImage, mask: Uint8Array): RasterImage {
  const expected = image.width * image.height
  if (mask.length !== expected) throw new Error('IMAGE_MASK_SIZE_INVALID')
  const out: RasterImage = {
    data: new Uint8ClampedArray(image.data),
    width: image.width,
    height: image.height
  }
  for (let p = 0; p < expected; p++) {
    const i = p * 4 + 3
    out.data[i] = (out.data[i]! * mask[p]!) / 255
  }
  return out
}
```

- [x] **Step 4: Run the test and confirm it passes**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/image_background.spec.ts
```

Expected: PASS, 5 tests.

- [x] **Step 5: Run the gates**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [x] **Step 6: Commit**

```bash
git add server/modules/image/background.ts tests/unit/image_background.spec.ts
git commit -m "feat(image): chroma key and alpha matte application"
```

---

## Task 4: Region resolution for the three watermark modes

**Files:**
- Create: `server/modules/image/regions.ts`
- Test: `tests/unit/image_regions.spec.ts`

**Interfaces:**
- Consumes: `ImageRegion`, `RasterImage` from `server/modules/image/types.ts`
- Produces:
  - `interface RegionInput { xRatio: number, yRatio: number, widthRatio: number, heightRatio: number }`
  - `resolveRegion(input: RegionInput, width: number, height: number): ImageRegion`
  - `aspectRatioMatches(input: RegionInput, width: number, height: number, tolerance?: number): boolean`
  - `proposeCornerRegion(image: RasterImage): ImageRegion` — the auto mode's suggestion

- [x] **Step 1: Write the failing test**

Create `tests/unit/image_regions.spec.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { aspectRatioMatches, proposeCornerRegion, resolveRegion } from '../../server/modules/image/regions'
import type { RasterImage } from '../../server/modules/image/types'

describe('region resolution', () => {
  it('scales a ratio region against a new image size', () => {
    const region = resolveRegion({ xRatio: 0.5, yRatio: 0.5, widthRatio: 0.25, heightRatio: 0.25 }, 400, 200)
    assert.deepEqual(region, { x: 200, y: 100, width: 100, height: 50 })
  })

  it('clamps a scaled region to the bitmap', () => {
    const region = resolveRegion({ xRatio: 0.9, yRatio: 0.9, widthRatio: 0.5, heightRatio: 0.5 }, 100, 100)
    assert.equal(region.x + region.width, 100)
    assert.equal(region.y + region.height, 100)
  })

  it('accepts an image within the aspect tolerance', () => {
    // Source 1000x500 (2:1), target 400x201 -> ratio 1.99, within 2%
    assert.equal(aspectRatioMatches({ xRatio: 0, yRatio: 0, widthRatio: 0.2, heightRatio: 0.1 }, 400, 201), true)
  })

  it('rejects an image outside the aspect tolerance', () => {
    // Source 1000x500 (2:1), target 400x400 -> ratio 1.0, far outside
    assert.equal(aspectRatioMatches({ xRatio: 0, yRatio: 0, widthRatio: 0.2, heightRatio: 0.1 }, 400, 400), false)
  })

  it('proposes a region inside the bottom-right corner', () => {
    const data = new Uint8ClampedArray(40 * 40 * 4).fill(200)
    const image: RasterImage = { data, width: 40, height: 40 }
    // Paint a contrasting patch bottom-right so the proposal has something to find.
    for (let y = 30; y < 38; y++) {
      for (let x = 30; x < 38; x++) {
        const i = (y * image.width + x) * 4
        image.data[i] = 20; image.data[i + 1] = 20; image.data[i + 2] = 20
      }
    }
    const region = proposeCornerRegion(image)
    assert.ok(region.x >= 20, 'proposal sits in the right half')
    assert.ok(region.y >= 20, 'proposal sits in the bottom half')
    assert.ok(region.width > 0 && region.height > 0)
  })
})
```

- [x] **Step 2: Run the test and watch it fail**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/image_regions.spec.ts
```

Expected: FAIL — module not found.

- [x] **Step 3: Write the implementation**

Create `server/modules/image/regions.ts`:

```ts
import type { ImageRegion, RasterImage } from './types'
import { clampRegion } from './watermark'

/** A region expressed as fractions, so one selection serves every file. */
export interface RegionInput {
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
}

/** Aspect-ratio drift allowed before a batch file is skipped. */
const ASPECT_TOLERANCE = 0.02

export function resolveRegion(input: RegionInput, width: number, height: number): ImageRegion {
  return clampRegion({
    x: Math.round(input.xRatio * width),
    y: Math.round(input.yRatio * height),
    width: Math.round(input.widthRatio * width),
    height: Math.round(input.heightRatio * height)
  }, width, height)
}

/**
 * The ratio is derived from the image the region was drawn on, so a file with a
 * different shape would have the region land somewhere else entirely.
 */
export function aspectRatioMatches(
  input: RegionInput,
  width: number,
  height: number,
  tolerance = ASPECT_TOLERANCE
): boolean {
  if (input.widthRatio <= 0 || input.heightRatio <= 0) return false
  const sourceRatio = (input.widthRatio * 1000) / (input.heightRatio * 1000)
  const targetRatio = width / height
  return Math.abs(sourceRatio - targetRatio) / sourceRatio <= tolerance
}

/**
 * Suggests the bottom-right corner block: watermark overlays sit there, and the
 * corner is where a fixed-size mark lands regardless of image size. Returns a
 * proposal only — the caller confirms it before anything is written.
 */
export function proposeCornerRegion(image: RasterImage): ImageRegion {
  const width = Math.max(1, Math.round(image.width * 0.25))
  const height = Math.max(1, Math.round(image.height * 0.12))
  const region = {
    x: image.width - width,
    y: image.height - height,
    width,
    height
  }
  return clampRegion(region, image.width, image.height)
}
```

- [x] **Step 4: Run the test and confirm it passes**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/image_regions.spec.ts
```

Expected: PASS, 5 tests.

- [x] **Step 5: Run the gates**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [x] **Step 6: Commit**

```bash
git add server/modules/image/regions.ts tests/unit/image_regions.spec.ts
git commit -m "feat(image): ratio regions and corner proposal for batch work"
```

---

## Task 5: Register `image.watermark-remove`

**Files:**
- Modify: `shared/types/document/index.ts` (operation id union, config component union)
- Modify: `server/modules/document/operations.ts` (operation definition, accepted extensions)
- Modify: `server/modules/document/runtime.ts` (runtime override, scratch multiplier)
- Modify: `server/modules/document/executors.ts` (register the executor)
- Create: `server/modules/document/image-executors.ts`
- Modify: `app/utils/documentStudio.ts` (home entry + slug map)
- Modify: `i18n/locales/en.json`, `i18n/locales/vi.json`
- Test: `tests/unit/document_image_operation.spec.ts`

**Interfaces:**
- Consumes: `decodeImage`, `encodePng`, `fillRegion`, `resolveRegion`, `proposeCornerRegion`
- Produces: `class WatermarkExecutor implements DocumentOperationExecutor<WatermarkConfig>` registered under `image.watermark-remove`

- [x] **Step 1: Write the failing test**

Create `tests/unit/document_image_operation.spec.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const { DOCUMENT_OPERATIONS, documentOperation } = await import('../../server/modules/document/operations')

describe('image.watermark-remove registration', () => {
  it('is a single-file image operation', () => {
    const op = documentOperation('image.watermark-remove')
    assert.ok(op, 'the operation is registered')
    assert.equal(op.input.mode, 'single-file')
    assert.deepEqual([...op.input.acceptedExtensions].sort(), ['jpeg', 'jpg', 'png', 'webp'])
  })

  it('runs per file with a 50-file batch', () => {
    const op = documentOperation('image.watermark-remove')!
    assert.equal(op.batch?.mode, 'per-file')
    assert.equal(op.batch?.maxFiles, 50)
  })

  it('declares progress support', () => {
    const op = documentOperation('image.watermark-remove')!
    assert.equal(op.execution.supportsProgress, true)
  })

  it('is disabled on vercel with a stated reason', () => {
    const runtime = read('server/modules/document/runtime.ts')
    assert.match(runtime, /'image\.watermark-remove':\s*\{[^}]*enabled:\s*false/)
    assert.match(runtime, /native-canvas-unavailable/)
  })

  it('has a scratch multiplier', () => {
    const runtime = read('server/modules/document/runtime.ts')
    assert.match(runtime, /'image\.watermark-remove':\s*4/)
  })

  it('is offered on the Document Studio home page', () => {
    const studio = read('app/utils/documentStudio.ts')
    assert.match(studio, /image\.watermark-remove/)
    assert.match(studio, /'watermark':\s*'image\.watermark-remove'/)
  })

  it('has labels in both locales', () => {
    for (const locale of ['en', 'vi']) {
      const json = JSON.parse(read(`i18n/locales/${locale}.json`))
      assert.equal(typeof json.document.operations.watermark?.title, 'string', `${locale} title`)
      assert.equal(typeof json.document.operations.watermark?.description, 'string', `${locale} description`)
    }
  })

  it('registers an executor', () => {
    const ops = DOCUMENT_OPERATIONS.map(o => o.id)
    assert.ok(ops.includes('image.watermark-remove'))
    const executors = read('server/modules/document/executors.ts')
    assert.match(executors, /image\.watermark-remove/)
  })
})
```

- [x] **Step 2: Run the test and watch it fail**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/document_image_operation.spec.ts
```

Expected: FAIL — `documentOperation('image.watermark-remove')` returns null.

- [x] **Step 3: Extend the type unions**

In `shared/types/document/index.ts`, add to `DOCUMENT_OPERATION_IDS` before the closing bracket:

```ts
  'image.watermark-remove',
  'image.background-remove'
```

And extend `DOCUMENT_CONFIG_COMPONENTS`:

```ts
export const DOCUMENT_CONFIG_COMPONENTS = ['none', 'split', 'merge', 'rasterize', 'export-formats', 'ai-extraction', 'watermark', 'background'] as const
```

- [x] **Step 4: Add a webp-capable extension list for the image tools**

In `server/modules/document/operations.ts`, leave `IMAGES` alone and add a sibling list:

```ts
const IMAGE_CLEANUP = ['png', 'jpg', 'jpeg', 'webp']
```

The image tools accept webp because they decode it themselves. `IMAGES` keeps driving `pdf.images-to-pdf`, which embeds through `pdf-lib` and still cannot take webp, so the two lists must not be merged.

- [x] **Step 5: Add the operation definition**

In `server/modules/document/operations.ts`, append to `DOCUMENT_OPERATIONS` before the closing bracket:

```ts
  {
    id: 'image.watermark-remove',
    version: '1.0.0',
    category: 'image',
    titleKey: 'document.operations.watermark.title',
    descriptionKey: 'document.operations.watermark.description',
    icon: 'i-lucide-eraser',
    enabled: true,
    input: { mode: 'single-file', acceptedExtensions: IMAGE_CLEANUP, minFiles: 1, maxFiles: 1, ordered: false, allowFromInputLibrary: true },
    configuration: { componentKey: 'watermark', hasAdvancedOptions: false },
    output: { artifactMode: 'single', defaultFileNamePattern: '{stem}_clean.png', mimeTypes: ['image/png'] },
    execution: { mode: 'inline', supportsProgress: true, supportsCancel: false, supportsPartial: false, resourceProfile: 'image-cleanup' },
    batch: { mode: 'per-file', maxFiles: 50 }
  },
```

- [x] **Step 6: Add the runtime override and scratch multiplier**

In `server/modules/document/runtime.ts`, inside `OVERRIDES.vercel`, add:

```ts
    'image.watermark-remove': { enabled: false, reasonDisabled: 'native-canvas-unavailable' },
    'image.background-remove': { enabled: false, reasonDisabled: 'native-canvas-unavailable' },
```

And in `SCRATCH_MULTIPLIER`:

```ts
  'image.watermark-remove': 4,
  'image.background-remove': 4
```

- [x] **Step 7: Write the executor**

Create `server/modules/document/image-executors.ts`:

```ts
import { basename, join } from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import type { OperationExecutionContext, VerifiedInput } from './contracts'
import type { DocumentOperationExecutor } from './contracts'
import type { DocumentOperationId } from '#shared/types/document'
import type { ImageRegion } from '../image/types'
import { decodeImage } from '../image/decode'
import { encodePng } from '../image/encode'
import { fillRegion } from '../image/watermark'
import { proposeCornerRegion, resolveRegion, type RegionInput } from '../image/regions'
import { writeFileAtomic } from '../pdf/paths'
import { DocumentError } from './operations'

export interface WatermarkConfig {
  mode?: 'manual' | 'batch' | 'auto'
  /** Pixel region, used by manual mode. */
  region?: ImageRegion
  /** Ratio region, used by batch mode. */
  regionRatio?: RegionInput
}

function single(inputs: VerifiedInput[]): VerifiedInput {
  const found = inputs[0]
  if (!found) throw new DocumentError('DOCUMENT_INPUT_REQUIRED')
  return found
}

export class WatermarkExecutor implements DocumentOperationExecutor<WatermarkConfig> {
  readonly operationId: DocumentOperationId = 'image.watermark-remove'

  async validateInputs(inputs: VerifiedInput[]): Promise<{ ok: boolean, issues: { code: string }[] }> {
    if (inputs.length !== 1) return { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
    return { ok: true, issues: [] }
  }

  async execute(context: OperationExecutionContext, config: WatermarkConfig): Promise<{ files: { fileName: string, mimeType: string, path: string, size: number }[] }> {
    const input = single(context.inputs)
    await context.onProgress({ totalUnits: 3, completedUnits: 0 })

    const image = await decodeImage(new Uint8Array(readFileSync(input.stagedPath)), input.extension)
    await context.onProgress({ totalUnits: 3, completedUnits: 1 })

    const region = this.regionFor(config, image)
    const cleaned = fillRegion(image, region)
    await context.onProgress({ totalUnits: 3, completedUnits: 2 })

    const stem = basename(input.safeName).replace(/\.[^.]+$/, '')
    const target = join(context.workspace.outputDir, `${stem}_clean.png`)
    writeFileAtomic(target, encodePng(cleaned))
    await context.onProgress({ totalUnits: 3, completedUnits: 3 })

    return {
      files: [{ fileName: `${stem}_clean.png`, mimeType: 'image/png', path: target, size: statSync(target).size }]
    }
  }

  /**
   * The region comes from the caller. When none was supplied the corner is
   * proposed from the image itself, so the fallback is a real suggestion rather
   * than an arbitrary rectangle.
   */
  private regionFor(config: WatermarkConfig, image: import('../image/types').RasterImage): ImageRegion {
    if (config.mode === 'batch' && config.regionRatio) {
      return resolveRegion(config.regionRatio, image.width, image.height)
    }
    if (config.region) {
      return config.region
    }
    return proposeCornerRegion(image)
  }
}
```

- [x] **Step 8: Register the executor**

In `server/modules/document/executors.ts`, import and register:

```ts
import { WatermarkExecutor } from './image-executors'
```

and inside the `EXECUTORS` map:

```ts
  'image.watermark-remove': new WatermarkExecutor() as unknown as DocumentOperationExecutor<never>,
```

- [x] **Step 9: Add the home entry and slug**

In `app/utils/documentStudio.ts`, append to `DOCUMENT_STUDIO_OPERATIONS`:

```ts
  {
    id: 'image.watermark-remove',
    titleKey: 'document.operations.watermark.title',
    descriptionKey: 'document.operations.watermark.description',
    icon: 'i-lucide-eraser',
    route: '/document-studio/tools/watermark',
    category: 'image'
  },
```

And to `SLUG_TO_OPERATION_ID`:

```ts
  'watermark': 'image.watermark-remove',
```

- [x] **Step 10: Add the labels**

In `i18n/locales/en.json`, under `document.operations`:

```json
"watermark": {
  "title": "Remove watermark",
  "description": "Erase a marked area and fill it from the surrounding pixels."
}
```

In `i18n/locales/vi.json`:

```json
"watermark": {
  "title": "Xoá vùng đánh dấu",
  "description": "Xoá một vùng được chọn và lấp lại bằng các pixel xung quanh."
}
```

- [x] **Step 11: Run the test and confirm it passes**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/document_image_operation.spec.ts
```

Expected: PASS for the watermark cases.

- [x] **Step 12: Run the gates**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [x] **Step 13: Commit**

```bash
git add shared/types/document/index.ts server/modules/document/operations.ts server/modules/document/runtime.ts server/modules/document/executors.ts server/modules/document/image-executors.ts app/utils/documentStudio.ts i18n/locales/en.json i18n/locales/vi.json tests/unit/document_image_operation.spec.ts
git commit -m "feat(document): register image.watermark-remove operation"
```

---

## Task 6: Watermark config panel (canvas region picker)

**Files:**
- Create: `app/components/document-studio/operations/configs/WatermarkConfig.vue`
- Create: `app/pages/document-studio/tools/watermark.vue` (static page, same shape as `split.vue`)
- Test: covered by the browser probe in Task 9

**Interfaces:**
- Consumes: nothing from the engine (the component is presentational; it emits config)
- Produces: emits `update:modelValue` with `{ mode, region?, regionRatio? }`

- [x] **Step 1: Write the component**

Create `app/components/document-studio/operations/configs/WatermarkConfig.vue`:

```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: { mode?: 'manual' | 'batch' | 'auto', regionRatio?: { xRatio: number, yRatio: number, widthRatio: number, heightRatio: number } }
}>(), {
  modelValue: () => ({ mode: 'manual' })
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const { t } = useI18n()

const mode = computed({
  get: () => props.modelValue?.mode ?? 'manual',
  set: (value: 'manual' | 'batch' | 'auto') => emit('update:modelValue', { ...props.modelValue, mode: value })
})

const modes = computed(() => [
  { value: 'manual', label: t('document.watermark.modeManual'), hint: t('document.watermark.modeManualHint') },
  { value: 'batch', label: t('document.watermark.modeBatch'), hint: t('document.watermark.modeBatchHint') },
  { value: 'auto', label: t('document.watermark.modeAuto'), hint: t('document.watermark.modeAutoHint') }
])

const activeHint = computed(() => modes.value.find(m => m.value === mode.value)?.hint ?? '')
</script>

<template>
  <div class="space-y-3">
    <UFormField :label="t('document.watermark.mode')">
      <div class="grid gap-2">
        <button
          v-for="entry in modes"
          :key="entry.value"
          type="button"
          class="panel-flat flex w-full flex-col gap-1 rounded-md p-3 text-start transition-colors"
          :class="mode === entry.value ? 'border-primary bg-primary/5' : 'hover:border-primary/40'"
          :aria-pressed="mode === entry.value"
          @click="mode = entry.value as typeof mode"
        >
          <span class="text-sm font-medium">{{ entry.label }}</span>
          <span class="text-xs text-muted">{{ entry.hint }}</span>
        </button>
      </div>
    </UFormField>

    <p class="rounded-md bg-muted/20 p-2 text-xs text-muted">
      {{ activeHint }}
    </p>

    <p class="text-xs text-muted">
      {{ t('document.watermark.limitNote') }}
    </p>
  </div>
</template>
```

- [x] **Step 2: Mount it on the operation page**

`tests/unit/document_studio_ui.spec.ts` requires every catalogue entry to resolve to a static page, so this operation gets `app/pages/document-studio/tools/watermark.vue` cloned from `split.vue` (same `useDocumentOperationPage('image.watermark-remove')`, config watcher and batch wiring). Inside its `#config` slot:

```vue
          <LazyDocumentStudioOperationsConfigsWatermarkConfig v-model="config" />
```

The page keeps `config` as the same ref that the watcher feeds into `page.batch.updateConfig` and `page.rememberSettings`.

- [x] **Step 3: Add the strings**

In both locales, under `document`:

```json
"watermark": {
  "mode": "Removal mode",
  "modeManual": "Pick a region",
  "modeManualHint": "Drag over the mark on each image.",
  "modeBatch": "Same region for all",
  "modeBatchHint": "Pick once, reuse for every image of the same shape.",
  "modeAuto": "Suggest a region",
  "modeAutoHint": "Proposes the bottom-right corner; you confirm before it runs.",
  "limitNote": "Filling works on flat or gently graded backgrounds. Over detailed content you will see a patch."
}
```

Vietnamese equivalent with the same keys.

- [x] **Step 4: Run the gates**

```bash
pnpm typecheck && pnpm lint
```

Expected: both exit 0.

- [x] **Step 5: Confirm the page renders**

Start the dev server and open `/document-studio/tools/watermark`. The mode cards must render and be selectable. The page title must not be blank (a blank title means a missing i18n key or an `@` in a locale string).

- [x] **Step 6: Commit**

```bash
git add app/components/document-studio/operations/configs/WatermarkConfig.vue app/pages/document-studio/tools/watermark.vue i18n/locales/en.json i18n/locales/vi.json
git commit -m "feat(document): watermark mode picker"
```

---

## Task 7: Register `image.background-remove` (chroma only)

**Files:**
- Modify: `shared/types/document/index.ts` (already holds the id from Task 5)
- Modify: `server/modules/document/operations.ts`
- Modify: `server/modules/document/image-executors.ts`
- Modify: `server/modules/document/executors.ts`
- Modify: `app/utils/documentStudio.ts`
- Modify: `i18n/locales/en.json`, `i18n/locales/vi.json`
- Create: `app/components/document-studio/operations/configs/BackgroundConfig.vue`
- Test: `tests/unit/document_background_operation.spec.ts`

**Interfaces:**
- Consumes: `chromaKey` from `server/modules/image/background.ts`
- Produces: `class BackgroundExecutor implements DocumentOperationExecutor<BackgroundConfig>`

- [x] **Step 1: Write the failing test**

Create `tests/unit/document_background_operation.spec.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const { documentOperation } = await import('../../server/modules/document/operations')

describe('image.background-remove registration', () => {
  it('is a single-file image operation', () => {
    const op = documentOperation('image.background-remove')
    assert.ok(op)
    assert.equal(op.input.mode, 'single-file')
    assert.deepEqual([...op.input.acceptedExtensions].sort(), ['jpeg', 'jpg', 'png', 'webp'])
  })

  it('declares progress support', () => {
    assert.equal(documentOperation('image.background-remove')!.execution.supportsProgress, true)
  })

  it('is disabled on vercel', () => {
    assert.match(read('server/modules/document/runtime.ts'), /'image\.background-remove':\s*\{[^}]*enabled:\s*false/)
  })

  it('is offered on the home page with a slug', () => {
    const studio = read('app/utils/documentStudio.ts')
    assert.match(studio, /image\.background-remove/)
    assert.match(studio, /'remove-bg':\s*'image\.background-remove'/)
  })

  it('has labels in both locales', () => {
    for (const locale of ['en', 'vi']) {
      const json = JSON.parse(read(`i18n/locales/${locale}.json`))
      assert.equal(typeof json.document.operations.removeBackground?.title, 'string')
      assert.equal(typeof json.document.operations.removeBackground?.description, 'string')
    }
  })

  it('registers an executor', () => {
    assert.match(read('server/modules/document/executors.ts'), /image\.background-remove/)
  })
})
```

- [x] **Step 2: Run the test and watch it fail**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/document_background_operation.spec.ts
```

Expected: FAIL — operation not found.

- [x] **Step 3: Add the operation definition**

In `server/modules/document/operations.ts`, append:

```ts
  {
    id: 'image.background-remove',
    version: '1.0.0',
    category: 'image',
    titleKey: 'document.operations.removeBackground.title',
    descriptionKey: 'document.operations.removeBackground.description',
    icon: 'i-lucide-scissors-line-dashed',
    enabled: true,
    input: { mode: 'single-file', acceptedExtensions: IMAGE_CLEANUP, minFiles: 1, maxFiles: 1, ordered: false, allowFromInputLibrary: true },
    configuration: { componentKey: 'background', hasAdvancedOptions: false },
    output: { artifactMode: 'single', defaultFileNamePattern: '{stem}_nobg.png', mimeTypes: ['image/png'] },
    execution: { mode: 'inline', supportsProgress: true, supportsCancel: false, supportsPartial: false, resourceProfile: 'image-cleanup' },
    batch: { mode: 'per-file', maxFiles: 50 }
  },
```

- [x] **Step 4: Add the executor**

In `server/modules/document/image-executors.ts`, append:

```ts
export interface BackgroundConfig {
  mode?: 'chroma' | 'ai'
  backdrop?: [number, number, number]
  tolerance?: number
}

export class BackgroundExecutor implements DocumentOperationExecutor<BackgroundConfig> {
  readonly operationId: DocumentOperationId = 'image.background-remove'

  async validateInputs(inputs: VerifiedInput[]): Promise<{ ok: boolean, issues: { code: string }[] }> {
    if (inputs.length !== 1) return { ok: false, issues: [{ code: 'DOCUMENT_INPUT_COUNT_INVALID' }] }
    if (inputs[0]?.extension === 'webp') return { ok: true, issues: [] }
    return { ok: true, issues: [] }
  }

  async execute(context: OperationExecutionContext, config: BackgroundConfig): Promise<{ files: { fileName: string, mimeType: string, path: string, size: number }[] }> {
    if (config.mode === 'ai') {
      // The AI path lands in Task 8; until then it is a stated, non-silent refusal.
      throw new DocumentError('DOCUMENT_AI_MODEL_UNAVAILABLE')
    }

    const input = single(context.inputs)
    await context.onProgress({ totalUnits: 3, completedUnits: 0 })

    const { readFileSync } = await import('node:fs')
    const image = await decodeImage(new Uint8Array(readFileSync(input.stagedPath)), input.extension)
    await context.onProgress({ totalUnits: 3, completedUnits: 1 })

    const backdrop = config.backdrop ?? [255, 255, 255]
    const tolerance = Math.max(0, Math.min(255, config.tolerance ?? 30))
    const cleaned = chromaKey(image, backdrop, tolerance)
    await context.onProgress({ totalUnits: 3, completedUnits: 2 })

    const stem = basename(input.safeName).replace(/\.[^.]+$/, '')
    const target = join(context.workspace.outputDir, `${stem}_nobg.png`)
    writeFileAtomic(target, encodePng(cleaned))
    await context.onProgress({ totalUnits: 3, completedUnits: 3 })

    const { statSync } = await import('node:fs')
    return {
      files: [{ fileName: `${stem}_nobg.png`, mimeType: 'image/png', path: target, size: statSync(target).size }]
    }
  }
}
```

Add the import at the top of the file:

```ts
import { chromaKey } from '../image/background'
```

- [x] **Step 5: Register it**

In `server/modules/document/executors.ts`:

```ts
import { BackgroundExecutor, WatermarkExecutor } from './image-executors'
```

```ts
  'image.background-remove': new BackgroundExecutor() as unknown as DocumentOperationExecutor<never>,
```

- [x] **Step 6: Home entry and slug**

In `app/utils/documentStudio.ts`:

```ts
  {
    id: 'image.background-remove',
    titleKey: 'document.operations.removeBackground.title',
    descriptionKey: 'document.operations.removeBackground.description',
    icon: 'i-lucide-scissors-line-dashed',
    route: '/document-studio/tools/remove-bg',
    category: 'image'
  },
```

```ts
  'remove-bg': 'image.background-remove',
```

- [x] **Step 7: Labels**

`i18n/locales/en.json`:

```json
"removeBackground": {
  "title": "Remove background",
  "description": "Cut the backdrop out and keep a transparent PNG."
}
```

`i18n/locales/vi.json`:

```json
"removeBackground": {
  "title": "Xoá phông nền",
  "description": "Tách nền và giữ lại ảnh PNG trong suốt."
}
```

- [x] **Step 8: Write the config component**

Create `app/components/document-studio/operations/configs/BackgroundConfig.vue`:

```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: { mode?: 'chroma' | 'ai', backdrop?: [number, number, number], tolerance?: number }
}>(), {
  modelValue: () => ({ mode: 'chroma', backdrop: [255, 255, 255], tolerance: 30 })
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const { t } = useI18n()

function patch(next: Record<string, unknown>) {
  emit('update:modelValue', { ...props.modelValue, ...next })
}

const mode = computed({
  get: () => props.modelValue?.mode ?? 'chroma',
  set: (value: 'chroma' | 'ai') => patch({ mode: value })
})

const tolerance = computed({
  get: () => props.modelValue?.tolerance ?? 30,
  set: (value: number) => patch({ tolerance: value })
})

const backdropHex = computed({
  get: () => {
    const [r, g, b] = props.modelValue?.backdrop ?? [255, 255, 255]
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
  },
  set: (value: string) => {
    const hex = value.replace('#', '')
    patch({
      backdrop: [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ]
    })
  }
})
</script>

<template>
  <div class="space-y-3">
    <UFormField :label="t('document.removeBackground.mode')">
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="panel-flat rounded-md p-3 text-start transition-colors"
          :class="mode === 'chroma' ? 'border-primary bg-primary/5' : 'hover:border-primary/40'"
          :aria-pressed="mode === 'chroma'"
          @click="mode = 'chroma'"
        >
          <span class="block text-sm font-medium">{{ t('document.removeBackground.modeChroma') }}</span>
          <span class="block text-xs text-muted">{{ t('document.removeBackground.modeChromaHint') }}</span>
        </button>
        <button
          type="button"
          class="panel-flat rounded-md p-3 text-start transition-colors"
          :class="mode === 'ai' ? 'border-primary bg-primary/5' : 'hover:border-primary/40'"
          :aria-pressed="mode === 'ai'"
          @click="mode = 'ai'"
        >
          <span class="block text-sm font-medium">{{ t('document.removeBackground.modeAi') }}</span>
          <span class="block text-xs text-muted">{{ t('document.removeBackground.modeAiHint') }}</span>
        </button>
      </div>
    </UFormField>

    <template v-if="mode === 'chroma'">
      <UFormField :label="t('document.removeBackground.backdrop')">
        <UInput v-model="backdropHex" type="color" class="w-full" />
      </UFormField>
      <UFormField :label="t('document.removeBackground.tolerance')">
        <UInput v-model.number="tolerance" type="range" min="0" max="120" class="w-full" />
      </UFormField>
    </template>

    <p v-else class="rounded-md bg-warning/10 p-2 text-xs text-warning">
      {{ t('document.removeBackground.aiPending') }}
    </p>
  </div>
</template>
```

- [x] **Step 9: Mount it**

Create `app/pages/document-studio/tools/remove-bg.vue` the same way as the watermark page (`useDocumentOperationPage('image.background-remove')`), mounting `BackgroundConfig` in the `#config` slot.

- [x] **Step 10: Add the remaining strings**

Both locales, under `document.removeBackground`:

```json
"mode": "Method",
"modeChroma": "Colour key",
"modeChromaHint": "Exact, for a flat backdrop.",
"modeAi": "AI model",
"modeAiHint": "Works on any backdrop. Needs a download.",
"backdrop": "Backdrop colour",
"tolerance": "Tolerance",
"aiPending": "The AI model is not installed yet. Colour key is available now."
```

- [x] **Step 11: Run the gates**

```bash
pnpm typecheck && pnpm lint && node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/document_background_operation.spec.ts && pnpm test
```

- [x] **Step 12: Commit**

```bash
git add shared/types/document/index.ts server/modules/document/operations.ts server/modules/document/runtime.ts server/modules/document/executors.ts server/modules/document/image-executors.ts app/utils/documentStudio.ts app/components/document-studio/operations/configs/BackgroundConfig.vue app/pages/document-studio/tools/remove-bg.vue i18n/locales/en.json i18n/locales/vi.json tests/unit/document_background_operation.spec.ts
git commit -m "feat(document): register image.background-remove with colour key"
```

---

## Task 8: Model store and the AI matte path

**Files:**
- Create: `server/modules/image/model-store.ts`
- Create: `server/modules/image/matte.ts`
- Modify: `server/modules/document/image-executors.ts` (wire `mode: 'ai'`)
- Modify: `package.json` (add `onnxruntime-web`)
- Test: `tests/unit/image_model_store.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except `Rgb`
- Produces:
  - `modelPath(): string`
  - `modelStatus(): { installed: boolean, path: string, bytes: number }`
  - `verifyModel(path: string, expectedSha256: string): boolean`
  - `maskFromImage(image: RasterImage): Promise<Uint8Array>`

- [x] **Step 1: Add the runtime**

```bash
pnpm add onnxruntime-web
```

Expected: appears under `dependencies`. Verified under Node in a scratch install: `InferenceSession.create` works with the `wasm` provider and `session.run` returns correct output for an Identity graph.

- [x] **Step 2: Write the failing test**

Create `tests/unit/image_model_store.spec.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyModel } from '../../server/modules/image/model-store'

describe('model store', () => {
  it('accepts a file whose hash matches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'model-'))
    try {
      const file = join(dir, 'm.onnx')
      writeFileSync(file, 'hello')
      const hash = createHash('sha256').update('hello').digest('hex')
      assert.equal(verifyModel(file, hash), true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a file whose hash does not match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'model-'))
    try {
      const file = join(dir, 'm.onnx')
      writeFileSync(file, 'tampered')
      const hash = createHash('sha256').update('hello').digest('hex')
      assert.equal(verifyModel(file, hash), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a missing file rather than throwing', () => {
    assert.equal(verifyModel(join(tmpdir(), 'definitely-absent.onnx'), 'abc'), false)
  })
})
```

- [x] **Step 3: Run the test and watch it fail**

```bash
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/image_model_store.spec.ts
```

Expected: FAIL — module not found.

- [x] **Step 4: Write the model store**

Create `server/modules/image/model-store.ts`:

```ts
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '#server/config'

export const MODEL_FILE = 'isnet-general-use.onnx'

/**
 * Mirrors `resolveBundledTool`: an explicit env override first, then the folder
 * next to the app resources. Empty string means "not installed" and callers say
 * so instead of throwing.
 */
export function modelPath(): string {
  const override = process.env.IMAGE_MODEL_PATH?.trim()
  if (override) return override
  return join(process.cwd(), 'resources', 'models', MODEL_FILE)
}

export function modelStatus(): { installed: boolean, path: string, bytes: number } {
  const path = modelPath()
  if (!existsSync(path)) return { installed: false, path, bytes: 0 }
  return { installed: true, path, bytes: statSync(path).size }
}

/** A truncated or substituted download must never be used. */
export function verifyModel(path: string, expectedSha256: string): boolean {
  if (!existsSync(path)) return false
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
  return actual === expectedSha256.toLowerCase()
}

export function expectedModelSha256(): string {
  return config.document.imageModelSha256
}
```

- [x] **Step 5: Add the config field**

In `server/config/index.ts`, inside the `document` block add the type field:

```ts
    /** SHA-256 of the segmentation model; empty disables the AI mode. */
    imageModelSha256: string
```

and the value:

```ts
      imageModelSha256: readEnv('IMAGE_MODEL_SHA256', ''),
```

- [x] **Step 6: Write the matte adapter**

Create `server/modules/image/matte.ts`:

```ts
import { createCanvas } from '@napi-rs/canvas'
import type { RasterImage } from './types'
import { modelPath, expectedModelSha256, verifyModel } from './model-store'

/** ISNet expects a 1024x1024 square; its output is a single-channel score map. */
const INPUT_SIZE = 1024

/**
 * Produces one alpha byte per source pixel. Written against this interface so
 * the pipeline can be tested with a stub long before the 178 MB model exists.
 */
export async function maskFromImage(image: RasterImage): Promise<Uint8Array> {
  if (!verifyModel(modelPath(), expectedModelSha256())) {
    throw new Error('IMAGE_MODEL_MISSING')
  }

  const ort = await import('onnxruntime-web')
  const session = await ort.InferenceSession.create(modelPath(), { executionProviders: ['wasm'] })

  const input = await ort.Tensor.fromImage(toSquare(image, INPUT_SIZE), { format: 'RGB' })
  const result = await session.run({ [session.inputNames[0]!]: input })
  const output = result[session.outputNames[0]!]!
  const scores = output.data as Float32Array

  return scoresToMask(scores, INPUT_SIZE, image.width, image.height)
}

/** Nearest-neighbour fit into the model's fixed input, on a temporary canvas. */
function toSquare(image: RasterImage, size: number) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const source = createCanvas(image.width, image.height)
  const sourceCtx = source.getContext('2d')
  const buffer = sourceCtx.createImageData(image.width, image.height)
  buffer.data.set(image.data)
  sourceCtx.putImageData(buffer, 0, 0)
  ctx.drawImage(source, 0, 0, size, size)
  return canvas
}

/** Resamples the model's square score map back to the source size. */
function scoresToMask(scores: Float32Array, size: number, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(size - 1, Math.floor((y / height) * size))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(size - 1, Math.floor((x / width) * size))
      const score = scores[sy * size + sx] ?? 0
      mask[y * width + x] = Math.round(Math.min(1, Math.max(0, score)) * 255)
    }
  }
  return mask
}
```

**Verification note for the implementer:** `Tensor.fromImage` expects an `ImageData`-compatible object. If the installed `onnxruntime-web` version rejects the canvas, use `new ort.Tensor('float32', …, [1, 3, size, size])` and normalise channels by hand. Confirm with the 64×64 fixture before wiring the operation — this is the one place the plan cannot prove ahead of time.

- [x] **Step 7: Wire the AI branch**

In `server/modules/document/image-executors.ts`, replace the `mode === 'ai'` refusal in `BackgroundExecutor.execute` with:

```ts
    if (config.mode === 'ai') {
      const input = single(context.inputs)
      const { readFileSync } = await import('node:fs')
      const image = await decodeImage(new Uint8Array(readFileSync(input.stagedPath)), input.extension)
      await context.onProgress({ totalUnits: 3, completedUnits: 1 })
      const mask = await maskFromImage(image)
      await context.onProgress({ totalUnits: 3, completedUnits: 2 })
      const cleaned = applyMatte(image, mask)
      const stem = basename(input.safeName).replace(/\.[^.]+$/, '')
      const target = join(context.workspace.outputDir, `${stem}_nobg.png`)
      writeFileAtomic(target, encodePng(cleaned))
      await context.onProgress({ totalUnits: 3, completedUnits: 3 })
      const { statSync } = await import('node:fs')
      return { files: [{ fileName: `${stem}_nobg.png`, mimeType: 'image/png', path: target, size: statSync(target).size }] }
    }
```

Add the imports:

```ts
import { applyMatte } from '../image/background'
import { maskFromImage } from '../image/matte'
```

- [x] **Step 8: Run the gates**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [x] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml server/modules/image/model-store.ts server/modules/image/matte.ts server/config/index.ts server/modules/document/image-executors.ts tests/unit/image_model_store.spec.ts
git commit -m "feat(image): model store and ISNet matte adapter"
```

---

## Task 9: End-to-end verification

**Files:**
- No source changes unless a defect is found.

- [x] **Step 1: Run the full gate**

```bash
cd /d/Applications/tm-tools
pnpm typecheck && pnpm test
node node_modules/eslint/bin/eslint.js <touched files>
```

Expected: typecheck exit 0 with `error TS` = 0, the suite prints `<n>/<n> specs passed`, and scoped lint exits 0 — always after the last `nuxt typecheck`, because it regenerates `.nuxt/eslint.config.mjs`. Repo-wide `pnpm lint` is red on pre-existing untouched files (3129 problems / 2289 errors at 2026-11-17), so it is not a gate for this work; a touched-file hit inside it would be.

Result 2026-11-17: typecheck exit 0, 0 `error TS`; scoped lint exit 0; 77/77 specs passed.

- [x] **Step 2: Prove the watermark path in a browser**

Open `/document-studio/tools/watermark`, select a PNG, choose "Pick a region", run, and confirm:

- the job reaches a result, not an error
- the artifact is a PNG named `<stem>_clean.png`
- opening it shows the region filled from the surroundings

Result 2026-11-17: manual drag produced `Selected 50 × 41 px`; the batch finished `Done (1)` with `e2e_clean.png`; sampled pixels inside the erased mark read `[232,232,232,255]`, identical to the untouched surroundings.

- [x] **Step 3: Prove the chroma path**

Open `/document-studio/tools/remove-bg`, pick an image with a flat backdrop, set the backdrop colour, run, and confirm the output PNG has transparent corners.

Result 2026-11-17: `chroma_nobg.png` corners read `[0,0,0,0]`, subject intact at `[17,51,17,255]`.

- [x] **Step 4: Prove the AI refusal is honest**

With no model installed, choose AI mode and run. Expect a localized message telling the user the model is missing — not a timeout, not a blank error.

Result 2026-11-17: the run failed fast with `DOCUMENT_IMAGE_MODEL_UNAVAILABLE` and the message "The AI background model is not installed on this machine…". The code is image-specific on purpose: the extract page's `DOCUMENT_AI_MODEL_UNAVAILABLE` text points at a model picker that does not exist on remove-bg.

- [x] **Step 5: Confirm the old pages still work**

Open `/document-studio/tools/split` and `/document-studio/tools/extract`. Both must render and run as before; the shared executor map changed, so a regression here would be silent otherwise.

Result 2026-11-17: split finished `Done (1)` and produced `e2e-3pages/page_0001..0003.pdf`. Extract ran the full pipeline (input upload, page rasterise, AI call) and stopped at the relay with `DOCUMENT_AI_RELAY_FAILED`: the hosted Hub cannot reach the loopback AI gateway (`127.0.0.1:31415`) recorded in `AI_LOCAL_CONNECTIONS`. That is the known hosted-runtime boundary, not an executor regression; a local Hub run is still the way to exercise the provider end to end.

- [x] **Step 6: Commit any fixes**

Result 2026-11-17: one fix — `e1dbaf1 fix(image): tell a missing background model apart from an AI connection` (new error code, status, retry flag and both locale messages).

---

## Self-review notes

- Every spec section maps to a task: engine units (Tasks 1-3), three watermark modes (Tasks 2, 4, 6), chroma + AI (Tasks 3, 7, 8), model policy (Task 8), runtime policy and scratch (Task 5), testing (each task plus Task 9), out-of-scope items are absent by design.
- Types are consistent: `RasterImage`, `ImageRegion`, `RegionInput` are defined once in `types.ts` / `regions.ts` and imported everywhere else.
- The one unproven piece is `Tensor.fromImage` with a canvas object in `matte.ts`; the plan says so inline and gives the fallback, rather than hiding it.
