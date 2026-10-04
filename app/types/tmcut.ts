export type TmcutAssetKind = 'video' | 'audio' | 'image'

export type TmcutAssetStatus = 'ready' | 'analyzing' | 'missing' | 'error'

export type TmcutFitMode = 'fit' | 'fill' | 'crop' | 'stretch' | 'smart'

export type TmcutOrientation = 'landscape' | 'portrait' | 'square'

export interface TmcutCropRect {
  x: number
  y: number
  w: number
  h: number
}

export interface TmcutAspectRatio {
  id: string
  value: number
  orientation: TmcutOrientation
}

export interface TmcutCanvasBackground {
  type: 'color' | 'image' | 'transparent'
  value?: string
}

export interface TmcutCanvas {
  width: number
  height: number
  fps: number
  aspectRatio: TmcutAspectRatio
  background: TmcutCanvasBackground
}

export interface TmcutAssetMeta {
  durationSec: number
  width: number
  height: number
  fps: number
  fileSize: number
  mtimeMs: number
  probedAt: string | null
}

export interface TmcutAsset {
  id: string
  kind: TmcutAssetKind
  name: string
  path: string
  usedBy: string[]
  status: TmcutAssetStatus
  meta: TmcutAssetMeta
  thumbPath: string | null
  waveformPath: string | null
  addedAt: string
}

export interface TmcutProjectFileInfo {
  id: string
  name: string
  updatedAt: string
  size: number
}

export interface TmcutSnapshotInfo {
  ts: number
  name: string
  updatedAt: string
}

export interface TmcutFileStat {
  exists: boolean
  size: number
  mtimeMs: number
}

export interface TmcutProjectMeta {
  hasProject: boolean
  projectMtimeMs: number
  hasRecovery: boolean
  recoveryUpdatedAtMs: number | null
}

export interface TmcutRecoveryInfo {
  id: string
  updatedAt: string
  mode: 'suggest' | 'force'
}

export function createEmptyTmcutAssetMeta(): TmcutAssetMeta {
  return {
    durationSec: 0,
    width: 0,
    height: 0,
    fps: 0,
    fileSize: 0,
    mtimeMs: 0,
    probedAt: null
  }
}
