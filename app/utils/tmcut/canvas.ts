// Canvas geometry (presets, aspect math, fit styles, FFmpeg fit filters,
// reframe) lives in @tmcut/core as the single source of truth since
// Roadmap C0 — this module only preserves existing app import paths.
//
// normalizeCanvas stays app-side on purpose: the app project model still
// stores fps as a number (docs section 14, v1 model bridged through
// applyV3Edit), while core's normalizeCanvas returns the DSL v3 rational
// fps ({ numerator, denominator }). The full switch lands with Roadmap
// C16 (app migration to DSL v3).
import { aspectValue, orientationOf, ratioIdOf } from '@tmcut-core'
import type { TmcutAspectRatio, TmcutCanvas, TmcutCanvasBackground } from '../../types/tmcut'

export {
  TMUTCANVAS_PRESETS,
  TMUTCUT_SOCIAL_PRESETS,
  TMUTCUT_FIT_MODES,
  aspectValue,
  orientationOf,
  ratioIdOf,
  ratioLabel,
  findCanvasPreset,
  findCanvasPresetByDimensions,
  computeFitObjectStyle,
  buildFfmpegFitFilters,
  buildFfmpegTransform,
  reframeTransform
} from '@tmcut-core'

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
