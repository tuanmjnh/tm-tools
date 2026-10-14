import type { TmcutTimelineItem, TmcutTrack } from '~/composables/useTmcutProject'

/**
 * C16-R2: the render pipeline's CANONICAL clip view.
 *
 * The app timeline items are still v1-shaped (float seconds, numeric
 * scale/opacity) while Roadmap C16 migrates the store to DSL v3. The
 * render layer must never read v1 fields directly again — it consumes
 * RenderClip, produced by `toRenderClip` at the compile boundary. When
 * the store flips to v3, only that adapter changes.
 *
 * `raw` is the source item passed verbatim to core expression builders
 * (`keyframeExpr`, `volumeExpr` — both contract on the v1 clip shape,
 * including the keyframes[] array), so their input never degrades.
 */
export interface RenderClip {
  id: string
  /** Media input: absolute path of the source file (video/audio clips). */
  footagePath: string | null
  /** Text clip body (text tracks). */
  text: string | null
  /** Source in-point, media seconds (v1 float — the render boundary). */
  inSec: number
  /** Source out-point, media seconds (v1 float). */
  outSec: number
  /** Timeline position, seconds (v1 float). */
  offsetSec: number
  speed: number
  /** Percentage 0..100 (v1 scale). */
  scalePct: number
  /** Percentage 0..100 (v1 opacity). */
  opacityPct: number
  x: number
  y: number
  rotation: number
  /** Percentage 0..100 (v1 volume). */
  volumePct: number
  fit: string
  focusX: number
  focusY: number
  transitionIn: { type: string, duration: number } | null
  /** Source item for core expression builders (keyframeExpr / volumeExpr). */
  raw: TmcutTimelineItem
}

/**
 * Adapts an app timeline item (any track) to the render canonical view.
 * This is the ONLY place the render layer maps app-model fields — the
 * v1→v3 store flip (C16-R3) rewrites just this function.
 */
export function toRenderClip(item: TmcutTimelineItem): RenderClip {
  const src = item.src ?? null
  return {
    id: item.id,
    footagePath: (item.stabilize && item.stabilizedPath) ? item.stabilizedPath : src,
    text: item.text ?? null,
    inSec: item.in,
    outSec: item.out,
    offsetSec: item.offset || 0,
    speed: item.speed || 1,
    scalePct: item.scale ?? 100,
    opacityPct: item.opacity ?? 100,
    x: item.x || 0,
    y: item.y || 0,
    rotation: item.rotation || 0,
    volumePct: item.volume ?? 100,
    fit: item.fit || 'fit',
    focusX: item.focusX ?? 0.5,
    focusY: item.focusY ?? 0.5,
    transitionIn: item.transitionIn ?? null,
    raw: item
  }
}

/** Video-track items that carry media input, sorted by timeline position. */
export function renderVideoClips(track: TmcutTrack | undefined): RenderClip[] {
  return (track?.items || [])
    .filter(c => !!c.src)
    .sort((a, b) => (a.offset || 0) - (b.offset || 0))
    .map(toRenderClip)
}

/** Audio-track items that carry media input, in track order. */
export function renderAudioClips(track: TmcutTrack | undefined): RenderClip[] {
  return (track?.items || []).filter(c => !!c.src).map(toRenderClip)
}

/** Text-track items that carry a text body, in track order. */
export function renderTextClips(track: TmcutTrack | undefined): RenderClip[] {
  return (track?.items || []).filter(c => !!c.text).map(toRenderClip)
}

/** Timeline span of one clip, seconds: (out−in)/speed. */
export function renderClipDuration(clip: RenderClip): number {
  return (clip.outSec - clip.inSec) / clip.speed
}
