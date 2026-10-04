import { ref, computed } from 'vue'
import type { TmcutAsset, TmcutAssetKind } from '~/types/tmcut'
import { createEmptyTmcutAssetMeta } from '~/types/tmcut'
import {
  classifyAssetKind,
  mediaFileName,
  mediaFileKey,
  normalizeMediaPath
} from '~/utils/tmcut/media'
import { clampWaveformPoints } from '~/utils/tmcut/waveform'
import { useTmcutProject } from '~/composables/useTmcutProject'

const ASSET_STORAGE_KEY = 'tmcut_assets_v1'

const assets = ref<TmcutAsset[]>([])
const libraryLoaded = ref(false)
const importing = ref(false)
const importError = ref<string | null>(null)

const waveformCache = new Map<string, number[]>()

function tmcutIpc() {
  return typeof window !== 'undefined' ? window.electronAPI?.tmcut : undefined
}

function ffmpegApi() {
  return typeof window !== 'undefined' ? window.electronAPI?.tools?.ffmpeg : undefined
}

function mediaUrl(filePath: string): string {
  return `media://?file=${encodeURIComponent(normalizeMediaPath(filePath))}`
}

export function useTmcutMedia() {
  const { currentProject, addClipToTrack, updateClipsSrc } = useTmcutProject()

  const isDesktop = computed(() => !!tmcutIpc())

  const projectAssets = computed(() => {
    const pid = currentProject.value?.id
    if (!pid) return []
    return assets.value.filter(a => a.usedBy.includes(pid))
  })

  const missingAssets = computed(() => projectAssets.value.filter(a => a.status === 'missing'))

  const analyzingCount = computed(() => projectAssets.value.filter(a => a.status === 'analyzing').length)

  async function loadLibrary() {
    if (libraryLoaded.value) return
    libraryLoaded.value = true
    const ipc = tmcutIpc()
    if (ipc && !import.meta.server) {
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
    try {
      localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(assets.value))
    } catch (error) {
      console.error('Failed to persist media registry to localStorage:', error)
    }
    const ipc = tmcutIpc()
    if (ipc) {
      ipc.writeAssetsFile(assets.value).catch(() => {})
    }
  }

  function buildAsset(inputPath: string, kind: TmcutAssetKind): TmcutAsset {
    const path = normalizeMediaPath(inputPath)
    return {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      kind,
      name: mediaFileName(path),
      path,
      usedBy: currentProject.value ? [currentProject.value.id] : [],
      status: 'analyzing',
      meta: createEmptyTmcutAssetMeta(),
      thumbPath: null,
      waveformPath: null,
      addedAt: new Date().toISOString()
    }
  }

  async function analyzeAsset(asset: TmcutAsset) {
    const ipc = tmcutIpc()
    const ffmpeg = ffmpegApi()
    try {
      if (!ipc || !ffmpeg) {
        asset.status = 'ready'
        asset.meta.probedAt = new Date().toISOString()
        return
      }

      const stats = await ipc.statFiles([asset.path])
      const stat = stats[asset.path]
      if (!stat?.exists) {
        asset.status = 'missing'
        return
      }
      asset.meta.fileSize = stat.size
      asset.meta.mtimeMs = stat.mtimeMs

      if (asset.kind === 'image') {
        asset.thumbPath = asset.path
      } else {
        const probe = await ffmpeg.probeMedia(asset.path)
        if (probe && (probe.duration > 0 || probe.width > 0)) {
          asset.meta.durationSec = probe.duration || 0
          asset.meta.width = probe.width || 0
          asset.meta.height = probe.height || 0
          asset.meta.fps = probe.fps || 0
        }

        if (asset.kind === 'video') {
          const thumb = await ipc.extractThumbnail({ filePath: asset.path })
          if (thumb?.ok && thumb.cachePath) {
            asset.thumbPath = thumb.cachePath
          }
        } else {
          const wave = await ipc.extractWaveform({ filePath: asset.path, buckets: 200 })
          if (wave?.ok && wave.cachePath) {
            asset.waveformPath = wave.cachePath
          }
        }
      }

      asset.status = 'ready'
      asset.meta.probedAt = new Date().toISOString()
    } catch (error) {
      console.error('Media analysis failed:', asset.path, error)
      asset.status = 'error'
    }
  }

  async function importFiles(paths: string[]): Promise<number> {
    importError.value = null
    const seen = new Set(assets.value.map(a => mediaFileKey(a.path)))
    const fresh: string[] = []
    for (const p of paths) {
      if (typeof p !== 'string') continue
      const key = mediaFileKey(p)
      if (!key || seen.has(key)) continue
      const kind = classifyAssetKind(p)
      if (!kind) continue
      seen.add(key)
      fresh.push(p)
    }
    if (fresh.length === 0) return 0

    importing.value = true
    let added = 0
    for (const p of fresh) {
      const kind = classifyAssetKind(p)
      if (!kind) continue
      const asset = buildAsset(p, kind)
      assets.value.unshift(asset)
      await analyzeAsset(asset)
      if (asset.status !== 'missing') added++
    }
    importing.value = false
    persistLibrary()
    return added
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

  function addAssetToTimeline(assetId: string): boolean {
    const asset = assets.value.find(a => a.id === assetId)
    const project = currentProject.value
    if (!asset || !project) return false
    if (!asset.usedBy.includes(project.id)) {
      asset.usedBy.push(project.id)
    }
    let duration: number
    if (asset.kind === 'image') {
      duration = 5
    } else if (asset.meta.durationSec > 0) {
      duration = asset.meta.durationSec
    } else {
      duration = asset.kind === 'audio' ? 5 : 10
    }
    const trackType = asset.kind === 'audio' ? 'audio' : 'video'
    const clip = addClipToTrack(trackType, {
      name: asset.name,
      src: asset.path,
      in: 0,
      out: Math.round(duration * 100) / 100,
      speed: 1
    })
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

  return {
    assets,
    projectAssets,
    missingAssets,
    analyzingCount,
    libraryLoaded,
    importing,
    importError,
    isDesktop,
    loadLibrary,
    importFiles,
    checkMissing,
    relink,
    removeAsset,
    addAssetToTimeline,
    loadWaveform,
    getThumbUrl,
    mediaUrl
  }
}
