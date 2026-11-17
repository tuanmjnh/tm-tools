import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * The model install path is a real, mutating operation, so it is tested against
 * a temp dir and an injected fetch. The official hash below is the one the
 * rembg v0.0.0 release reports (178,648,008 bytes) and is the default the app
 * trusts when IMAGE_MODEL_SHA256 is unset.
 */
const OFFICIAL_SHA = '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a'

const dataRoot = mkdtempSync(join(tmpdir(), 'image-model-'))
process.env.TOOLS_DATA_DIR = dataRoot
process.env.IMAGE_MODEL_PATH = ''
process.env.IMAGE_MODEL_SHA256 = ''
process.env.IMAGE_MODEL_URL = ''

const mod = await import('../../server/modules/image/model-installer')

function fakeBody(bytes: Uint8Array): Response {
  return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } })
}

describe('model store path + hash defaults', () => {
  it('resolves under TOOLS_DATA_DIR/models when no override is set', () => {
    const path = mod.resolveModelPath()
    assert.ok(path.startsWith(dataRoot), `expected path under ${dataRoot}, got ${path}`)
    assert.ok(path.endsWith(join('models', 'isnet-general-use.onnx')))
  })

  it('honours IMAGE_MODEL_PATH when set', () => {
    process.env.IMAGE_MODEL_PATH = join(dataRoot, 'custom.onnx')
    try {
      assert.equal(mod.resolveModelPath(), join(dataRoot, 'custom.onnx'))
    } finally {
      process.env.IMAGE_MODEL_PATH = ''
    }
  })

  it('defaults the expected hash to the official release when unset', () => {
    process.env.IMAGE_MODEL_SHA256 = ''
    assert.equal(mod.expectedModelSha256(), OFFICIAL_SHA)
  })

  it('honours IMAGE_MODEL_SHA256 when set', () => {
    process.env.IMAGE_MODEL_SHA256 = 'deadbeef'
    try {
      assert.equal(mod.expectedModelSha256(), 'deadbeef')
    } finally {
      process.env.IMAGE_MODEL_SHA256 = ''
    }
  })
})

describe('model verification', () => {
  it('accepts a file whose SHA matches and rejects one that does not', () => {
    const good = Buffer.from('official-bytes')
    const goodSha = createHash('sha256').update(good).digest('hex')
    const goodPath = join(dataRoot, 'good.onnx')
    writeFileSync(goodPath, good)
    assert.equal(mod.verifyModel(goodPath, goodSha), true)
    assert.equal(mod.verifyModel(goodPath, OFFICIAL_SHA), false)
    assert.equal(mod.verifyModel(join(dataRoot, 'missing.onnx'), goodSha), false)
  })
})

describe('model installer', () => {
  it('downloads, verifies the hash, and writes atomically', async () => {
    const payload = Buffer.from('the-official-model-bytes-for-test')
    const sha = createHash('sha256').update(payload).digest('hex')
    const target = join(dataRoot, 'models', 'isnet-general-use.onnx')
    rmSync(join(dataRoot, 'models'), { recursive: true, force: true })

    const progress: number[] = []
    const result = await mod.installModel({
      targetPath: target,
      expectedSha256: sha,
      url: 'https://example.test/model.onnx',
      fetchImpl: (async () => fakeBody(payload)) as unknown as typeof fetch,
      onProgress: p => progress.push(p.percent ?? 0)
    })

    assert.equal(result.ok, true)
    assert.equal(existsSync(target), true)
    assert.deepEqual(readFileSync(target), payload)
    assert.equal(existsSync(`${target}.part`), false, 'no .part left behind')
  })

  it('rejects a hash mismatch and does not leave the target in place', async () => {
    const payload = Buffer.from('tampered-bytes')
    const target = join(dataRoot, 'models', 'bad.onnx')
    rmSync(join(dataRoot, 'models'), { recursive: true, force: true })

    await assert.rejects(
      mod.installModel({
        targetPath: target,
        expectedSha256: OFFICIAL_SHA,
        url: 'https://example.test/model.onnx',
        fetchImpl: (async () => fakeBody(payload)) as unknown as typeof fetch
      }),
      /MODEL_HASH_MISMATCH/
    )
    assert.equal(existsSync(target), false, 'a failed install never becomes the target')
    assert.equal(existsSync(`${target}.part`), false, 'the partial file is cleaned up')
  })

  it('refuses a non-2xx response', async () => {
    await assert.rejects(
      mod.installModel({
        targetPath: join(dataRoot, 'models', 'x.onnx'),
        expectedSha256: OFFICIAL_SHA,
        url: 'https://example.test/model.onnx',
        fetchImpl: (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch
      }),
      /MODEL_DOWNLOAD_FAILED/
    )
  })
})
