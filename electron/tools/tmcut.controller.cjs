const { ipcMain, app } = require('electron')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { getToolsBinaries, getResourcesDir } = require('./paths.cjs')

const moduleName = 'tmcut'

function getDirs() {
  const base = path.join(app.getPath('userData'), 'tmcut')
  return {
    base,
    projects: path.join(base, 'projects'),
    snapshots: path.join(base, 'projects', 'snapshots'),
    assetsFile: path.join(base, 'assets.json'),
    cache: path.join(base, 'cache'),
    thumbs: path.join(base, 'cache', 'thumbnails'),
    waveforms: path.join(base, 'cache', 'waveforms'),
    frames: path.join(base, 'cache', 'frames'),
    proxies: path.join(base, 'cache', 'proxies'),
    stabilized: path.join(base, 'cache', 'stabilized'),
    stabilizedTrf: path.join(base, 'cache', 'stabilized_trf'),
    recordings: path.join(base, 'recordings')
  }
}

/**
 * Structural validation for USER-SELECTED media paths (import dialog,
 * Explorer drag-and-drop, relink). These files legitimately live anywhere
 * on the user's disks, so a root whitelist cannot apply — the old
 * whitelist here (userData + resources only) silently rejected every
 * real import: analyzeAsset -> ok:false -> asset 'missing' -> the amber
 * "unreadable media" banner on every dropped file (R110).
 *
 * Every operation behind this guard is a read-only probe/thumbnail/
 * waveform/proxy pass or a stat on a file the user explicitly added;
 * internal app files (project JSON, snapshots, cache) are keyed through
 * sanitizeId() instead and never route here. Reject empty, non-absolute
 * or unparsable paths. Forward slashes from normalizeMediaPath() are
 * fine — path.resolve() canonicalizes them.
 */
function isUserMediaPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null
  const trimmed = filePath.trim()
  if (!path.isAbsolute(trimmed)) return null
  try {
    return path.resolve(trimmed)
  } catch {
    return null
  }
}

function ensureDirs() {
  const d = getDirs()
  for (const p of [d.base, d.projects, d.snapshots, d.cache, d.thumbs, d.waveforms, d.frames, d.proxies, d.stabilized, d.stabilizedTrf, d.recordings]) {
    try {
      fs.mkdirSync(p, { recursive: true })
    } catch {
      // ignore
    }
  }
}

function sanitizeId(id) {
  const clean = String(id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  return clean || 'default'
}

function projectFile(id) {
  return path.join(getDirs().projects, `${sanitizeId(id)}.tmcut.json`)
}

function recoveryFile(id) {
  return path.join(getDirs().projects, `${sanitizeId(id)}.recovery.json`)
}

function snapshotFile(id, ts) {
  return path.join(getDirs().snapshots, `${sanitizeId(id)}-${ts}.json`)
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

// System font enumeration (roadmap C-1): resources/fontmanager.node is the
// font-scanner Node-API addon (ABI-stable — verified loading under
// Electron 43 / Node 24), and it returns each face WITH its file path, so
// the renderer picker previews a family while drawtext exports the very
// same file. Loaded lazily and cached for the session (one scan, ~50ms;
// only changes when fonts are installed). A missing/corrupt addon yields
// [] — the picker then stays hidden instead of listing faces it cannot
// resolve (honesty rule: no dead or lying controls).
let fontScanner = null
let systemFontsCache = null

function listSystemFonts() {
  if (systemFontsCache) return systemFontsCache
  if (fontScanner === null) {
    try {
      fontScanner = require(path.join(getResourcesDir(), 'fontmanager.node'))
    } catch (error) {
      console.error('fontmanager.node failed to load:', error.message)
      fontScanner = false
    }
  }
  if (!fontScanner) return []
  try {
    const faces = fontScanner.getAvailableFontsSync()
    systemFontsCache = (Array.isArray(faces) ? faces : [])
      .filter(f => f && typeof f.family === 'string' && typeof f.path === 'string' && f.family && f.path)
      .map(f => ({
        family: f.family,
        path: f.path,
        style: typeof f.style === 'string' && f.style ? f.style : 'Regular',
        weight: Number(f.weight) || 400,
        italic: !!f.italic,
        monospace: !!f.monospace
      }))
  } catch (error) {
    console.error('System font scan failed:', error.message)
    systemFontsCache = []
  }
  return systemFontsCache
}

function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

function getFileStat(filePath) {
  try {
    const st = fs.statSync(filePath)
    return { exists: st.isFile(), size: st.size, mtimeMs: st.mtimeMs }
  } catch {
    return { exists: false, size: 0, mtimeMs: 0 }
  }
}

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/')
}

function fnv1aHex(text) {
  const input = String(text || '')
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// Portable cache key (mirror of @tmcut/core src/cache.mjs — keep in sync).
// Replaces the old sha1 scheme so Electron and future Web runtimes share
// one layout (docs sections 27-28). Stale sha1-named files are simply
// orphaned cache and regenerate on demand. The `v2:` prefix marks the
// filmstrip thumbnail format (8 frames) — bump to regenerate old stills.
function cacheKeyFor(filePath, stat) {
  const raw = `v2:${toPosix(filePath).toLowerCase()}:${stat.mtimeMs}:${stat.size}`
  return fnv1aHex(raw)
}

function runFfmpeg(args, timeoutMs) {
  return new Promise((resolve) => {
    let child
    try {
      const exe = getToolsBinaries().ffmpeg
      // maxBuffer: 10 MB per stream to prevent OOM on malicious/huge output
      child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 })
    } catch (err) {
      return resolve({ ok: false, error: String((err && err.message) || err), stdout: null, stderr: '' })
    }
    let stdout = null
    let chunk = Buffer.alloc(0)
    let stderr = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // ignore
      }
    }, timeoutMs)
    child.stdout.on('data', (data) => {
      chunk = Buffer.concat([chunk, data])
    })
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, error: err.message, stdout: null, stderr })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      stdout = chunk
      resolve({ ok: code === 0, error: code === 0 ? null : stderr.slice(-500), stdout, stderr: stderr.slice(-500), code })
    })
  })
}

function probeDuration(filePath) {
  return new Promise((resolve) => {
    try {
      const exe = getToolsBinaries().ffprobe
      const child = spawn(exe, [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ])
      let out = ''
      child.stdout.on('data', (data) => {
        out += data.toString()
      })
      child.on('close', () => {
        const value = parseFloat(out.trim())
        resolve(Number.isFinite(value) && value > 0 ? value : 0)
      })
      child.on('error', () => resolve(0))
    } catch {
      resolve(0)
    }
  })
}

// Session duration cache keyed by (path, mtime, size): frame batches
// probe the same file once per job otherwise (timeline filmstrips ask
// for dozens of seeks on one source). Negative results are not cached.
const durationCache = new Map()

function probeDurationCached(filePath, stat) {
  const key = `${filePath}|${stat.mtimeMs}|${stat.size}`
  const hit = durationCache.get(key)
  if (hit !== undefined) return hit
  return probeDuration(filePath).then((value) => {
    if (value > 0) durationCache.set(key, value)
    return value
  })
}

// Roadmap C-3: Whisper transcription needs an AUDIO input (provider
// endpoints take audio containers). One-shot 16kHz mono MP3 into the
// cache dir, keyed like thumbnails — re-captioning the same source
// version reuses the file and skips extraction entirely.
async function extractCaptionAudio(filePath) {
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  ensureDirs()
  const key = cacheKeyFor(filePath, stat)
  const out = path.join(getDirs().cache, `caption-${key}.mp3`)
  if (getFileStat(out).exists) return { ok: true, path: out }
  // 16kHz mono matches Whisper's native rate — no wasted bandwidth.
  const result = await runFfmpeg(['-y', '-i', filePath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', out], 120_000)
  if (!result.ok || !getFileStat(out).exists) return { ok: false, error: result.error || 'Audio extraction failed' }
  return { ok: true, path: out }
}

async function extractThumbnail(filePath) {
  ensureDirs()
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  const key = cacheKeyFor(filePath, stat)
  // Two artifacts per video: a single-frame COVER
  // for the media-library grid and an 8-frame
  // FILMSTRIP for timeline clips. Separate files
  // keep the library thumb a plain image instead
  // of a cropped filmstrip (the earlier scheme
  // reused one filmstrip file for both, which
  // showed all 8 stitched frames in the grid).
  const coverOut = path.join(getDirs().thumbs, `${key}-cover.png`)
  const stripOut = path.join(getDirs().thumbs, `${key}-strip.png`)
  if (fs.existsSync(coverOut) && fs.existsSync(stripOut)) {
    return { ok: true, cachePath: toPosix(coverOut), filmstripPath: toPosix(stripOut) }
  }
  const duration = await probeDuration(filePath)
  const frameCount = 8
  let args
  if (duration > 0) {
    // One decode, two outputs: the cover still
    // (seeked to skip black intro frames) and
    // the filmstrip spread evenly across the
    // whole source duration.
    const seek = Math.min(0.5, duration * 0.25)
    const fps = (frameCount / duration).toFixed(5)
    args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-ss', String(seek),
      '-i', filePath,
      '-map', '0:v:0',
      '-frames:v', '1',
      '-vf', 'scale=320:-2',
      '-q:v', '5',
      coverOut,
      '-map', '0:v:0',
      '-frames:v', '1',
      '-vf', `fps=${fps},scale=160:-2,tile=${frameCount}x1`,
      '-q:v', '5',
      stripOut
    ]
  } else {
    // Duration unknown: cover + a single-frame
    // strip, so the cache layout is always
    // complete (the timeline tiles it, same as
    // web session assets).
    args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-ss', '0.5',
      '-i', filePath,
      '-map', '0:v:0',
      '-frames:v', '1',
      '-vf', 'scale=320:-2',
      '-q:v', '5',
      coverOut,
      '-map', '0:v:0',
      '-frames:v', '1',
      '-vf', 'scale=160:-2',
      '-q:v', '5',
      stripOut
    ]
  }
  const res = await runFfmpeg(args, 60 * 1000)
  if (!res.ok || !fs.existsSync(coverOut)) {
    return { ok: false, error: res.error || 'Thumbnail extraction failed' }
  }
  return {
    ok: true,
    cachePath: toPosix(coverOut),
    filmstripPath: fs.existsSync(stripOut) ? toPosix(stripOut) : null
  }
}

// Cap for timestamps when the duration cannot be probed (roadmap G-1).
const MAX_FRAME_TIME_SEC = 24 * 3600

// Single-frame extractor (roadmap G-1, core C14 plans the timestamps):
// seeks to `atSec` and returns a small PNG in the frames cache, keyed per
// (path, mtime, size, time, width) so the same seek never decodes twice.
// The timestamp is limited: finite, >= 0 and inside the media when the
// duration is known (otherwise capped at MAX_FRAME_TIME_SEC).
async function extractFrameAt(filePath, atSec, width) {
  ensureDirs()
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  const wanted = Number(atSec)
  if (!Number.isFinite(wanted) || wanted < 0) return { ok: false, error: 'Invalid timestamp' }
  const px = Math.min(1280, Math.max(16, Math.round(Number(width) || 320)))
  const key = `${cacheKeyFor(filePath, stat)}-f${Math.round(wanted * 1000)}-w${px}`
  const out = path.join(getDirs().frames, `${key}.png`)
  if (fs.existsSync(out)) return { ok: true, path: toPosix(out), cached: true }
  const duration = await probeDurationCached(filePath, stat)
  const at = duration > 0
    ? Math.min(wanted, Math.max(0, duration - 0.05))
    : Math.min(wanted, MAX_FRAME_TIME_SEC)
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(at),
    '-i', filePath,
    '-map', '0:v:0',
    '-frames:v', '1',
    '-vf', `scale=${px}:-2`,
    out
  ]
  const res = await runFfmpeg(args, 30 * 1000)
  if (!res.ok || !fs.existsSync(out)) {
    return { ok: false, error: res.error || 'Frame extraction failed' }
  }
  return { ok: true, path: toPosix(out), cached: false }
}

async function extractWaveform(filePath, buckets = 200) {
  ensureDirs()
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  const bucketCount = Math.max(16, Math.min(2000, Math.floor(buckets) || 200))
  const key = cacheKeyFor(filePath, stat)
  const out = path.join(getDirs().waveforms, `${key}.json`)
  if (fs.existsSync(out)) {
    const cached = readJsonSafe(out)
    if (cached && Array.isArray(cached.buckets)) {
      return {
        ok: true,
        cachePath: toPosix(out),
        buckets: cached.buckets,
        durationSec: Number(cached.durationSec) || 0
      }
    }
  }

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', filePath,
    '-vn', '-ac', '1', '-ar', '8000',
    '-f', 's16le', 'pipe:1'
  ]
  const res = await runFfmpeg(args, 5 * 60 * 1000)

  if (!res.ok || !res.stdout || res.stdout.length < 2) {
    const duration = await probeDuration(filePath)
    const flat = new Array(bucketCount).fill(0)
    writeJsonAtomic(out, { buckets: flat, durationSec: duration })
    return { ok: true, cachePath: toPosix(out), buckets: flat, durationSec: duration }
  }

  const sampleCount = Math.floor(res.stdout.length / 2)
  const peaks = new Array(bucketCount).fill(0)
  if (sampleCount > 0) {
    const per = sampleCount / bucketCount
    for (let b = 0; b < bucketCount; b++) {
      const start = Math.floor(b * per)
      const end = Math.min(sampleCount, Math.floor((b + 1) * per))
      let max = 0
      for (let i = start; i < end; i++) {
        const v = Math.abs(res.stdout.readInt16LE(i * 2))
        if (v > max) max = v
      }
      peaks[b] = Math.min(1, max / 32768)
    }
  }
  const durationSec = sampleCount / 8000
  writeJsonAtomic(out, { buckets: peaks, durationSec })
  return { ok: true, cachePath: toPosix(out), buckets: peaks, durationSec }
}

// Full ffprobe JSON (format + streams). Raw output only — normalization
// stays in @tmcut/core (normalizeProbe) per the runtime-adapter rule.
function probeMediaJson(filePath) {
  return new Promise((resolve) => {
    let child = null
    try {
      const exe = getToolsBinaries().ffprobe
      // maxBuffer: 10 MB to prevent OOM
      child = spawn(exe, [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 })
    } catch {
      resolve(null)
      return
    }
    let out = ''
    let exited = false
    const timer = setTimeout(() => {
      if (child && !exited) {
        exited = true
        child.kill()
        resolve(null)
      }
    }, 60 * 1000)
    child.stdout.on('data', (data) => {
      out += data.toString()
    })
    child.on('error', () => {
      if (exited) return
      exited = true
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', (code) => {
      if (exited) return
      exited = true
      clearTimeout(timer)
      if (code !== 0) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(out))
      } catch {
        resolve(null)
      }
    })
  })
}

// Run ffmpeg and capture stderr text (scene/silence detectors log there).
// Returns { code, log }. Parsing stays in @tmcut/core (analysis module).
function runFfmpegLog(args, timeoutMs) {
  return new Promise((resolve) => {
    let child = null
    try {
      const exe = getToolsBinaries().ffmpeg
      // maxBuffer: 10 MB to prevent OOM on malicious/huge stderr output
      child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 })
    } catch {
      resolve({ code: -1, log: '' })
      return
    }
    let log = ''
    let exited = false
    const timer = setTimeout(() => {
      if (child && !exited) {
        exited = true
        child.kill()
        resolve({ code: -1, log })
      }
    }, timeoutMs)
    child.stderr.on('data', (data) => {
      log += data.toString()
    })
    child.on('error', () => {
      if (exited) return
      exited = true
      clearTimeout(timer)
      resolve({ code: -1, log })
    })
    child.on('close', (code) => {
      if (exited) return
      exited = true
      clearTimeout(timer)
      resolve({ code: code === null ? -1 : code, log })
    })
  })
}

// Shot detection: lavfi scene filter + showinfo. Returns raw log +
// duration; the renderer parses cuts via core parseSceneOutput.
async function analyzeScenes(filePath, threshold) {
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  const score = Number.isFinite(threshold) && threshold > 0 && threshold < 1 ? threshold : 0.4
  const probe = await probeMediaJson(filePath)
  const durationSec = probe && probe.format ? Number(probe.format.duration) || 0 : await probeDuration(filePath)
  const { code, log } = await runFfmpegLog([
    '-hide_banner',
    '-i', filePath,
    '-vf', `select='gt(scene,${score})',showinfo`,
    '-vsync', '0',
    '-f', 'null', '-'
  ], 10 * 60 * 1000)
  if (code !== 0) return { ok: false, error: 'Scene detection failed' }
  return { ok: true, log, durationSec }
}

// Silence detection for speech/silence segmentation (podcast/vlog).
async function analyzeSilence(filePath, noiseDb, minDuration) {
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  const noise = Number.isFinite(noiseDb) ? noiseDb : -30
  const minDur = Number.isFinite(minDuration) && minDuration > 0 ? minDuration : 0.5
  const probe = await probeMediaJson(filePath)
  const durationSec = probe && probe.format ? Number(probe.format.duration) || 0 : await probeDuration(filePath)
  const { code, log } = await runFfmpegLog([
    '-hide_banner',
    '-i', filePath,
    '-af', `silencedetect=noise=${noise}dB:d=${minDur}`,
    '-vn', '-sn', '-dn',
    '-f', 'null', '-'
  ], 10 * 60 * 1000)
  if (code !== 0) return { ok: false, error: 'Silence detection failed' }
  return { ok: true, log, durationSec }
}

// Single-call media analysis pipeline (Phase 3 ElectronMediaRuntime):
// stat + probe + thumbnail/waveform in one IPC round-trip. The renderer
// normalizes `probe` with core normalizeProbe and persists the record.
async function analyzeAsset(filePath, kind) {
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  const result = {
    ok: true,
    stat: { size: stat.size, mtimeMs: stat.mtimeMs },
    probe: null,
    thumbCachePath: null,
    filmstripCachePath: null,
    waveCachePath: null
  }
  if (kind === 'image') return result
  try {
    result.probe = await probeMediaJson(filePath)
  } catch {
    result.probe = null
  }
  if (kind === 'video') {
    const thumb = await extractThumbnail(filePath)
    if (thumb && thumb.ok && thumb.cachePath) {
      result.thumbCachePath = thumb.cachePath
      result.filmstripCachePath = thumb.filmstripPath || null
    }
  } else if (kind === 'audio') {
    const wave = await extractWaveform(filePath, 200)
    if (wave && wave.ok && wave.cachePath) result.waveCachePath = wave.cachePath
  }
  return result
}

function listProjectFiles() {
  ensureDirs()
  const dir = getDirs().projects
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  const items = []
  for (const file of entries) {
    if (!file.endsWith('.tmcut.json')) continue
    const full = path.join(dir, file)
    const stat = getFileStat(full)
    const data = readJsonSafe(full)
    items.push({
      id: file.replace(/\.tmcut\.json$/, ''),
      name: (data && data.name) || 'Untitled Project',
      updatedAt: (data && data.updated_at) || new Date(stat.mtimeMs || Date.now()).toISOString(),
      size: stat.size
    })
  }
  items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return items
}

function listSnapshots(id) {
  ensureDirs()
  const dir = getDirs().snapshots
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  const prefix = `${sanitizeId(id)}-`
  const items = []
  for (const file of entries) {
    if (!file.startsWith(prefix) || !file.endsWith('.json')) continue
    const full = path.join(dir, file)
    const data = readJsonSafe(full)
    const ts = Number(file.slice(prefix.length, -5)) || 0
    items.push({
      ts,
      name: (data && data.name) || `Snapshot ${new Date(ts).toLocaleString()}`,
      updatedAt: (data && data.updated_at) || new Date(ts).toISOString()
    })
  }
  items.sort((a, b) => b.ts - a.ts)
  return items
}

// Lightweight preview proxy generator (Roadmap F-4):
// Converts heavy 4K / camera footage to 540p/720p H.264 + AAC in the proxies cache,
// keyed per (path, mtime, size, width). Cached copies return instantly.
async function generateProxy(filePath, width = 960) {
  ensureDirs()
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  const targetWidth = Math.max(320, Math.min(1920, Math.floor(Number(width) || 960)))
  const key = `${cacheKeyFor(filePath, stat)}-w${targetWidth}`
  const out = path.join(getDirs().proxies, `proxy-${key}.mp4`)
  if (getFileStat(out).exists) {
    return { ok: true, path: toPosix(out), cached: true }
  }
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    filePath,
    '-vf',
    `scale=${targetWidth}:-2`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '28',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    out
  ]
  const res = await runFfmpeg(args, 15 * 60 * 1000)
  if (!res.ok || !getFileStat(out).exists) {
    return { ok: false, error: res.error || 'Proxy generation failed' }
  }
  return { ok: true, path: toPosix(out), cached: false }
}

const STABILIZE_PRESETS = {
  mild: { smoothing: 10, shakiness: 4, accuracy: 10, stepsize: 6, zoom: 0 },
  medium: { smoothing: 20, shakiness: 6, accuracy: 15, stepsize: 6, zoom: 0 },
  aggressive: { smoothing: 35, shakiness: 8, accuracy: 15, stepsize: 4, zoom: 0 }
}

function escapeFilterPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/:/g, '\\:')
}

// 2-pass video stabilization (Roadmap E-5):
// Pass 1: vidstabdetect extracts camera motion vectors into a .trf file in cache/stabilized_trf
// Pass 2: vidstabtransform applies smoothing to produce a stable .mp4 in cache/stabilized
async function stabilizeVideo(filePath, options = {}) {
  ensureDirs()
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  const level = options.level && STABILIZE_PRESETS[options.level] ? options.level : 'medium'
  const preset = STABILIZE_PRESETS[level]
  const key = `${cacheKeyFor(filePath, stat)}-${level}`
  const out = path.join(getDirs().stabilized, `stab-${key}.mp4`)
  if (getFileStat(out).exists) {
    return { ok: true, path: toPosix(out), cached: true }
  }
  const trf = path.join(getDirs().stabilizedTrf, `trf-${key}.trf`)
  const escapedTrf = escapeFilterPath(trf)

  // Pass 1: vidstabdetect
  const detectArgs = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    filePath,
    '-vf',
    `vidstabdetect=stepsize=${preset.stepsize}:shakiness=${preset.shakiness}:accuracy=${preset.accuracy}:result='${escapedTrf}'`,
    '-f',
    'null',
    '-'
  ]
  const res1 = await runFfmpeg(detectArgs, 15 * 60 * 1000)
  if (!res1.ok || !getFileStat(trf).exists) {
    return { ok: false, error: res1.error || 'Stabilization Pass 1 (detection) failed' }
  }

  // Pass 2: vidstabtransform
  const transformArgs = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    filePath,
    '-vf',
    `vidstabtransform=input='${escapedTrf}':smoothing=${preset.smoothing}:optalgo=gauss:zoom=${preset.zoom}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-c:a',
    'copy',
    out
  ]
  const res2 = await runFfmpeg(transformArgs, 15 * 60 * 1000)

  // Cleanup temporary .trf file
  try {
    if (fs.existsSync(trf)) fs.unlinkSync(trf)
  } catch {
    // ignore
  }

  if (!res2.ok || !getFileStat(out).exists) {
    return { ok: false, error: res2.error || 'Stabilization Pass 2 (transform) failed' }
  }
  return { ok: true, path: toPosix(out), cached: false }
}

function registerTmcutController() {
  ipcMain.handle(`${moduleName}:getPaths`, () => {
    ensureDirs()
    const d = getDirs()
    return {
      base: toPosix(d.base),
      projects: toPosix(d.projects),
      snapshots: toPosix(d.snapshots),
      assetsFile: toPosix(d.assetsFile),
      cache: toPosix(d.cache),
      thumbs: toPosix(d.thumbs),
      waveforms: toPosix(d.waveforms),
      proxies: toPosix(d.proxies)
    }
  })

  ipcMain.handle(`${moduleName}:readAssetsFile`, () => readJsonSafe(getDirs().assetsFile))

  ipcMain.handle(`${moduleName}:writeAssetsFile`, (_event, data) => {
    ensureDirs()
    try {
      writeJsonAtomic(getDirs().assetsFile, data || [])
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(`${moduleName}:readProject`, (_event, id) => readJsonSafe(projectFile(id)))

  ipcMain.handle(`${moduleName}:writeProject`, (_event, { id, data }) => {
    ensureDirs()
    try {
      writeJsonAtomic(projectFile(id), data)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(`${moduleName}:listProjectFiles`, () => listProjectFiles())

  ipcMain.handle(`${moduleName}:readProjectMeta`, (_event, id) => {
    const projStat = getFileStat(projectFile(id))
    const recStat = getFileStat(recoveryFile(id))
    let recoveryUpdatedAt = null
    if (recStat.exists) {
      const data = readJsonSafe(recoveryFile(id))
      if (data && data.updated_at) {
        recoveryUpdatedAt = Date.parse(data.updated_at)
        if (Number.isNaN(recoveryUpdatedAt)) recoveryUpdatedAt = null
      }
    }
    return {
      hasProject: projStat.exists,
      projectMtimeMs: projStat.mtimeMs,
      hasRecovery: recStat.exists,
      recoveryUpdatedAtMs: recoveryUpdatedAt
    }
  })

  ipcMain.handle(`${moduleName}:writeRecovery`, (_event, { id, data }) => {
    ensureDirs()
    try {
      writeJsonAtomic(recoveryFile(id), data)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(`${moduleName}:readRecovery`, (_event, id) => readJsonSafe(recoveryFile(id)))

  ipcMain.handle(`${moduleName}:deleteRecovery`, (_event, id) => {
    try {
      if (fs.existsSync(recoveryFile(id))) fs.unlinkSync(recoveryFile(id))
    } catch {
      // ignore
    }
    return true
  })

  ipcMain.handle(`${moduleName}:deleteProject`, (_event, id) => {
    for (const p of [projectFile(id), recoveryFile(id)]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p)
      } catch {
        // ignore
      }
    }
    const dir = getDirs().snapshots
    const prefix = `${sanitizeId(id)}-`
    try {
      for (const file of fs.readdirSync(dir)) {
        if (file.startsWith(prefix) && file.endsWith('.json')) {
          try {
            fs.unlinkSync(path.join(dir, file))
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
    return true
  })

  ipcMain.handle(`${moduleName}:listSnapshots`, (_event, id) => listSnapshots(id))

  ipcMain.handle(`${moduleName}:saveSnapshot`, (_event, { id, data, name }) => {
    ensureDirs()
    const ts = Date.now()
    try {
      const payload = data && typeof data === 'object' ? { ...data, name: name || data.name } : {}
      writeJsonAtomic(snapshotFile(id, ts), payload)
      return {
        ts,
        name: payload.name || `Snapshot ${new Date(ts).toLocaleString()}`,
        updatedAt: (payload.updated_at) || new Date(ts).toISOString()
      }
    } catch {
      return null
    }
  })

  ipcMain.handle(`${moduleName}:readSnapshot`, (_event, { id, ts }) => readJsonSafe(snapshotFile(id, Math.floor(Number(ts) || 0))))

  ipcMain.handle(`${moduleName}:deleteSnapshot`, (_event, { id, ts }) => {
    try {
      const p = snapshotFile(id, Math.floor(Number(ts) || 0))
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      // ignore
    }
    return true
  })

  ipcMain.handle(`${moduleName}:statFiles`, (_event, paths) => {
    const result = {}
    if (!Array.isArray(paths)) return result
    for (const p of paths.slice(0, 500)) {
      const safePath = isUserMediaPath(p)
      if (safePath) {
        result[p] = getFileStat(safePath)
      }
    }
    return result
  })

  ipcMain.handle(`${moduleName}:extractThumbnail`, async (_event, { filePath }) => {
    if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'Invalid path' }
    return extractThumbnail(filePath)
  })

  ipcMain.handle(`${moduleName}:extractFrame`, async (_event, { src, atSec, width }) => {
    const safePath = isUserMediaPath(src)
    if (!safePath) return { ok: false, error: 'Invalid path' }
    return extractFrameAt(safePath, atSec, width)
  })

  ipcMain.handle(`${moduleName}:extractAudio`, async (_event, { filePath }) => {
    const safePath = isUserMediaPath(filePath)
    if (!safePath) return { ok: false, error: 'Invalid path' }
    return extractCaptionAudio(safePath)
  })

  // Roadmap D-4: MediaRecorder blobs must land on disk for the desktop
  // pipeline (FFmpeg export reads real paths). Saved under
  // <base>/recordings/ with a timestamped name — no dialog friction.
  ipcMain.handle(`${moduleName}:saveRecording`, async (_event, { data, ext }) => {
    try {
      const bytes = data instanceof Uint8Array
        ? data
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : null
      if (!bytes || bytes.length === 0) return { ok: false, error: 'Empty recording' }
      ensureDirs()
      const safeExt = /^[a-z0-9]{1,8}$/i.test(String(ext || '')) ? String(ext) : 'webm'
      const filePath = path.join(getDirs().recordings, `voiceover-${Date.now()}.${safeExt}`)
      fs.writeFileSync(filePath, Buffer.from(bytes))
      return { ok: true, path: filePath }
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error) }
    }
  })

  ipcMain.handle(`${moduleName}:extractWaveform`, async (_event, { filePath, buckets }) => {
    const safePath = isUserMediaPath(filePath)
    if (!safePath) return { ok: false, error: 'Invalid path' }
    return extractWaveform(safePath, buckets)
  })

  ipcMain.handle(`${moduleName}:analyzeAsset`, async (_event, { filePath, kind }) => {
    const safePath = isUserMediaPath(filePath)
    if (!safePath) return { ok: false, error: 'Invalid path' }
    return analyzeAsset(safePath, kind)
  })

  ipcMain.handle(`${moduleName}:analyzeScenes`, async (_event, { filePath, threshold }) => {
    const safePath = isUserMediaPath(filePath)
    if (!safePath) return { ok: false, error: 'Invalid path' }
    return analyzeScenes(safePath, threshold)
  })

  ipcMain.handle(`${moduleName}:analyzeSilence`, async (_event, { filePath, noiseDb, minDuration }) => {
    const safePath = isUserMediaPath(filePath)
    if (!safePath) return { ok: false, error: 'Invalid path' }
    return analyzeSilence(safePath, noiseDb, minDuration)
  })

  ipcMain.handle(`${moduleName}:generateProxy`, async (_event, { filePath, width }) => {
    const safePath = isUserMediaPath(filePath)
    if (!safePath) return { ok: false, error: 'Invalid path' }
    return generateProxy(safePath, width)
  })

  ipcMain.handle(`${moduleName}:stabilizeVideo`, async (_event, { filePath, options }) => {
    const safePath = isUserMediaPath(filePath)
    if (!safePath) return { ok: false, error: 'Invalid path' }
    return stabilizeVideo(safePath, options)
  })

  ipcMain.handle(`${moduleName}:listFonts`, () => listSystemFonts())
}

// isUserMediaPath exported for the R110 regression spec (pure function,
// no Electron state involved; requiring this module outside Electron is
// side-effect-free because registration only runs from main.cjs).
module.exports = { registerTmcutController, isUserMediaPath }
