/**
 * Ephemeral-mode smoke — run against a dev server started with
 * `DOCUMENT_RUNTIME=vercel` and no storage driver.
 *
 *   PORT=4012 DOCUMENT_RUNTIME=vercel npx nuxt dev --port 4012
 *   SMOKE_BASE=http://localhost:4012 node node_modules/tsx/dist/cli.mjs \
 *     --tsconfig tsconfig.test.json tests/smoke/document-ephemeral-smoke.mts
 *
 * Mock token, synthetic user — not a signed-in browser pass.
 */
import { readFileSync } from 'node:fs'
import { SignJWT } from 'jose'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4012'

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
const ownerId = `smoke-ephemeral-${Date.now()}`

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

async function json(path: string, init: RequestInit, jwt: string) {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${jwt}`)
  const response = await fetch(`${BASE}/api/v1/documents${path}`, { ...init, headers })
  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Non-JSON body.
  }
  return { status: response.status, body }
}

async function samplePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 1; index <= pages; index++) {
    const page = doc.addPage([200, 200])
    page.drawText(`page ${index}`, { x: 20, y: 100, size: 16, font })
  }
  return new Uint8Array(await doc.save())
}

function runBody(operationId: string, files: File[], config: Record<string, unknown> = {}): FormData {
  const form = new FormData()
  form.set('operationId', operationId)
  form.set('config', JSON.stringify(config))
  for (const file of files) form.append('files', file)
  return form
}

async function main(): Promise<void> {
  console.log(`Document Studio ephemeral smoke → ${BASE}\n`)

  const health = await fetch(`${BASE}/api/v1/documents/health`)
  const healthBody = await health.json() as {
    runtime?: string
    storage?: { driver?: string, mode?: string, ephemeral?: boolean, configured?: boolean }
    limits?: { maxTotalInputBytes?: number }
  }
  console.log('1. policy reporting')
  check('health names the vercel runtime', healthBody.runtime === 'vercel', `runtime=${healthBody.runtime}`)
  check('no storage driver is selected', healthBody.storage?.driver === 'none', `driver=${healthBody.storage?.driver}`)
  check('storage is reported as ephemeral', healthBody.storage?.mode === 'ephemeral' && healthBody.storage?.ephemeral === true)
  check('the reported input cap is the inline budget', healthBody.limits?.maxTotalInputBytes === 3 * 1024 * 1024,
    `${healthBody.limits?.maxTotalInputBytes} bytes`)

  const jwt = await token()

  console.log('\n2. job routes refuse instead of faking a 404')
  const list = await json('/jobs', { method: 'GET' }, jwt)
  const listCode = (list.body as { data?: { error?: { code?: string } } }).data?.error?.code
  check('job listing answers 501', list.status === 501, `HTTP ${list.status}`)
  check('job listing names the supported alternative', listCode === 'DOCUMENT_RUNTIME_NOT_SUPPORTED', `${listCode}`)

  const create = await json('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationId: 'pdf.split' })
  }, jwt)
  check('job creation is refused too', create.status === 501, `HTTP ${create.status}`)

  console.log('\n3. one request carries input and result')
  const pdf = await samplePdf(3)
  const run = await json('/run', {
    method: 'POST',
    body: runBody('pdf.split', [new File([pdf], 'catalogue.pdf', { type: 'application/pdf' })])
  }, jwt)
  const runBodyData = (run.body as {
    data?: { status?: string, artifacts?: { fileName?: string, inlineBase64?: string }[] }
  }).data
  check('run answers 200', run.status === 200, `HTTP ${run.status}`)
  check('the job finished inside the request', runBodyData?.status === 'completed', `${runBodyData?.status}`)
  const artifacts = runBodyData?.artifacts ?? []
  check('one artifact per page', artifacts.length === 3, `${artifacts.length} artifact(s)`)
  const first = artifacts[0]?.inlineBase64 ? Buffer.from(artifacts[0].inlineBase64!, 'base64') : Buffer.alloc(0)
  check('artifact bytes ride along in the response', first.subarray(0, 4).toString() === '%PDF', `${first.length} bytes`)

  console.log('\n4. the inline budget is enforced')
  const oversized = new Uint8Array(3_500_000)
  const refused = await json('/run', {
    method: 'POST',
    body: runBody('pdf.split', [new File([oversized], 'huge.pdf', { type: 'application/pdf' })])
  }, jwt)
  const refusedCode = (refused.body as { data?: { error?: { code?: string } } }).data?.error?.code
  check('a body above the inline budget is rejected', refused.status === 413, `HTTP ${refused.status}`)
  check('the rejection names the size limit', refusedCode === 'DOCUMENT_TOTAL_SIZE_EXCEEDED', `${refusedCode}`)

  console.log('')
  if (failures > 0) {
    console.log(`${failures} check(s) failed`)
    process.exitCode = 1
    return
  }
  console.log('ALL CHECKS PASSED')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
