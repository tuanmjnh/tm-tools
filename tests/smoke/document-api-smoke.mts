/**
 * Document Studio API smoke — run against a local dev server.
 *
 * This is an API integration check with a *mock* token: it signs a JWT with the
 * same local secret the dev server verifies, for a synthetic user id. It is not
 * a signed-in browser pass, and it never uses a real account or seed credential.
 *
 *   node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/smoke/document-api-smoke.mts
 */
import { readFileSync } from 'node:fs'
import { SignJWT } from 'jose'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4002'

function envFromFile(key: string): string | undefined {
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const match = line.match(new RegExp(`^${key}=(.*)$`))
      if (match) return match[1]!.trim()
    }
  } catch {
    // No .env: fall back to the process environment.
  }
  return process.env[key]
}

const secret = envFromFile('AUTH_JWT_SECRET') ?? process.env.AUTH_JWT_SECRET ?? ''
const appId = envFromFile('NUXT_PUBLIC_HUB_APP_ID') ?? 'tm-tools'
const ownerId = `smoke-${Date.now()}`

let failures = 0
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failures++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function token(): Promise<string> {
  if (!secret) throw new Error('AUTH_JWT_SECRET is not available')
  return new SignJWT({ userId: ownerId, appId, role: 'user', permissions: [] })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret))
}

/** The shape the Hub actually signs: `sub` + `roles[]`, never `userId`. */
async function hubToken(sub: string): Promise<string> {
  if (!secret) throw new Error('AUTH_JWT_SECRET is not available')
  return new SignJWT({ sub, appId, roles: ['user'], permissions: [] })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret))
}

async function api(path: string, init: RequestInit = {}, jwt?: string) {
  const headers = new Headers(init.headers)
  if (jwt) headers.set('authorization', `Bearer ${jwt}`)
  const response = await fetch(`${BASE}/api/v1/documents${path}`, { ...init, headers })
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Binary or empty body.
  }
  return { status: response.status, body, headers: response.headers }
}

async function samplePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 1; index <= pages; index++) {
    const page = doc.addPage([200, 200])
    page.drawText(`page ${index}`, { x: 20, y: 100, size: 16, font })
  }
  return Buffer.from(await doc.save())
}

/** Reads the ZIP central directory so the check proves the archive is valid. */
function zipEntries(zip: Buffer): { name: string, size: number }[] {
  const end = zip.length - 22
  if (zip.readUInt32LE(end) !== 0x06054b50) return []
  const count = zip.readUInt16LE(end + 10)
  let offset = zip.readUInt32LE(end + 16)
  const entries: { name: string, size: number }[] = []
  for (let index = 0; index < count; index++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) return []
    const size = zip.readUInt32LE(offset + 24)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    entries.push({ name, size })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function main(): Promise<void> {
  console.log(`Document Studio API smoke → ${BASE}\n`)

  console.log('1. unauthenticated protection')
  const anonymous = await api('/operations')
  check('operations without a session is rejected', anonymous.status === 401, `HTTP ${anonymous.status}`)

  const jwt = await token()

  console.log('\n2. catalogue and capabilities')
  const catalog = await api('/operations', {}, jwt)
  check('catalogue answers 200 with a mock token', catalog.status === 200, `HTTP ${catalog.status}`)
  const operations = (catalog.body as { data?: { operations?: { id: string, available: boolean }[] } }).data?.operations ?? []
  // AI extraction is intentionally absent: it still runs on /pdf/extract and
  // gains a v4 executor in Phase 7, so the catalogue only lists what has one.
  check('six executable operations are published', operations.length === 6, `${operations.length} operations`)
  check('AI extraction is not offered by the v4 catalogue yet', !operations.some(entry => entry.id === 'document.ai-extract'))
  check('split is available locally', operations.some(entry => entry.id === 'pdf.split' && entry.available))

  const health = await fetch(`${BASE}/api/v1/documents/health`)
  const healthBody = await health.json() as { runtime?: string, operations?: { id: string }[] }
  check('health is public and names the runtime', health.status === 200 && healthBody.runtime === 'local', `runtime=${healthBody.runtime}`)
  const healthIds = (healthBody.operations ?? []).map(entry => entry.id).sort()
  const catalogIds = operations.map(entry => entry.id).sort()
  check(
    'health lists exactly the executable operations',
    JSON.stringify(healthIds) === JSON.stringify(catalogIds),
    `${healthIds.length} health / ${catalogIds.length} catalogue`
  )
  const healthText = JSON.stringify(healthBody)
  check('health leaks no credential-looking value', !/postgres(ql)?:\/\/|accessKeyId|secret/i.test(healthText))

  console.log('\n3. create → upload → start → download → delete')
  const idempotencyKey = `smoke-${Date.now()}-key`
  const created = await api('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ operationId: 'pdf.split', config: {} })
  }, jwt)
  const jobId = (created.body as { data?: { id?: string } }).data?.id ?? ''
  check('draft job created', created.status === 200 && Boolean(jobId), jobId)

  const retried = await api('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ operationId: 'pdf.split', config: {} })
  }, jwt)
  const retriedId = (retried.body as { data?: { id?: string } }).data?.id ?? ''
  check('a retried create returns the first job', retried.status === 200 && retriedId === jobId, retriedId)

  const pdf = await samplePdf(3)
  const form = new FormData()
  form.append('files', new Blob([pdf], { type: 'application/pdf' }), 'smoke.pdf')
  const uploaded = await api(`/jobs/${jobId}/inputs`, { method: 'POST', body: form }, jwt)
  const inputs = (uploaded.body as { data?: { id: string }[] }).data ?? []
  check('input staged', uploaded.status === 200 && inputs.length === 1, `${inputs.length} input(s)`)

  const started = await api(`/jobs/${jobId}/start`, { method: 'POST' }, jwt)
  const startedBody = started.body as { data?: { status?: string, artifacts?: { id: string, fileName: string }[] } }
  check('job completed', started.status === 200 && startedBody.data?.status === 'completed', startedBody.data?.status ?? '')
  const artifacts = startedBody.data?.artifacts ?? []
  check('one artifact per page', artifacts.length === 3, `${artifacts.length} artifact(s)`)

  if (artifacts[0]) {
    const download = await fetch(`${BASE}/api/v1/documents/jobs/${jobId}/artifacts/${artifacts[0].id}/download`, {
      headers: { authorization: `Bearer ${jwt}` }
    })
    const bytes = Buffer.from(await download.arrayBuffer())
    check('artifact downloads as a real PDF', download.status === 200 && bytes.subarray(0, 4).toString() === '%PDF', `${bytes.length} bytes`)
    check('download carries a filename', (download.headers.get('content-disposition') ?? '').includes('attachment'))
  }

  const foreign = await new SignJWT({ userId: 'someone-else', appId, role: 'user', permissions: [] })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))

  if (artifacts[0]) {
    const archive = await fetch(`${BASE}/api/v1/documents/jobs/${jobId}/artifacts/archive`, {
      headers: { authorization: `Bearer ${jwt}` }
    })
    const zip = Buffer.from(await archive.arrayBuffer())
    check('multi-artifact job downloads as one ZIP', archive.status === 200 && zip.subarray(0, 2).toString() === 'PK', `${zip.length} bytes`)
    const archived = zipEntries(zip)
    check(
      'archive carries one valid entry per artifact',
      archived.length === artifacts.length && archived.some(entry => entry.name === 'page_0003.pdf'),
      archived.map(entry => entry.name).join(', ')
    )
    check('archive entries are non-empty', archived.every(entry => entry.size > 0))

    const foreignArchive = await fetch(`${BASE}/api/v1/documents/jobs/${jobId}/artifacts/archive`, {
      headers: { authorization: `Bearer ${foreign}` }
    })
    check('a foreign token cannot download the archive', foreignArchive.status === 404, `HTTP ${foreignArchive.status}`)
  }

  if (artifacts[0]) {
    const foreignDownload = await fetch(`${BASE}/api/v1/documents/jobs/${jobId}/artifacts/${artifacts[0].id}/download`, {
      headers: { authorization: `Bearer ${foreign}` }
    })
    check('a foreign token cannot download the artifact', foreignDownload.status === 404, `HTTP ${foreignDownload.status}`)
  }

  const deleted = await api(`/jobs/${jobId}`, { method: 'DELETE' }, jwt)
  check('job delete answers 200', deleted.status === 200, `HTTP ${deleted.status}`)
  const gone = await api(`/jobs/${jobId}`, {}, jwt)
  check('deleted job is gone', gone.status === 404, `HTTP ${gone.status}`)

  console.log('\n4. validation before upload')
  const rejected = await api('/operations/pdf.split/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files: [{ name: 'notes.docx', size: 10 }] })
  }, jwt)
  const issues = (rejected.body as { data?: { issues?: { code: string }[] } }).data?.issues ?? []
  check('pre-flight rejects a wrong type', rejected.status === 200 && issues.some(issue => issue.code === 'DOCUMENT_INPUT_TYPE_NOT_SUPPORTED'))

  console.log('\n5. hub-shaped token (`sub` + `roles[]`, no `userId`)')
  const hubJwt = await hubToken(`hub-${Date.now()}`)
  const hubCatalog = await api('/operations', {}, hubJwt)
  check('catalogue accepts a Hub-shaped token', hubCatalog.status === 200, `HTTP ${hubCatalog.status}`)

  const hubJob = await api('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationId: 'pdf.split', config: {} })
  }, hubJwt)
  const hubJobId = (hubJob.body as { data?: { id?: string } }).data?.id ?? ''
  check('Hub-shaped token can create a job', hubJob.status === 200 && Boolean(hubJobId), hubJobId)

  if (hubJobId) {
    const hubPdf = await samplePdf(1)
    const hubForm = new FormData()
    hubForm.append('files', new Blob([hubPdf], { type: 'application/pdf' }), 'hub.pdf')
    await api(`/jobs/${hubJobId}/inputs`, { method: 'POST', body: hubForm }, hubJwt)
    const hubStarted = await api(`/jobs/${hubJobId}/start`, { method: 'POST' }, hubJwt)
    const hubBody = hubStarted.body as { data?: { status?: string, artifacts?: unknown[] } }
    check('Hub-shaped token completes a job', hubStarted.status === 200 && hubBody.data?.status === 'completed', hubBody.data?.status ?? '')
    const hubArtifact = (hubBody.data?.artifacts ?? [])[0] as { id?: string } | undefined
    if (hubArtifact?.id) {
      const hubDownload = await fetch(`${BASE}/api/v1/documents/jobs/${hubJobId}/artifacts/${hubArtifact.id}/download`, {
        headers: { authorization: `Bearer ${hubJwt}` }
      })
      const hubBytes = Buffer.from(await hubDownload.arrayBuffer())
      check('Hub-shaped token downloads its artifact', hubDownload.status === 200 && hubBytes.subarray(0, 4).toString() === '%PDF', `${hubBytes.length} bytes`)
    }
    await api(`/jobs/${hubJobId}`, { method: 'DELETE' }, hubJwt)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

await main()
