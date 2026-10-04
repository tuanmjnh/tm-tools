import type { TmcutAspectRatio, TmcutCanvas, TmcutCanvasBackground, TmcutCropRect, TmcutFitMode, TmcutOrientation } from '../../types/tmcut'

export interface TmcutCanvasPresetDef {
  id: string
  width: number
  height: number
  orientation: TmcutOrientation
  icon: string
}

export interface TmcutSocialPresetDef {
  id: string
  presetId: string
  icon: string
}

export const TMUTCANVAS_PRESETS: TmcutCanvasPresetDef[] = [
  { id: '16:9', width: 1920, height: 1080, orientation: 'landscape', icon: 'i-lucide-tv' },
  { id: '9:16', width: 1080, height: 1920, orientation: 'portrait', icon: 'i-lucide-smartphone' },
  { id: '1:1', width: 1080, height: 1080, orientation: 'square', icon: 'i-lucide-square' },
  { id: '4:5', width: 1080, height: 1350, orientation: 'portrait', icon: 'i-lucide-rectangle-vertical' },
  { id: '4:3', width: 1440, height: 1080, orientation: 'landscape', icon: 'i-lucide-proportions' },
  { id: '21:9', width: 2560, height: 1080, orientation: 'landscape', icon: 'i-lucide-monitor' }
]

export const TMUTCUT_SOCIAL_PRESETS: TmcutSocialPresetDef[] = [
  { id: 'youtube', presetId: '16:9', icon: 'i-lucide-tv' },
  { id: 'youtube-shorts', presetId: '9:16', icon: 'i-lucide-smartphone' },
  { id: 'tiktok', presetId: '9:16', icon: 'i-simple-icons-tiktok' },
  { id: 'instagram-reels', presetId: '9:16', icon: 'i-simple-icons-instagram' },
  { id: 'instagram-feed', presetId: '4:5', icon: 'i-simple-icons-instagram' },
  { id: 'facebook', presetId: '16:9', icon: 'i-simple-icons-facebook' }
]

export const TMUTCUT_FIT_MODES: TmcutFitMode[] = ['fit', 'fill', 'crop', 'stretch', 'smart']

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y > 0) {
    const t = x % y
    x = y
    y = t
  }
  return x || 1
}

export function aspectValue(width: number, height: number): number {
  if (!width || !height || width <= 0 || height <= 0) return 0
  const g = gcd(width, height)
  return width / g / (height / g)
}

export function orientationOf(width: number, height: number): TmcutOrientation {
  if (!width || !height || width <= 0 || height <= 0) return 'landscape'
  if (width > height) return 'landscape'
  if (width < height) return 'portrait'
  return 'square'
}

export function ratioIdOf(width: number, height: number): string {
  const preset = findCanvasPresetByDimensions(width, height)
  return preset ? preset.id : `${width}x${height}`
}

export function ratioLabel(width: number, height: number): string {
  return ratioIdOf(width, height)
}

export function findCanvasPreset(id: string): TmcutCanvasPresetDef | null {
  return TMUTCANVAS_PRESETS.find(p => p.id === id) || null
}

export function findCanvasPresetByDimensions(width: number, height: number): TmcutCanvasPresetDef | null {
  return TMUTCANVAS_PRESETS.find(p => p.width === Math.round(width) && p.height === Math.round(height)) || null
}

// ===== Canvas migration (backward compat for pre-v2 projects) =====

export function normalizeCanvas(
  canvas: Partial<TmcutCanvas> & { width?: number, height?: number, fps?: number } | undefined
): TmcutCanvas {
  const width = Math.round(canvas?.width && canvas.width > 0 ? canvas.width : 1920)
  const height = Math.round(canvas?.height && canvas.height > 0 ? canvas.height : 1080)
  const fps = canvas?.fps && canvas.fps > 0 ? canvas.fps : 30
  const aspectRatio: TmcutAspectRatio = canvas?.aspectRatio?.id
    ? {
        id: canvas.aspectRatio.id,
        value: canvas.aspectRatio.value || aspectValue(width, height),
        orientation: canvas.aspectRatio.orientation || orientationOf(width, height)
      }
    : {
        id: ratioIdOf(width, height),
        value: aspectValue(width, height),
        orientation: orientationOf(width, height)
      }
  const background: TmcutCanvasBackground = canvas?.background?.type
    ? (canvas.background.value !== undefined
        ? { type: canvas.background.type as TmcutCanvasBackground['type'], value: canvas.background.value }
        : { type: canvas.background.type as TmcutCanvasBackground['type'] })
    : { type: 'color', value: '#000000' }
  return { width, height, fps, aspectRatio, background }
}

// ===== Fit layout (preview object styles) =====

export interface TmcutFitObjectStyle {
  objectFit: 'contain' | 'cover' | 'fill'
  objectPosition: string
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5
  return Math.min(1, Math.max(0, v))
}

export function computeFitObjectStyle(
  mode: TmcutFitMode,
  focusX = 0.5,
  focusY = 0.5,
  cropRect?: TmcutCropRect
): TmcutFitObjectStyle {
  if (mode === 'fill') {
    return { objectFit: 'cover', objectPosition: '50% 50%' }
  }
  if (mode === 'stretch') {
    return { objectFit: 'fill', objectPosition: '50% 50%' }
  }
  if (mode === 'smart') {
    const fx = Math.round(clamp01(focusX) * 100)
    const fy = Math.round(clamp01(focusY) * 100)
    return { objectFit: 'cover', objectPosition: `${fx}% ${fy}%` }
  }
  if (mode === 'crop' && cropRect) {
    const w = clamp01(cropRect.w)
    const h = clamp01(cropRect.h)
    const cx = clamp01(cropRect.x) + w / 2
    const cy = clamp01(cropRect.y) + h / 2
    return { objectFit: 'cover', objectPosition: `${Math.round(cx * 100)}% ${Math.round(cy * 100)}%` }
  }
  return { objectFit: 'contain', objectPosition: '50% 50%' }
}

// ===== Fit filters (FFmpeg compiler) =====

export interface TmcutFitFilterOptions {
  focusX?: number
  focusY?: number
  cropRect?: TmcutCropRect
  padColor?: string
}

export function buildFfmpegFitFilters(
  mode: TmcutFitMode,
  canvasW: number,
  canvasH: number,
  options: TmcutFitFilterOptions = {}
): string[] {
  const w = Math.max(2, Math.floor(canvasW / 2) * 2)
  const h = Math.max(2, Math.floor(canvasH / 2) * 2)
  const padColor = options.padColor || 'black'
  const fit = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:${padColor}`

  if (mode === 'fill') {
    return [`scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`]
  }
  if (mode === 'stretch') {
    return [`scale=${w}:${h}`]
  }
  if (mode === 'smart') {
    const fx = clamp01(options.focusX ?? 0.5)
    const fy = clamp01(options.focusY ?? 0.5)
    return [
      `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:x='(iw-${w})*${fx.toFixed(4)}':y='(ih-${h})*${fy.toFixed(4)}'`
    ]
  }
  if (mode === 'crop' && options.cropRect) {
    const cx = clamp01(options.cropRect.x)
    const cy = clamp01(options.cropRect.y)
    const cw = clamp01(options.cropRect.w)
    const ch = clamp01(options.cropRect.h)
    if (cw > 0 && ch > 0 && (cx > 0 || cy > 0 || cw < 1 || ch < 1)) {
      return [
        `crop=w='iw*${cw.toFixed(4)}':h='ih*${ch.toFixed(4)}':x='iw*${cx.toFixed(4)}':y='ih*${cy.toFixed(4)}'`,
        fit
      ]
    }
    return [fit]
  }
  return [fit]
}

// ===== Reframe (canvas switch keeps timeline intact) =====

export interface TmcutReframeTransform {
  x: number
  y: number
}

export function reframeTransform(
  x: number,
  y: number,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number
): TmcutReframeTransform {
  if (!fromW || !fromH || !toW || !toH) return { x, y }
  return {
    x: Math.round((x || 0) * (toW / fromW)),
    y: Math.round((y || 0) * (toH / fromH))
  }
}
