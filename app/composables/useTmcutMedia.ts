import { ref, computed } from 'vue'
import type { TmcutAsset, TmcutAssetKind, TmcutMediaFolder } from '~/types/tmcut'
import type { DownloadProgressPayload } from '#shared/types/electron'
import { createEmptyTmcutAssetMeta } from '~/types/tmcut'
import { effectiveAssetKind } from '~/utils/tmcut/assetKind'
import {
  classifyAssetKind,
  mediaFileName,
  mediaFileKey,
  normalizeMediaPath
} from '~/utils/tmcut/media'
import { clampWaveformPoints } from '~/utils/tmcut/waveform'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { toURL } from '~/utils/ffmpegHelper'
import {
  fnv1aHex,
  normalizeProbe,
  createFolder as coreCreateFolder,
  renameFolder as coreRenameFolder,
  updateFolderColor as coreUpdateFolderColor,
  removeFolder as coreRemoveFolder,
  setAssetFolder as coreSetAssetFolder,
  getAssetFolder as coreGetAssetFolder,
  getFolderCounts as coreGetFolderCounts,
  secToTicks,
  FOLDER_TAG_COLORS

} from '@tmcut-core'

const ASSET_STORAGE_KEY = 'tmcut_assets_v1'
const FOLDER_STORAGE_KEY = 'tmcut_folders_v1'
const PROXY_PREVIEW_KEY = 'tmcut.proxyPreview'

const assets = ref<TmcutAsset[]>([])
const folders = ref<TmcutMediaFolder[]>([])
const selectedFolderId = ref<string | null>(null)
const libraryLoaded = ref(false)
const importing = ref(false)
const importError = ref<string | null>(null)
const proxyPreview = ref(true)

if (import.meta.client && typeof window !== 'undefined') {
  const stored = window.localStorage.getItem(PROXY_PREVIEW_KEY)
  if (stored !== null) proxyPreview.value = stored === '1'
  watch(proxyPreview, (v) => {
    window.localStorage.setItem(PROXY_PREVIEW_KEY, v ? '1' : '0')
  })
}

const waveformCache = new Map<string, number[]>()

function tmcutIpc() {
  return typeof window !== 'undefined' ? window.electronAPI?.tmcut : undefined
}

function mediaUrl(filePath: string): string {
  // Same URL builder as ToolsVideoFramePreview (tools/video.vue):
  // local files are served through the privileged media://local protocol
  return toURL(filePath)
}

export function useTmcutMedia() {
  const { currentProject, addClipToTrack, updateClipsSrc } = useTmcutProject()

  const isDesktop = computed(() => !!tmcutIpc())

  const projectAssets = computed(() => {
    const pid = currentProject.value?.id
    if (!pid) return []
    return assets.value.filter(a => a.usedBy.includes(pid))
  })

  const projectFolders = computed(() => {
    const pid = currentProject.value?.id
    if (!pid) return folders.value
    return folders.value.filter(f => !f.projectId || f.projectId === pid)
  })

  const folderCounts = computed(() => {
    const pid = currentProject.value?.id
    return coreGetFolderCounts(projectFolders.value, projectAssets.value, pid)
  })

  const missingAssets = computed(() => projectAssets.value.filter(a => a.status === 'missing'))

  const analyzingCount = computed(() => projectAssets.value.filter(a => a.status === 'analyzing').length)

  // All media paths currently referenced by timeline clips (normalized).
  // Used for the CapCut-style "Added" badge in the media library.
  const timelineSrcSet = computed(() => {
    const set = new Set<string>()
    for (const track of currentProject.value?.timeline?.tracks || []) {
      for (const item of track.items || []) {
        if (item.src) set.add(mediaFileKey(item.src))
      }
    }
    return set
  })

  function findAssetBySrc(src?: string | null): TmcutAsset | undefined {
    if (!src) return undefined
    const key = mediaFileKey(src)
    return assets.value.find(a => mediaFileKey(a.path) === key)
  }

  function loadFolders() {
    try {
      const raw = localStorage.getItem(FOLDER_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as TmcutMediaFolder[]
        if (Array.isArray(parsed)) {
          folders.value = parsed
        }
      }
    } catch (error) {
      console.error('Failed to parse folders from localStorage:', error)
    }
  }

  function persistFolders() {
    try {
      localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(folders.value))
    } catch (error) {
      console.error('Failed to persist folders to localStorage:', error)
    }
  }

  function addFolder(name: string, color?: string): TmcutMediaFolder {
    const pid = currentProject.value?.id
    const folder = coreCreateFolder(folders.value, { name, color, projectId: pid })
    persistFolders()
    return folder
  }

  function editFolder(folderId: string, newName: string): boolean {
    const ok = coreRenameFolder(folders.value, folderId, newName)
    if (ok) persistFolders()
    return ok
  }

  function changeFolderColor(folderId: string, color: string): boolean {
    const ok = coreUpdateFolderColor(folders.value, folderId, color)
    if (ok) persistFolders()
    return ok
  }

  function deleteFolder(folderId: string): boolean {
    const ok = coreRemoveFolder(folders.value, folderId)
    if (ok) {
      const pid = currentProject.value?.id
      for (const a of assets.value) {
        if (coreGetAssetFolder(a, pid) === folderId) {
          coreSetAssetFolder(a, null, pid)
        }
      }
      if (selectedFolderId.value === folderId) {
        selectedFolderId.value = null
      }
      persistFolders()
      persistLibrary()
    }
    return ok
  }

  function moveAssetToFolder(assetId: string, folderId: string | null): boolean {
    const asset = assets.value.find(a => a.id === assetId)
    if (!asset) return false
    const pid = currentProject.value?.id
    coreSetAssetFolder(asset, folderId, pid)
    persistLibrary()
    return true
  }

  function getAssetFolderId(asset: TmcutAsset): string | null {
    const pid = currentProject.value?.id
    return coreGetAssetFolder(asset, pid)
  }

  async function loadLibrary() {
    if (libraryLoaded.value) return
    libraryLoaded.value = true
    loadFolders()
    const ipc = tmcutIpc()
    // Web runtime is session-only: blob: URLs die on reload, so neither
    // load nor persist the library here (see persistLibrary).
    if (!ipc) {
      assets.value = []
      return
    }
    if (!import.meta.server) {
      try {
        const data = (await ipc.readAssetsFile()) as TmcutAsset[] | null
        if (Array.isArray(data) && data.length > 0) {
          assets.value = data
          await checkMissing()
          return
        }
      } catch (error) {
        console.error('Failed to load media registry from disk:', error)
      }
    }
    try {
      const raw = localStorage.getItem(ASSET_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as TmcutAsset[]
        if (Array.isArray(parsed)) assets.value = parsed
      }
    } catch (error) {
      console.error('Failed to parse media registry from localStorage:', error)
    }
    await checkMissing()
  }

  function persistLibrary() {
    // Web runtime is session-only (blob: URLs do not survive reload).
    if (!tmcutIpc()) return
    try {
      localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(assets.value))
    } catch (error) {
      console.error('Failed to persist media registry to localStorage:', error)
    }
    const ipc = tmcutIpc()
    if (ipc) {
      // Convert Vue reactive proxies to plain objects — Electron's
      // structured clone algorithm cannot serialize reactive proxies
      // ("An object could not be cloned"). Same pattern as
      // useTmcutProject.persistProjectToDisk.
      const plain = JSON.parse(JSON.stringify(assets.value)) as TmcutAsset[]
      ipc.writeAssetsFile(plain).catch(() => {})
    }
  }

  function buildAsset(inputPath: string, kind: TmcutAssetKind): TmcutAsset {
    const path = normalizeMediaPath(inputPath)
    const pid = currentProject.value?.id
    const activeFolder = selectedFolderId.value && selectedFolderId.value !== '__unassigned__'
      ? selectedFolderId.value
      : null
    const asset: TmcutAsset = {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      kind,
      name: mediaFileName(path),
      path,
      usedBy: currentProject.value ? [currentProject.value.id] : [],
      status: 'analyzing',
      meta: createEmptyTmcutAssetMeta(),
      thumbPath: null,
      filmstripPath: null,
      waveformPath: null,
      proxyPath: null,
      proxyStatus: 'none',
      folderId: activeFolder,
      addedAt: new Date().toISOString()
    }
    if (activeFolder && pid) {
      asset.folderByProject = { [pid]: activeFolder }
    }
    return asset
  }

  async function analyzeAsset(asset: TmcutAsset) {
    const ipc = tmcutIpc()
    try {
      if (!ipc || typeof ipc.analyzeAsset !== 'function') {
        asset.status = 'ready'
        asset.meta.probedAt = new Date().toISOString()
        return
      }

      // Single IPC round-trip (Phase 3 ElectronMediaRuntime pipeline);
      // probe normalization stays renderer-side via @tmcut/core.
      const result = await ipc.analyzeAsset({ filePath: asset.path, kind: asset.kind })
      if (!result?.ok) {
        asset.status = 'missing'
        return
      }
      asset.meta.fileSize = result.stat?.size ?? 0
      asset.meta.mtimeMs = result.stat?.mtimeMs ?? 0

      if (asset.kind === 'image') {
        asset.thumbPath = asset.path
      } else {
        const meta = normalizeProbe(result.probe)
        if (meta && (meta.durationSec > 0 || meta.width > 0)) {
          asset.meta.durationSec = meta.durationSec
          asset.meta.width = meta.width
          asset.meta.height = meta.height
          asset.meta.fps = meta.fps
          // WebM audio-only (audio stream, no video stream) is the
          // container that trips up the `kind === 'video'` guess. Record
          // whether a video stream was actually found so routing to the
          // audio track is unambiguous.
          asset.meta.hasVideo = meta.width > 0
        }

        if (asset.kind === 'video' && result.thumbCachePath) {
          asset.thumbPath = result.thumbCachePath
          asset.filmstripPath = result.filmstripCachePath || null
        }
        // Waveform is kept for anything that carries audio: an
        // audio-only container arriving as `kind: 'video'` still gets its
        // strip (the controller extracts it from the probe, see R122).
        if (result.waveCachePath) {
          asset.waveformPath = result.waveCachePath
        }
      }

      asset.status = 'ready'
      asset.meta.probedAt = new Date().toISOString()
    } catch (error) {
      console.error('Media analysis failed:', asset.path, error)
      asset.status = 'error'
    }
  }

  async function importFiles(paths: string[]): Promise<{ added: number, duplicates: number, failed: number }> {
    importError.value = null
    // Global registry keyed by path. The library grid
    // only shows assets linked to the current project
    // (usedBy), so a file imported under another
    // project is invisible here but still matches the
    // dedup key — relink it (CapCut-style: one asset,
    // many projects) instead of rejecting it.
    const registry = new Map<string, TmcutAsset>()
    for (const a of assets.value) {
      const key = mediaFileKey(a.path)
      if (key && !registry.has(key)) registry.set(key, a)
    }
    const projectId = currentProject.value?.id
    const fresh: string[] = []
    const processed = new Set<string>()
    let duplicates = 0
    let relinked = 0
    for (const p of paths) {
      if (typeof p !== 'string') continue
      const key = mediaFileKey(p)
      if (!key || processed.has(key)) continue
      processed.add(key)
      const existing = registry.get(key)
      if (existing) {
        if (projectId && !existing.usedBy.includes(projectId)) {
          existing.usedBy.push(projectId)
          relinked++
        } else {
          duplicates++
        }
        continue
      }
      const kind = classifyAssetKind(p)
      if (!kind) continue
      fresh.push(p)
    }
    let added = relinked
    let failed = 0
    if (fresh.length > 0) {
      importing.value = true
      for (const p of fresh) {
        const kind = classifyAssetKind(p)
        if (!kind) continue
        const asset = buildAsset(p, kind)
        assets.value.unshift(asset)
        await analyzeAsset(asset)
        // 'error' (analysis threw) must not count as
        // success — surface it as a failed import.
        if (asset.status === 'missing' || asset.status === 'error') failed++
        else added++
      }
      importing.value = false
    }
    persistLibrary()
    return { added, duplicates, failed }
  }

  // Probe duration of a blob: URL via a temporary media element (web only).
  function probeWebMedia(url: string, kind: TmcutAssetKind): Promise<number> {
    return new Promise((resolve) => {
      try {
        const el = kind === 'audio' ? new Audio() : document.createElement('video')
        el.preload = 'metadata'
        el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0)
        el.onerror = () => resolve(0)
        el.src = url
        setTimeout(() => resolve(0), 15000)
      } catch {
        resolve(0)
      }
    })
  }

  // Capture a video frame as a dataURL thumbnail (web only, best-effort).
  // Blob: URLs are same-origin so the canvas stays untainted.
  function captureVideoThumb(url: string): Promise<string | null> {
    return new Promise((resolve) => {
      let settled = false
      const finish = (result: string | null) => {
        if (settled) return
        settled = true
        resolve(result)
      }
      try {
        const video = document.createElement('video')
        video.muted = true
        video.preload = 'auto'
        video.onloadeddata = () => {
          try {
            video.currentTime = Math.min(0.5, (video.duration || 1) / 2)
          } catch {
            finish(null)
          }
        }
        video.onseeked = () => {
          try {
            const canvas = document.createElement('canvas')
            const scale = 320 / (video.videoWidth || 320)
            canvas.width = 320
            canvas.height = Math.max(2, Math.round((video.videoHeight || 180) * scale))
            const ctx = canvas.getContext('2d')
            if (!ctx) {
              finish(null)
              return
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            finish(canvas.toDataURL('image/jpeg', 0.7))
          } catch {
            finish(null)
          }
        }
        video.onerror = () => finish(null)
        setTimeout(() => finish(null), 15000)
        video.src = url
      } catch {
        finish(null)
      }
    })
  }

  // Web-runtime import: File objects -> blob: URL assets with probed
  // duration and captured thumbnails. Session-only (see loadLibrary).
  // Returns the created records.
  async function importWebFiles(files: File[]): Promise<TmcutAsset[]> {
    importError.value = null
    const created: TmcutAsset[] = []
    if (files.length === 0) return created
    importing.value = true
    try {
      const seen = new Set(assets.value.map(a => `web:${a.name.toLowerCase()}:${a.meta.fileSize}`))
      for (const file of files) {
        const kind = classifyAssetKind(file.name)
        if (!kind) continue
        const fingerprint = `web:${file.name.toLowerCase()}:${file.size}`
        if (seen.has(fingerprint)) continue
        seen.add(fingerprint)
        const url = URL.createObjectURL(file)
        const asset = buildAsset(url, kind)
        asset.name = file.name
        asset.meta.fileSize = file.size
        assets.value.unshift(asset)
        if (kind !== 'image') {
          const duration = await probeWebMedia(url, kind)
          if (duration > 0) asset.meta.durationSec = Math.round(duration * 100) / 100
        }
        if (kind === 'video') {
          const thumb = await captureVideoThumb(url)
          if (thumb) asset.thumbPath = thumb
        } else if (kind === 'image') {
          // The image file is its own thumbnail —
          // mirrors the desktop pipeline, which points
          // thumbPath at the source file. Without this
          // the library grid shows the placeholder
          // icon instead of the image.
          asset.thumbPath = url
        }
        asset.status = 'ready'
        asset.meta.probedAt = new Date().toISOString()
        created.push(asset)
      }
    } finally {
      importing.value = false
    }
    return created
  }

  /**
   * Import a remote output through the desktop download channel: main writes
   * the bytes to <base>/downloads/, then the normal import pipeline probes it
   * and builds the thumbnails. Returns the created/linked asset path.
   *
   * On the web runtime there is nothing to download to — `importWebFiles`
   * (blob: URL, session-only) is the caller's job, so this refuses instead of
   * pretending.
   */
  async function downloadRemoteMedia(
    url: string,
    options: { filename?: string, id?: string } = {}
  ): Promise<{ ok: boolean, path?: string, error?: string }> {
    const ipc = tmcutIpc()
    if (!ipc?.downloadMedia) return { ok: false, error: 'desktop-only' }
    const downloaded = await ipc.downloadMedia({ url, filename: options.filename, id: options.id })
    if (!downloaded.ok || !downloaded.path) {
      return { ok: false, error: downloaded.error || 'download failed' }
    }
    // The registry is persisted as a whole — importing before it is loaded
    // would drop every existing asset from assets.json.
    await loadLibrary()
    await importFiles([downloaded.path])
    return { ok: true, path: normalizeMediaPath(downloaded.path) }
  }

  /** Cancel one in-flight download (no-op when the channel is unavailable). */
  async function cancelMediaDownload(id: string): Promise<boolean> {
    const ipc = tmcutIpc()
    if (!ipc?.cancelDownload) return false
    return ipc.cancelDownload(id)
  }

  /** Byte progress for downloads that were started with an id. */
  function onMediaDownloadProgress(
    callback: (payload: DownloadProgressPayload) => void
  ): () => void {
    const ipc = tmcutIpc()
    if (!ipc?.onDownloadProgress) return () => {}
    return ipc.onDownloadProgress(callback)
  }

  async function checkMissing() {
    const ipc = tmcutIpc()
    if (!ipc || assets.value.length === 0 || import.meta.server) return
    try {
      const stats = await ipc.statFiles(assets.value.map(a => a.path))
      let changed = false
      for (const asset of assets.value) {
        if (asset.status === 'analyzing') continue
        const stat = stats[asset.path]
        const exists = !!stat?.exists
        if (exists && asset.status === 'missing') {
          asset.status = 'ready'
          changed = true
        } else if (!exists && asset.status !== 'missing') {
          asset.status = 'missing'
          changed = true
        }
      }

      // Verify proxy files still exist on disk
      const proxyPaths = assets.value.filter(a => !!a.proxyPath).map(a => a.proxyPath!)
      if (proxyPaths.length > 0) {
        const proxyStats = await ipc.statFiles(proxyPaths)
        for (const asset of assets.value) {
          if (asset.proxyPath && !proxyStats[asset.proxyPath]?.exists) {
            asset.proxyPath = null
            asset.proxyStatus = 'none'
            changed = true
          }
        }
      }
      // Cache-key migration (cover + filmstrip layout):
      // records analyzed under the retired schemes still
      // point at the old single-file thumbnail. Re-analyze
      // them so cover / filmstrip / waveform regenerate
      // under the current layout (one ffmpeg pass per
      // asset, then the names match and this becomes a
      // no-op).
      for (const asset of assets.value) {
        if (asset.status !== 'ready') continue
        const stat = stats[asset.path]
        if (!stat || !stat.exists) continue
        const key = fnv1aHex(`v2:${mediaFileKey(asset.path)}:${stat.mtimeMs}:${stat.size}`)
        if (asset.kind === 'video') {
          const coverName = asset.thumbPath?.split(/[\\/]/).pop()
          const stripName = asset.filmstripPath?.split(/[\\/]/).pop()
          const coverStale = !asset.thumbPath || coverName !== `${key}-cover.png`
          const stripStale = !asset.filmstripPath || stripName !== `${key}-strip.png`
          if (coverStale || stripStale) {
            asset.thumbPath = null
            asset.filmstripPath = null
            changed = true
            void analyzeAsset(asset).then(() => persistLibrary())
          }
        } else if (asset.kind === 'audio') {
          const waveName = asset.waveformPath?.split(/[\\/]/).pop()
          if (asset.waveformPath && waveName !== `${key}.json`) {
            asset.waveformPath = null
            changed = true
            void analyzeAsset(asset).then(() => persistLibrary())
          }
        }
      }
      if (changed) persistLibrary()
    } catch (error) {
      console.error('Failed to verify media files:', error)
    }
  }

  async function relink(assetId: string, newPath: string): Promise<boolean> {
    const asset = assets.value.find(a => a.id === assetId)
    if (!asset || typeof newPath !== 'string' || !newPath.trim()) return false
    const oldPath = asset.path
    const oldWaveformPath = asset.waveformPath
    const kind = classifyAssetKind(newPath)
    if (kind && kind !== asset.kind) {
      asset.kind = kind
      asset.thumbPath = null
      asset.filmstripPath = null
      asset.waveformPath = null
    }
    asset.path = normalizeMediaPath(newPath)
    asset.name = mediaFileName(asset.path)
    if (oldWaveformPath) {
      waveformCache.delete(oldWaveformPath)
    }
    if (currentProject.value) {
      updateClipsSrc(oldPath, asset.path)
    }
    await analyzeAsset(asset)
    persistLibrary()
    return asset.status === 'ready'
  }

  function removeAsset(assetId: string) {
    assets.value = assets.value.filter(a => a.id !== assetId)
    persistLibrary()
  }

  /** Link an asset to a project (marks "Added", persists registry). */
  function linkAssetToProject(assetId: string, projectId: string): boolean {
    const asset = assets.value.find(a => a.id === assetId)
    if (!asset) return false
    if (!asset.usedBy.includes(projectId)) {
      asset.usedBy.push(projectId)
      persistLibrary()
    }
    return true
  }

  /** `offset` places the clip at that time in SECONDS (drop on timeline);
   *  omitted = append at the end. `trackId` targets a specific compatible
   *  track. C16-R3: seconds are converted to store ticks at this boundary. */
  function addAssetToTimeline(assetId: string, options?: { offset?: number, trackId?: string }): boolean {
    const asset = assets.value.find(a => a.id === assetId)
    const project = currentProject.value
    if (!asset || !project) return false
    if (!asset.usedBy.includes(project.id)) {
      asset.usedBy.push(project.id)
    }
    // Audio-only containers (WebM without a video stream) must not land
    // on a video track — see effectiveAssetKind for the rule.
    const kind = effectiveAssetKind(asset)
    let duration: number
    if (kind === 'image') {
      duration = 5
    } else if (asset.meta.durationSec > 0) {
      duration = asset.meta.durationSec
    } else {
      duration = kind === 'audio' ? 5 : 10
    }
    const trackType = kind === 'audio' ? 'audio' : 'video'
    const clip = addClipToTrack(trackType, {
      name: asset.name,
      src: asset.path,
      in: 0,
      out: Math.round(secToTicks(duration)),
      speed: 1,
      offset: options?.offset === undefined ? undefined : Math.round(secToTicks(options.offset))
    }, options?.trackId)
    if (clip) persistLibrary()
    return !!clip
  }

  async function loadWaveform(asset: TmcutAsset): Promise<number[]> {
    if (!asset.waveformPath) return []
    const cached = waveformCache.get(asset.waveformPath)
    if (cached) return cached
    try {
      const res = await fetch(mediaUrl(asset.waveformPath))
      if (!res.ok) return []
      const data = (await res.json()) as { buckets?: unknown }
      const points = clampWaveformPoints(Array.isArray(data.buckets) ? (data.buckets as number[]) : [])
      waveformCache.set(asset.waveformPath, points)
      return points
    } catch {
      return []
    }
  }

  function getThumbUrl(asset: TmcutAsset): string {
    return asset.thumbPath ? mediaUrl(asset.thumbPath) : ''
  }

  function resolveMediaSrc(src?: string | null): string {
    if (!src) return ''
    if (proxyPreview.value) {
      const asset = findAssetBySrc(src)
      if (asset?.proxyPath && asset.proxyStatus === 'ready') {
        return mediaUrl(asset.proxyPath)
      }
    }
    return mediaUrl(src)
  }

  async function generateProxy(asset: TmcutAsset, width = 960): Promise<boolean> {
    if (asset.kind !== 'video' || asset.status === 'missing') return false
    const ipc = tmcutIpc()
    if (!ipc || typeof ipc.generateProxy !== 'function') return false
    asset.proxyStatus = 'generating'
    try {
      const res = await ipc.generateProxy({ filePath: asset.path, width })
      if (res?.ok && res.path) {
        asset.proxyPath = res.path
        asset.proxyStatus = 'ready'
        persistLibrary()
        return true
      }
      asset.proxyStatus = 'error'
      persistLibrary()
      return false
    } catch (err) {
      console.error('generateProxy error:', err)
      asset.proxyStatus = 'error'
      persistLibrary()
      return false
    }
  }

  function removeProxy(asset: TmcutAsset) {
    asset.proxyPath = null
    asset.proxyStatus = 'none'
    persistLibrary()
  }

  return {
    assets,
    projectAssets,
    missingAssets,
    analyzingCount,
    libraryLoaded,
    importing,
    importError,
    isDesktop,
    proxyPreview,
    resolveMediaSrc,
    generateProxy,
    removeProxy,
    loadLibrary,
    importFiles,
    importWebFiles,
    downloadRemoteMedia,
    cancelMediaDownload,
    onMediaDownloadProgress,
    probeWebMedia,
    captureVideoThumb,
    checkMissing,
    relink,
    removeAsset,
    linkAssetToProject,
    addAssetToTimeline,
    loadWaveform,
    getThumbUrl,
    mediaUrl,
    timelineSrcSet,
    findAssetBySrc,
    folders,
    projectFolders,
    selectedFolderId,
    folderCounts,
    folderTagColors: FOLDER_TAG_COLORS,
    createFolder: addFolder,
    renameFolder: editFolder,
    updateFolderColor: changeFolderColor,
    removeFolder: deleteFolder,
    moveAssetToFolder,
    getAssetFolderId
  }
}

// Dev/QA hook (R124): same pattern as useTmcutProject — lets the e2e
// harness seed the media library and assert drop behaviour. The web
// runtime deliberately clears the library on load (blob: URLs do not
// survive a reload), so a browser-driven harness must push fixtures
// through this ref instead of localStorage.
if (import.meta.client && import.meta.dev && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  const qaStore = (w.tmcutQaStore || (w.tmcutQaStore = {})) as Record<string, unknown>
  qaStore.assets = assets
}
