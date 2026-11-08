import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// `useRuntimeConfig` is read per call, so the Hub endpoint must exist first.
const dataRoot = mkdtempSync(join(tmpdir(), 'document-hub-storage-'))
const HUB = 'http://127.0.0.1:4999'
const APP = 'tm-tools'
const STORAGE = `${HUB}/api/v1/apps/${APP}/storage`
process.env.PDF_DATA_DIR = dataRoot
process.env.DOCUMENT_RUNTIME = 'local'
process.env.NUXT_PUBLIC_HUB_URL = HUB
process.env.NUXT_PUBLIC_HUB_APP_ID = APP
process.env.NUXT_HUB_APP_SECRET = 'app-secret'

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}

const calls: Call[] = []
let reply: (call: Call) => Response = () => new Response('{}', { status: 500 })
const realFetch = globalThis.fetch

// Nitro injects this auto-import; a plain `tsx` process does not.
;(globalThis as Record<string, unknown>).useRuntimeConfig = () => ({
  hubAppSecret: process.env.NUXT_HUB_APP_SECRET ?? '',
  public: {
    hubUrl: process.env.NUXT_PUBLIC_HUB_URL ?? '',
    hubAppId: process.env.NUXT_PUBLIC_HUB_APP_ID ?? ''
  }
})

const { HubStorageError, hubStorageClient, hubTarget } = await import('../../server/utils/hubStorage')
const { HubStorageProvider, hubObjectKey } = await import('../../server/modules/document/hub-storage')
const { DocumentError } = await import('../../server/modules/document/operations')

function event(token?: string) {
  return { context: token ? { auth: { token } } : {} } as never
}

const SIGNED = 'https://provider.invalid/bucket/object?X-Amz-Signature=secret-token'

const OBJECT = {
  objectId: 'obj-1',
  connectionId: 'conn-1',
  namespace: 'tm-tools/pdf',
  relativePath: 'abc/jobs/job-1/inputs/in-1/a.pdf',
  fileName: 'a.pdf',
  contentType: 'application/pdf',
  sizeBytes: 8,
  checksumSha256: 'sha-8',
  status: 'ready'
}

function success(data: unknown): Response {
  return Response.json({ success: true, data })
}

function failure(status: number, statusMessage: string, message = 'refused'): Response {
  return Response.json({ error: true, statusCode: status, statusMessage, message }, { status })
}

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headerEntries = [...new Headers(init?.headers).entries()]
    const body = init?.body
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers: Object.fromEntries(headerEntries),
      body: typeof body === 'string' ? JSON.parse(body) : body
    }
    calls.push(call)
    return reply(call)
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = realFetch
  rmSync(dataRoot, { recursive: true, force: true })
})

beforeEach(() => {
  calls.length = 0
})

function header(call: Call, name: string): string | undefined {
  return call.headers[name.toLowerCase()] ?? call.headers[name]
}

function hubCalls(): Call[] {
  return calls.filter(call => call.url.startsWith(HUB))
}

describe('hub storage gateway client', () => {
  it('names the app and sends the app secret as a header, not a query', () => {
    const target = hubTarget(event('user-jwt'))
    assert.equal(target.baseUrl, STORAGE)
    assert.equal(target.headers['X-App-Id'], APP)
    assert.equal(target.headers['X-App-Secret'], 'app-secret')
    assert.equal(target.headers.Authorization, 'Bearer user-jwt')
    assert.equal(target.baseUrl.includes('app-secret'), false)
    assert.ok(target.requestId.length > 0)
  })

  it('carries the signed-in user token so Hub can attribute the call', () => {
    assert.equal(hubTarget(event('abc')).headers.Authorization, 'Bearer abc')
    assert.equal(hubTarget(event()).headers.Authorization, undefined)
  })

  it('uses the raw bearer the middleware kept, not the decoded payload', () => {
    const withRaw = { context: { auth: { userId: 'u-1' }, authToken: 'raw-jwt' } } as never
    assert.equal(hubTarget(withRaw).headers.Authorization, 'Bearer raw-jwt')
  })

  it('refuses to build a target without the app secret instead of calling Hub anonymously', () => {
    const saved = process.env.NUXT_HUB_APP_SECRET
    delete process.env.NUXT_HUB_APP_SECRET
    assert.throws(
      () => hubTarget(event()),
      (error: unknown) => error instanceof HubStorageError && error.code === 'integrations.hubStorageNotConfigured'
    )
    process.env.NUXT_HUB_APP_SECRET = saved
  })
})

describe('hub storage gateway responses', () => {
  it('reads connections out of the success/data envelope', async () => {
    reply = () => success({
      connections: [{
        connectionId: 'conn-1',
        provider: 'r2',
        name: 'pdf',
        label: 'PDF bucket',
        environment: 'production',
        origin: 'own',
        capabilities: { directUpload: true, directDownload: true, multipartUpload: false, rangeRead: true, copyObject: false, listObjects: false }
      }]
    })

    const list = await hubStorageClient(event('jwt')).connections()
    assert.equal(list.length, 1)
    assert.equal(list[0]!.connectionId, 'conn-1')
    assert.equal(list[0]!.capabilities.directUpload, true)
    assert.equal(hubCalls()[0]!.method, 'GET')
    assert.equal(hubCalls()[0]!.url, `${STORAGE}/connections`)
  })

  it('signs one upload with the gateway body and maps uploadUrl to url', async () => {
    reply = () => success({
      uploadId: 'up-1',
      objectId: 'obj-1',
      connectionId: 'conn-1',
      objectKey: 'apps/tm-tools/production/tm-tools/pdf/a.pdf',
      method: 'PUT',
      uploadUrl: SIGNED,
      headers: { 'x-amz-acl': 'private' },
      expiresAt: '2026-11-07T01:00:00Z',
      maxBytes: 8,
      transferMode: 'single'
    })

    const grant = await hubStorageClient(event('jwt')).initUpload({
      connectionId: 'conn-1',
      namespace: 'tm-tools/pdf',
      relativePath: 'abc/jobs/job-1/inputs/in-1/a.pdf',
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 8
    })

    const call = hubCalls()[0]!
    assert.equal(call.method, 'POST')
    assert.equal(call.url, `${STORAGE}/uploads/initiate`)
    assert.deepEqual(call.body, {
      connectionId: 'conn-1',
      namespace: 'tm-tools/pdf',
      relativePath: 'abc/jobs/job-1/inputs/in-1/a.pdf',
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 8,
      overwrite: false
    })
    assert.equal(grant.uploadId, 'up-1')
    assert.equal(grant.objectId, 'obj-1')
    assert.equal(grant.url, SIGNED)
    assert.equal(grant.method, 'PUT')
    assert.equal(grant.headers['x-amz-acl'], 'private')
  })

  it('refuses a multipart plan instead of silently uploading one part', async () => {
    reply = () => success({
      uploadId: 'up-1',
      objectId: 'obj-1',
      uploadUrl: SIGNED,
      method: 'PUT',
      headers: {},
      expiresAt: '2026-11-07T01:00:00Z',
      transferMode: 'multipart'
    })

    await assert.rejects(
      hubStorageClient(event('jwt')).initUpload({
        connectionId: 'conn-1',
        namespace: 'ns',
        relativePath: 'x.pdf',
        fileName: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10
      }),
      (error: unknown) => error instanceof HubStorageError
        && error.code === 'integrations.hubStorageRejected'
        && error.detail.hubCode === 'storage.multipart_not_supported'
    )
  })

  it('completes an upload and returns the provider-verified object', async () => {
    reply = () => success({ uploadId: 'up-1', status: 'ready', object: OBJECT })

    const completed = await hubStorageClient(event('jwt')).completeUpload('up-1')
    assert.equal(hubCalls()[0]!.method, 'POST')
    assert.equal(hubCalls()[0]!.url, `${STORAGE}/uploads/up-1/complete`)
    assert.equal(completed.object?.objectId, 'obj-1')
    assert.equal(completed.object?.status, 'ready')
  })

  it('treats a missing object as absent, not as a failure', async () => {
    reply = () => failure(404, 'storage.object_not_found')
    assert.equal(await hubStorageClient(event('jwt')).getObject('obj-1'), null)
  })

  it('treats 404 on delete as already gone', async () => {
    reply = () => failure(404, 'storage.object_not_found')
    await hubStorageClient(event('jwt')).deleteObject('obj-1')
    assert.equal(hubCalls()[0]!.method, 'DELETE')
    assert.equal(hubCalls()[0]!.url, `${STORAGE}/objects/obj-1`)
  })

  it('asks for a download grant and keeps the signed URL inside the client', async () => {
    reply = () => success({
      objectId: 'obj-1',
      downloadUrl: SIGNED,
      expiresAt: '2026-11-07T01:00:00Z',
      contentType: 'application/pdf',
      contentLength: 8,
      fileName: 'a.pdf'
    })

    const grant = await hubStorageClient(event('jwt')).createDownloadGrant('obj-1')
    assert.equal(hubCalls()[0]!.url, `${STORAGE}/objects/obj-1/download-grant`)
    assert.equal(grant.url, SIGNED)
    assert.equal(grant.contentLength, 8)
  })

  it('maps a rejected grant to a typed error with the Hub correlation id', async () => {
    reply = () => failure(403, 'storage.namespace_not_allowed', 'namespace not granted')

    await assert.rejects(
      hubStorageClient(event('jwt')).initUpload({
        connectionId: 'conn-1',
        namespace: 'ns',
        relativePath: 'x.pdf',
        fileName: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10
      }),
      (error: unknown) => {
        assert.ok(error instanceof HubStorageError)
        assert.equal(error.code, 'integrations.hubStorageUnauthorized')
        assert.equal(error.status, 403)
        assert.equal(error.detail.hubCode, 'storage.namespace_not_allowed')
        assert.ok(error.detail.requestId)
        return true
      }
    )
  })

  it('never puts the signed upload URL in the error it raises', async () => {
    reply = () => failure(403, 'storage.upload_type_not_allowed', `refused ${SIGNED}`)

    const error = await hubStorageClient(event('jwt'))
      .initUpload({
        connectionId: 'conn-1',
        namespace: 'ns',
        relativePath: 'x.pdf',
        fileName: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10
      })
      .then(() => null, (reason: unknown) => reason)

    assert.ok(error instanceof HubStorageError)
    const serialized = JSON.stringify({ message: error.message, detail: error.detail })
    assert.equal(serialized.includes('X-Amz-Signature'), false)
    assert.equal(serialized.includes('secret-token'), false)
  })
})

describe('hub storage provider', () => {
  const ref = {
    provider: 's3-compatible' as const,
    key: 'obj-1',
    ownerId: 'owner-1',
    size: 8,
    mimeType: 'application/pdf'
  }

  function provider(connectionId = 'conn-1') {
    return new HubStorageProvider(event('jwt'), 'tm-tools/pdf', connectionId)
  }

  it('keeps the relative path opaque and free of the raw owner id', () => {
    const key = hubObjectKey('owner-1', 'job-1', 'input', 'in-1', 'a.pdf')
    assert.match(key, /^[0-9a-f]{16}\/jobs\/job-1\/inputs\/in-1\/a\.pdf$/)
    assert.equal(key.includes('owner-1'), false)
  })

  it('hands the browser the signed grant and remembers the objectId, not the bucket key', async () => {
    reply = () => success({
      uploadId: 'up-1',
      objectId: 'obj-1',
      connectionId: 'conn-1',
      method: 'PUT',
      uploadUrl: SIGNED,
      headers: { 'x-amz-acl': 'private' },
      expiresAt: '2026-11-07T01:00:00Z',
      transferMode: 'single'
    })

    const target = await provider().createUploadTarget({
      ownerId: 'owner-1',
      jobId: 'job-1',
      inputId: 'in-1',
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      size: 8
    })

    assert.equal(target.url, SIGNED)
    assert.equal(target.method, 'PUT')
    assert.equal(target.headers?.['x-amz-acl'], 'private')
    assert.equal(target.uploadId, 'up-1')
    assert.equal(target.ref.key, 'obj-1')
    assert.equal(target.expiresAt, '2026-11-07T01:00:00Z')

    const initiate = hubCalls().find(call => call.url.endsWith('/uploads/initiate'))
    assert.ok(initiate)
    const body = initiate.body as Record<string, unknown>
    assert.equal(body.connectionId, 'conn-1')
    assert.equal(body.namespace, 'tm-tools/pdf')
    assert.match(String(body.relativePath), /^[0-9a-f]{16}\/jobs\/job-1\/inputs\/in-1\/a\.pdf$/)
    assert.equal(body.sizeBytes, 8)
  })

  it('uses the connection Hub grants when none is configured', async () => {
    reply = (call) => {
      if (call.url.endsWith('/connections')) {
        return success({
          connections: [{
            connectionId: 'auto-conn',
            provider: 'r2',
            name: 'pdf',
            label: null,
            environment: 'production',
            origin: 'own',
            capabilities: { directUpload: true, directDownload: true, multipartUpload: false, rangeRead: false, copyObject: false, listObjects: false }
          }]
        })
      }
      return success({
        uploadId: 'up-1',
        objectId: 'obj-1',
        method: 'PUT',
        uploadUrl: SIGNED,
        headers: {},
        expiresAt: '2026-11-07T01:00:00Z',
        transferMode: 'single'
      })
    }

    await provider('').createUploadTarget({
      ownerId: 'owner-1',
      jobId: 'job-1',
      inputId: 'in-1',
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      size: 8
    })

    const initiate = hubCalls().find(call => call.url.endsWith('/uploads/initiate'))
    assert.equal((initiate?.body as Record<string, unknown>).connectionId, 'auto-conn')
  })

  it('says storage is not configured when the app has no upload-capable connection', async () => {
    reply = () => success({ connections: [] })

    await assert.rejects(
      provider('').createUploadTarget({
        ownerId: 'owner-1',
        jobId: 'job-1',
        inputId: 'in-1',
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        size: 8
      }),
      (error: unknown) => error instanceof DocumentError
        && error.code === 'DOCUMENT_STORAGE_NOT_CONFIGURED'
        && error.details?.reason === 'no-hub-storage-connection'
    )
  })

  it('completes the upload session and verifies the recorded size', async () => {
    reply = () => success({ uploadId: 'up-1', status: 'ready', object: OBJECT })
    assert.deepEqual(await provider().verifyUploadedObject(ref, 'up-1'), { ref, verified: true })
    assert.equal(hubCalls()[0]!.url, `${STORAGE}/uploads/up-1/complete`)
  })

  it('refuses a truncated upload instead of publishing it', async () => {
    reply = () => success({ uploadId: 'up-1', status: 'ready', object: { ...OBJECT, sizeBytes: 4 } })
    const result = await provider().verifyUploadedObject(ref, 'up-1')
    assert.equal(result.verified, false)
    assert.equal(result.reason, 'size-mismatch')
  })

  it('does not accept a session that resolved to a different object', async () => {
    reply = () => success({ uploadId: 'up-1', status: 'ready', object: { ...OBJECT, objectId: 'obj-other' } })
    const result = await provider().verifyUploadedObject(ref, 'up-1')
    assert.equal(result.verified, false)
    assert.equal(result.reason, 'missing')
  })

  it('verifies by objectId when the client has no session to complete', async () => {
    reply = () => success({ object: OBJECT })
    assert.deepEqual(await provider().verifyUploadedObject(ref), { ref, verified: true })
    assert.equal(hubCalls()[0]!.url, `${STORAGE}/objects/obj-1`)
  })

  it('reports an object Hub does not know as missing', async () => {
    reply = () => failure(404, 'storage.object_not_found')
    const result = await provider().verifyUploadedObject(ref)
    assert.equal(result.verified, false)
    assert.equal(result.reason, 'missing')
  })

  it('streams artifact bytes through the download grant without exposing it', async () => {
    reply = (call) => {
      if (call.url.endsWith('/download-grant')) {
        return success({
          objectId: 'obj-1',
          downloadUrl: SIGNED,
          expiresAt: '2026-11-07T01:00:00Z',
          contentType: 'application/pdf',
          contentLength: 3,
          fileName: 'a.pdf'
        })
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-length': '3' }
      })
    }

    const stream = await provider().createReadStream(ref)
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))

    assert.deepEqual([...Buffer.concat(chunks)], [1, 2, 3])
    const grant = hubCalls().find(call => call.url.endsWith('/download-grant'))
    assert.ok(grant)
    assert.equal(header(grant, 'authorization'), 'Bearer jwt')
    assert.equal(calls.at(-1)!.url, SIGNED)
  })

  it('publishes an output with a grant, then reports the stored objectId', async () => {
    reply = (call) => {
      if (call.url.endsWith('/uploads/initiate')) {
        return success({
          uploadId: 'up-2',
          objectId: 'obj-2',
          method: 'PUT',
          uploadUrl: SIGNED,
          headers: { 'x-amz-acl': 'private' },
          expiresAt: '2026-11-07T01:00:00Z',
          transferMode: 'single'
        })
      }
      if (call.url === SIGNED) return new Response('', { status: 200 })
      return success({ uploadId: 'up-2', status: 'ready', object: { ...OBJECT, objectId: 'obj-2', sizeBytes: 4 } })
    }

    const stored = await provider().putObject({
      ownerId: 'owner-1',
      key: 'job/job-1/output/result.pdf',
      data: Buffer.from([1, 2, 3, 4]),
      mimeType: 'application/pdf'
    })

    assert.equal(stored.key, 'obj-2')
    assert.equal(stored.size, 4)
    const initiate = hubCalls().find(call => call.url.endsWith('/uploads/initiate'))
    assert.ok(initiate)
    const body = initiate.body as Record<string, unknown>
    assert.match(String(body.relativePath), /^[0-9a-f]{16}\/job\/job-1\/output\/result\.pdf$/)
    assert.equal(body.fileName, 'result.pdf')
    assert.equal(body.sizeBytes, 4)
    assert.equal(body.overwrite, true)

    const upload = calls.find(call => call.url === SIGNED)
    assert.ok(upload)
    assert.equal(upload.method, 'PUT')
    assert.ok(hubCalls().some(call => call.url === `${STORAGE}/uploads/up-2/complete`))
  })

  it('aborts the session when the provider rejects the bytes', async () => {
    reply = (call) => {
      if (call.url.endsWith('/uploads/initiate')) {
        return success({
          uploadId: 'up-3',
          objectId: 'obj-3',
          method: 'PUT',
          uploadUrl: SIGNED,
          headers: {},
          expiresAt: '2026-11-07T01:00:00Z',
          transferMode: 'single'
        })
      }
      return new Response('', { status: 500 })
    }

    await assert.rejects(
      provider().putObject({
        ownerId: 'owner-1',
        key: 'job/job-1/output/result.pdf',
        data: Buffer.from([1]),
        mimeType: 'application/pdf'
      }),
      (error: unknown) => error instanceof DocumentError && error.code === 'DOCUMENT_STORAGE_UNAVAILABLE'
    )

    assert.ok(hubCalls().some(call => call.url === `${STORAGE}/uploads/up-3/abort`))
  })

  it('turns a Hub outage into a typed storage error that keeps the correlation id', async () => {
    reply = () => failure(503, 'storage.provider_unavailable', 'provider offline')

    await assert.rejects(
      provider().verifyUploadedObject(ref),
      (error: unknown) => {
        assert.ok(error instanceof DocumentError)
        assert.equal(error.code, 'DOCUMENT_STORAGE_UNAVAILABLE')
        assert.equal(error.details?.reason, 'integrations.hubStorageFailed')
        assert.ok(error.details?.requestId)
        return true
      }
    )
  })

  it('reports an expired artifact when Hub can no longer grant a download', async () => {
    reply = () => failure(404, 'storage.object_not_found')

    await assert.rejects(
      provider().createReadStream(ref),
      (error: unknown) => error instanceof DocumentError && error.code === 'DOCUMENT_OUTPUT_EXPIRED'
    )
  })

  it('keeps a signed URL out of the error the route would render', async () => {
    reply = () => failure(403, 'storage.connection_not_granted', `no grant for ${SIGNED}`)

    const error = await provider().createUploadTarget({
      ownerId: 'owner-1',
      jobId: 'job-1',
      inputId: 'in-1',
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      size: 8
    }).then(() => null, (reason: unknown) => reason)

    assert.ok(error instanceof DocumentError)
    const serialized = JSON.stringify({ code: error.code, message: error.message, details: error.details })
    assert.equal(serialized.includes('X-Amz-Signature'), false)
    assert.equal(serialized.includes('secret-token'), false)
    assert.equal(error.details?.hubCode, 'storage.connection_not_granted')
  })

  it('treats a missing object on delete as already removed', async () => {
    reply = () => failure(404, 'storage.object_not_found')
    await provider().deleteObject(ref)
    assert.equal(hubCalls()[0]!.url, `${STORAGE}/objects/obj-1`)
  })
})
