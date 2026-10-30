/**
 * R152 API-level verification for the web runtime media upload:
 *   1. login against the hub prod control plane -> accessToken
 *   2. POST /api/v1/media/upload (raw octet-stream) -> /uploads/<stored>
 *   3. GET /uploads/<stored> streams the bytes back, honors Range (206)
 *   4. traversal / traversal-encoded requests are refused (404)
 *   5. unauthenticated upload is refused (401) and unknown ext (400)
 */
const base = 'http://localhost:4002'
const hub = 'https://tm-hub-app.vercel.app'
const appId = 'tm-tools_bbx58v'
const email = 'tools-root@example.com'
const password = 'b15@bE&B'
const clip = 'C:/Users/tuanmjnh/AppData/Local/Temp/opencode/scratch/web-upload-clip.mp4'
const fs = await import('node:fs')

let passed = 0
let failed = 0
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`[ok] ${name}`) }
  else { failed++; console.error(`[FAIL] ${name}  ${detail}`) }
}

async function main() {
  // --- login to the hub control plane ---
  const loginRes = await fetch(`${hub}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-App-Id': appId },
    body: JSON.stringify({ email, password, appId })
  })
  const loginBody = await loginRes.json()
  const token = loginBody?.data?.accessToken
  check('hub login returns an accessToken', !!token, `status ${loginRes.status}`)

  // --- 1: authorized upload of a real mp4 ---
  const bytes = fs.readFileSync(clip)
  const up = await fetch(`${base}/api/v1/media/upload?name=${encodeURIComponent('web-upload-clip.mp4')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', cookie: `accessToken=${token}` },
    body: bytes
  })
  const upBody = await up.json()
  check('upload accepted (200) with an ok envelope', up.status === 200 && upBody.ok === true, JSON.stringify(upBody))
  check('upload kind=video and url under /uploads/', upBody.kind === 'video' && typeof upBody.url === 'string' && upBody.url.startsWith('/uploads/'), JSON.stringify(upBody))
  check('upload echoes the byte size', upBody.size === bytes.length, `${upBody.size} vs ${bytes.length}`)
  const storedUrl = upBody?.url || ''

  // --- 2: serve with content-length + full GET ---
  const get = await fetch(`${base}${storedUrl}`)
  const buf = Buffer.from(await get.arrayBuffer())
  check('serve GET 200 with video/mp4', get.status === 200 && (get.headers.get('content-type') || '') === 'video/mp4', `${get.status} ${get.headers.get('content-type')}`)
  check('serve byte-for-byte round trip', Buffer.compare(buf, bytes) === 0)
  check('serve declares Accept-Ranges', get.headers.get('accept-ranges') === 'bytes')

  // --- 3: range request -> 206 partial ---
  const part = await fetch(`${base}${storedUrl}`, { headers: { range: 'bytes=0-499' } })
  const partBuf = Buffer.from(await part.arrayBuffer())
  check('range request answered 206', part.status === 206, `status ${part.status}`)
  check('206 content-range header correct', part.headers.get('content-range') === `bytes 0-499/${bytes.length}`, part.headers.get('content-range'))
  check('206 body length is exactly 500', partBuf.length === 500 && Buffer.compare(partBuf, bytes.subarray(0, 500)) === 0)
  const suffixRange = await fetch(`${base}${storedUrl}`, { headers: { range: 'bytes=-100' } })
  check('suffix range is 206 with the last 100 bytes', suffixRange.status === 206 && (await suffixRange.arrayBuffer()).byteLength === 100)
  const badRange = await fetch(`${base}${storedUrl}`, { headers: { range: 'bytes=999999999-' } })
  check('unsatisfiable range is 416', badRange.status === 416, `status ${badRange.status}`)

  // --- 4: traversal guards ---
  const trav = await fetch(`${base}/uploads/..%2F..%2F..%2F.env`)
  check('encoded traversal is 404', trav.status === 404, `status ${trav.status}`)
  const travRaw = await fetch(`${base}/uploads/%2e%2e%2fpkg.json`)
  check('dot-dir traversal variant is 404', travRaw.status === 404, `status ${travRaw.status}`)
  const nada = await fetch(`${base}/uploads/missing-file-xyz.mp4`)
  check('missing stored file is 404', nada.status === 404, `status ${nada.status}`)

  // --- 5: auth + validation gates ---
  const anonUp = await fetch(`${base}/api/v1/media/upload?name=t.mp4`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.from([1, 2, 3])
  })
  check('anonymous upload refused (401)', anonUp.status === 401, `status ${anonUp.status}`)
  const badName = await fetch(`${base}/api/v1/media/upload?name=t.executable`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: `accessToken=${token}` }, body: Buffer.from([1])
  })
  check('non-media extension refused (400)', badName.status === 400, `status ${badName.status}`)
  const empty = await fetch(`${base}/api/v1/media/upload?name=t.mp4`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: `accessToken=${token}` }
  })
  check('empty body refused (400)', empty.status === 400, `status ${empty.status}`)

  // --- 6: image upload path (thumb pipeline uses it as well) ---
  const png = fs.readFileSync('C:/Users/tuanmjnh/AppData/Local/Temp/opencode/scratch/web-upload-pic.png')
  const up2 = await fetch(`${base}/api/v1/media/upload?name=pokus%20pic.png`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: `accessToken=${token}` }, body: png
  })
  const up2Body = await up2.json()
  check('image upload accepted with kind=image', up2.status === 200 && up2Body.kind === 'image', JSON.stringify(up2Body))
  const get2 = await fetch(`${base}${up2Body.url}`)
  check('image serves back as image/png', get2.status === 200 && get2.headers.get('content-type') === 'image/png')

  console.log(`web-upload-api: ${passed} passed${failed ? `, ${failed} FAILED` : ''}`)
  if (failed) process.exit(1)
}

main().catch((error) => { console.error(error); process.exit(1) })
