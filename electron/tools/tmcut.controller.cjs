const { ipcMain, app } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { getToolsBinaries } = require('./paths.cjs')

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
    waveforms: path.join(base, 'cache', 'waveforms')
  }
}

function ensureDirs() {
  const d = getDirs()
  for (const p of [d.base, d.projects, d.snapshots, d.cache, d.thumbs, d.waveforms]) {
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

function cacheKeyFor(filePath, stat) {
  const raw = `${toPosix(filePath)}:${stat.mtimeMs}:${stat.size}`
  return crypto.createHash('sha1').update(raw).digest('hex')
}

function runFfmpeg(args, timeoutMs) {
  return new Promise((resolve) => {
    let child
    try {
      const exe = getToolsBinaries().ffmpeg
      child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      return resolve({ ok: false, error: String((err && err.message) || err), stdout: null, stderr: '' })
    }
    let stdout = null
    let chunk = Buffer.alloc(0)
    let stderr = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
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

async function extractThumbnail(filePath) {
  ensureDirs()
  const stat = getFileStat(filePath)
  if (!stat.exists) return { ok: false, error: 'File not found' }
  const key = cacheKeyFor(filePath, stat)
  const out = path.join(getDirs().thumbs, `${key}.png`)
  if (fs.existsSync(out)) {
    return { ok: true, cachePath: toPosix(out) }
  }
  const duration = await probeDuration(filePath)
  const seek = duration > 0 ? Math.min(0.5, duration * 0.25) : 0
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(seek),
    '-i', filePath,
    '-frames:v', '1',
    '-vf', 'scale=320:-2',
    '-q:v', '5',
    out
  ]
  const res = await runFfmpeg(args, 60 * 1000)
  if (!res.ok || !fs.existsSync(out)) {
    return { ok: false, error: res.error || 'Thumbnail extraction failed' }
  }
  return { ok: true, cachePath: toPosix(out) }
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

function listProjectFiles() {
  ensureDirs()
  const dir = getDirs().projects
  let entries = []
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
  let entries = []
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
      waveforms: toPosix(d.waveforms)
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
      if (typeof p === 'string' && p.length > 0 && p.length < 1024) {
        result[p] = getFileStat(p)
      }
    }
    return result
  })

  ipcMain.handle(`${moduleName}:extractThumbnail`, async (_event, { filePath }) => {
    if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'Invalid path' }
    return extractThumbnail(filePath)
  })

  ipcMain.handle(`${moduleName}:extractWaveform`, async (_event, { filePath, buckets }) => {
    if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'Invalid path' }
    return extractWaveform(filePath, buckets)
  })
}

module.exports = { registerTmcutController }
