import type { TmcutAssetKind } from '../../types/tmcut'

const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpg', 'mpeg', 'ts', 'wmv', 'flv']
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'wma', 'opus']
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif', 'gif']

export function normalizeMediaPath(input: string): string {
  return String(input || '').trim().replace(/\\/g, '/')
}

export function mediaFileKey(input: string): string {
  return normalizeMediaPath(input).toLowerCase()
}

export function mediaFileName(input: string): string {
  const normalized = normalizeMediaPath(input)
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized
}

export function extensionOf(input: string): string {
  const base = mediaFileName(input)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function classifyAssetKind(input: string): TmcutAssetKind | null {
  const ext = extensionOf(input)
  if (VIDEO_EXTS.includes(ext)) return 'video'
  if (AUDIO_EXTS.includes(ext)) return 'audio'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  return null
}

export function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  const text = value >= 100 ? String(Math.round(value)) : value.toFixed(1)
  return `${text} ${units[i]}`
}
