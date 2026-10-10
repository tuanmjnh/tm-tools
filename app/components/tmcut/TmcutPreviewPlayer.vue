<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTmcutProject } from '~/composables/useTmcutProject'
import { useTmcutPlayback } from '~/composables/useTmcutPlayback'
import { computeFitObjectStyle } from '~/utils/tmcut/canvas'
import { toURL } from '~/utils/ffmpegHelper'
import { previewScale, evalKeyframe, gainAt, safeAreaRects, SAFE_AREA_PRESETS, TICKS_PER_SECOND } from '@tmcut-core'
import type { TmcutKeyframe } from '@tmcut-core'
import { useTmcutFrames } from '~/composables/useTmcutFrames'

const { t } = useI18n()
const toast = useToast()
const { available: canExtractFrames, extractFrame } = useTmcutFrames()
const { currentProject, totalDuration, hasTimelineClips, selectedClipId, selectClip, updateClip, pushHistory } = useTmcutProject()
const {
  playhead,
  isPlaying,
  videoRef,
  outgoingVideoRef,
  activeVideoClip,
  transitionCrossfade,
  activeTextClips,
  formatTimecode,
  seek,
  togglePlayPause,
  stepForward,
  stepBackward,
  shuttleForward,
  shuttleBackward,
  shuttleStop,
  renderIn,
  renderOut,
  setRenderMark,
  loopPlayback,
  previewVolume,
  previewMuted
} = useTmcutPlayback()

const internalVideoRef = ref<HTMLVideoElement | null>(null)
// OUTGOING crossfade layer (roadmap B3): second <video> registered into
// the playback composable, synced by its rAF loop while a transition
// window is active.
const internalOutgoingRef = ref<HTMLVideoElement | null>(null)

// Safe area / guides overlays (session-level editor settings)
const showSafeArea = ref(false)
const showGuides = ref(false)
const showGrid = ref(false)
const showCenter = ref(false)

const overlayToggles = computed(() => [
  { key: 'safe', label: t('tmcut.safeArea.safe'), icon: 'i-lucide-frame', active: showSafeArea.value, onSelect: () => (showSafeArea.value = !showSafeArea.value) },
  { key: 'guides', label: t('tmcut.safeArea.guides'), icon: 'i-lucide-layout-grid', active: showGuides.value, onSelect: () => (showGuides.value = !showGuides.value) },
  { key: 'grid', label: t('tmcut.safeArea.grid'), icon: 'i-lucide-grid-3x3', active: showGrid.value, onSelect: () => (showGrid.value = !showGrid.value) },
  { key: 'center', label: t('tmcut.safeArea.center'), icon: 'i-lucide-crosshair', active: showCenter.value, onSelect: () => (showCenter.value = !showCenter.value) }
])

function pct(fraction: number) {
  return `${Number((fraction * 100).toFixed(4))}%`
}

// Safe-area rects (roadmap C13 / core canvas.mjs): action safe 0.90 and
// title safe 0.80 as centered fractions — replaces the hardcoded
// 2.5%/5% insets with the broadcast standard.
const safeArea = computed(() => safeAreaRects(currentProject.value?.canvas))

// Ratio frame guides (roadmap C13): pick a target ratio to draw its
// centered box inside the canvas — a composition aid, not a crop.
const ratioGuideId = ref<string | null>(null)

const ratioGuideItems = computed(() => [
  { label: t('tmcut.safeArea.none'), icon: 'i-lucide-x', onSelect: () => (ratioGuideId.value = null) },
  ...SAFE_AREA_PRESETS.map(preset => ({
    label: preset.label,
    icon: preset.id === ratioGuideId.value ? 'i-lucide-check' : undefined,
    onSelect: () => (ratioGuideId.value = preset.id)
  }))
])

// HUD snapshot (roadmap G-1, core C14 plans the timestamp): grab the
// active clip's frame at the current media time through the Electron
// extractor and report the cached PNG path. Hidden on web sessions —
// there is no IPC there, so the button would be dead.
const snapshotBusy = ref(false)

async function snapshotFrame() {
  const active = activeVideoClip.value
  if (!active || snapshotBusy.value) return
  snapshotBusy.value = true
  try {
    const path = await extractFrame(active.clip.src ?? '', active.mediaCurrentTime, 1280)
    if (path) {
      toast.add({ title: t('tmcut.player.snapshotSaved'), description: path, color: 'success' })
    } else {
      toast.add({ title: t('tmcut.player.snapshotFailed'), color: 'warning' })
    }
  } finally {
    snapshotBusy.value = false
  }
}

const ratioGuideStyle = computed(() => {
  const preset = SAFE_AREA_PRESETS.find(candidate => candidate.id === ratioGuideId.value)
  const canvas = currentProject.value?.canvas
  if (!preset || !canvas?.width || !canvas?.height) return null
  const canvasRatio = canvas.width / canvas.height
  const w = canvasRatio >= preset.ratio ? preset.ratio / canvasRatio : 1
  const h = canvasRatio >= preset.ratio ? 1 : canvasRatio / preset.ratio
  return { left: pct((1 - w) / 2), top: pct((1 - h) / 2), width: pct(w), height: pct(h) }
})

// HUD aspect label: reduce canvas WxH to the simplest ratio (1920x1080 →
// 16:9). Odd sizes that do not reduce below 64 stay as raw W:H numbers.
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

const aspectLabel = computed(() => {
  const canvas = currentProject.value?.canvas
  if (!canvas?.width || !canvas?.height) return ''
  const g = gcd(canvas.width, canvas.height)
  const w = Math.round(canvas.width / g)
  const h = Math.round(canvas.height / g)
  return w <= 64 && h <= 64 ? `${w}:${h}` : `${canvas.width}:${canvas.height}`
})

// Mini scrub bar: click or drag to seek across the whole timeline
const scrubRef = ref<HTMLDivElement | null>(null)
const scrubProgress = computed(() => (
  totalDuration.value > 0
    ? Math.min(100, (playhead.value / totalDuration.value) * 100)
    : 0
))

function seekFromScrub(clientX: number) {
  const el = scrubRef.value
  if (!el || !hasTimelineClips.value) return
  const rect = el.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  seek(ratio * totalDuration.value)
}

function onScrubDown(e: MouseEvent) {
  if (!hasTimelineClips.value) return
  seekFromScrub(e.clientX)
  const move = (ev: MouseEvent) => seekFromScrub(ev.clientX)
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// Expose video element to playback composable
watch(internalVideoRef, (el) => {
  videoRef.value = el
})

// Expose the OUTGOING crossfade layer to the playback composable
watch(internalOutgoingRef, (el) => {
  outgoingVideoRef.value = el
})

// Monitor box: explicit pixel dimensions preserving the canvas ratio
// (CapCut-style fixed frame). Pure CSS `aspect-ratio` breaks whenever the
// width-implied height exceeds `max-height` clamping, so the frame is
// measured instead: fit canvas WxH into the available column width and
// ~40% viewport height, whichever binds first. 16:9 renders wide, 9:16
// renders tall, 1:1 renders square — always exact.
const viewportRef = ref<HTMLElement | null>(null)
const viewportWidth = ref(0)
const viewportHeight = ref(0)

function measureViewport() {
  if (viewportRef.value) {
    viewportWidth.value = viewportRef.value.clientWidth
  }
  viewportHeight.value = window.innerHeight
}

// Canvas zoom (roadmap F-2 / design #2 "100% Fit"): 'fit' keeps the
// auto-fit frame pixel-identical to the old layout; a percent renders
// the canvas at that scale and the monitor stage scrolls inside a fixed
// 40vh box so the HUD header and transport deck stay pinned. The step
// list doubles as the ± control (a dropdown keeps the HUD lean).
const canvasZoom = ref<'fit' | number>('fit')
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2]

const canvasZoomItems = computed(() => [
  {
    label: t('tmcut.player.zoomFit'),
    icon: canvasZoom.value === 'fit' ? 'i-lucide-check' : undefined,
    onSelect: () => (canvasZoom.value = 'fit')
  },
  ...ZOOM_STEPS.map(step => ({
    label: `${Math.round(step * 100)}%`,
    icon: canvasZoom.value === step ? 'i-lucide-check' : undefined,
    onSelect: () => (canvasZoom.value = step)
  }))
])

// Stage budget: the same 40vh the fit calculation may consume — fit mode
// keeps AUTO height (old layout), zoomed mode pins it to scroll.
const monitorStageHeight = computed(() =>
  Math.max(200, Math.round((viewportHeight.value || 800) * 0.4))
)

const monitorBoxStyle = computed(() => {
  const canvas = currentProject.value?.canvas
  const w = canvas?.width || 1920
  const h = canvas?.height || 1080
  const availW = Math.max(200, viewportWidth.value || 640)
  const availH = monitorStageHeight.value
  const scale = canvasZoom.value === 'fit'
    ? Math.max(0.05, Math.min(availW / w, availH / h))
    : Math.max(0.05, canvasZoom.value)
  return {
    width: `${Math.floor(w * scale)}px`,
    height: `${Math.floor(h * scale)}px`,
    backgroundColor: canvas?.background?.type === 'color'
      ? canvas.background.value || '#000000'
      : undefined
  }
})

// Current media URL for active video clip.
// Reuse the same `toURL` helper as ToolsVideoFramePreview (the proven
// preview in tools/video.vue): local files are served through the
// privileged `media://local` protocol registered in electron/main.cjs.
// A raw `file://` URL is malformed for Windows paths and blocked by
// the renderer's origin/CSP rules, so the video would never load.
const currentMediaSrc = computed(() => {
  const src = activeVideoClip.value?.clip?.src
  if (!src) return ''
  return toURL(src)
})

// Media URL for the OUTGOING crossfade layer (roadmap B3).
const outgoingMediaSrc = computed(() => {
  const src = transitionCrossfade.value?.outgoing?.src
  if (!src) return ''
  return toURL(src)
})

// Seek the outgoing layer to its frame once its metadata lands (the rAF
// loop self-corrects afterwards, but the first paint should be right).
function onOutgoingLoadedMetadata() {
  const el = internalOutgoingRef.value
  const cf = transitionCrossfade.value
  if (el && cf) {
    try {
      el.currentTime = cf.outgoingMediaTime
    } catch {
      // ignore seeks on unloaded metadata
    }
  }
}

// Sync video position to the clip in-point once metadata is loaded
function onLoadedMetadata() {
  const el = internalVideoRef.value
  if (el && activeVideoClip.value) {
    el.currentTime = activeVideoClip.value.mediaCurrentTime
  }
}

// Load-error overlay (missing file / unsupported codec)
const mediaLoadError = ref(false)
watch(currentMediaSrc, () => {
  mediaLoadError.value = false
})
function onMediaError() {
  // Ignore when there is no media to load (initial state or clip just
  // removed): the empty placeholder owns that state, not the error overlay.
  if (!currentMediaSrc.value) return
  const el = internalVideoRef.value
  // Ignore stale failures: async error events from a previous src can arrive
  // after the playhead already moved on to another clip.
  if (el && el.currentSrc && el.currentSrc !== currentMediaSrc.value) return
  mediaLoadError.value = true
}

// Track holding the active video clip (for the hide flag)
const activeVideoTrack = computed(() => {
  const clipId = activeVideoClip.value?.clip?.id
  if (!clipId) return null
  return currentProject.value?.timeline?.tracks.find(
    tr => tr.type === 'video' && tr.items?.some(i => i.id === clipId)
  ) || null
})

const isTrackHidden = computed(() => !!activeVideoTrack.value?.hidden)

// Preview audio: the video element plays the active clip's
// own audio track. Muted only when the video track itself is
// muted (timeline header toggle). Timeline audio clips still
// have no preview engine — their mute state is persisted for
// the future audio engine.
//
// Keyframes (roadmap B1): `t` values are CLIP-LOCAL ticks — 0 is the
// clip's own start on the timeline, so keyframes travel with the clip
// when it is moved. Evaluation clamps outside the range (core C3).
// PREVIEW ONLY: the export pipeline does not render keyframes yet
// (Phase K roadmap item) — never expose them as exported behavior.
function localTicks(clip: { offset?: number }): number {
  return (playhead.value - (clip.offset || 0)) * TICKS_PER_SECOND
}

const isVideoMuted = computed(() => !!activeVideoTrack.value?.muted)
const videoVolume = computed(() => {
  const clip = activeVideoClip.value?.clip
  if (!clip) return 1
  const v = evalKeyframe(clip, 'volume', localTicks(clip)) ?? clip.volume
  // Fade envelope (roadmap C12 / core audio.mjs): gainAt multiplies the
  // (keyframed) volume by the fade ramp, each edge clamped to half the
  // clip. Preview only until the compiler round (R5) — the same gap
  // family as the volume slider itself.
  const withVolume = typeof v === 'number' ? { ...clip, volume: v } : clip
  return gainAt(withVolume, localTicks(clip))
})

// Re-sync preview after ANY timeline mutation (trim/move/split/add often
// keep the same src URL, so the src watcher alone would leave a stale
// frame when paused — no rAF loop runs to correct the drift).
function syncPreviewToPlayhead() {
  const el = internalVideoRef.value
  if (!el || !currentMediaSrc.value) return
  if (activeVideoClip.value) {
    try {
      el.currentTime = activeVideoClip.value.mediaCurrentTime
    } catch {
      // ignore seeks on unloaded metadata; loop corrects while playing
    }
    // Reverse clips stay paused: their frames are seek-driven (the
    // playback step loop owns them — see useTmcutPlayback).
    if (isPlaying.value && !activeVideoClip.value.clip.reverse) {
      el.play().catch(() => { })
    }
  } else {
    // Playhead sits in a gap: stop the element so a clip that is no longer
    // under the playhead never keeps playing through the gap.
    el.pause()
  }
}

watch(() => currentProject.value?.timeline, () => {
  syncPreviewToPlayhead()
}, { deep: true })

// Synchronize video element playback and seeking
watch(currentMediaSrc, (newSrc) => {
  if (internalVideoRef.value && newSrc) {
    syncPreviewToPlayhead()
  }
})

// Media fitting styles (Phase 2): fit/fill/crop/stretch/smart
const videoObjectStyle = computed(() => {
  const clip = activeVideoClip.value?.clip
  if (!clip) return {}
  return computeFitObjectStyle(clip.fit || 'fit', clip.focusX ?? 0.5, clip.focusY ?? 0.5, clip.cropRect)
})

// Text overlays scale with the rendered canvas size (roadmap §65.2):
// overlay units are canvas pixels, so multiply by the preview scale instead
// of the old hardcoded 0.7 factor. The monitor wrapper enforces the canvas
// aspect ratio, so the width-axis scale applies uniformly.
const monitorRef = ref<HTMLDivElement | null>(null)
const containerWidth = ref(0)
let resizeObserver: ResizeObserver | null = null
let viewportObserver: ResizeObserver | null = null

const textScale = computed(() =>
  previewScale(containerWidth.value, currentProject.value?.canvas?.width || 0)
)

// Per-type crossfade ramp for the INCOMING layer (roadmap B3). Fade and
// dissolve are a pure complementary opacity ramp over the outgoing layer
// — only ONE layer ramps, because source-over with two partial alphas
// would bleed the black background through (0.5·in + 0.25·out). Wipes
// reveal geometrically via clip-path, slide-left travels in (the monitor's
// overflow-hidden clips the off-screen part), zoom-in scales up fading.
// Export parity (xfade/acrossfade) lands with R3 — see the export badge.
function incomingRamp(type: string, p: number): { opacity: number, prepend?: string, append?: string, clipPath?: string } {
  switch (type) {
    case 'wipe-left':
      return { opacity: 1, clipPath: `inset(0 0 0 ${(1 - p) * 100}%)` }
    case 'wipe-right':
      return { opacity: 1, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }
    case 'slide-left':
      return { opacity: 1, append: `translateX(${(1 - p) * 100}%)` }
    case 'zoom-in':
      return { opacity: p, prepend: `scale(${0.85 + 0.15 * p})` }
    default: // 'fade' / 'dissolve'
      return { opacity: p }
  }
}

// Per-clip visual (transform + opacity from keyframes/static fields);
// shared by the main element and the outgoing crossfade layer.
function clipVisual(clip: { offset?: number, scale?: number, x?: number, y?: number, rotation?: number, opacity?: number, keyframes?: TmcutKeyframe[] }) {
  const at = localTicks(clip)
  const scale = (evalKeyframe(clip, 'scale', at) ?? clip.scale ?? 100) / 100
  const preview = textScale.value || 1
  const x = (evalKeyframe(clip, 'x', at) ?? clip.x ?? 0) * preview
  const y = (evalKeyframe(clip, 'y', at) ?? clip.y ?? 0) * preview
  const rot = clip.rotation || 0 // rotation has no keyframe UI (B1 scope)
  const opacity = (evalKeyframe(clip, 'opacity', at) ?? clip.opacity ?? 100) / 100
  return {
    transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${rot}deg)`,
    opacity
  }
}

// Active video transform styles (scale, position, rotation, opacity).
// x/y are CANVAS pixels like text overlays: multiplied by the preview
// scale so the offset stays resolution-independent (they were raw
// screen px before, which shifted with the window size).
const videoTransformStyle = computed(() => {
  const clip = activeVideoClip.value?.clip
  if (!clip) return {}

  // Keyframes (roadmap B1) evaluate at the playhead; the static clip
  // fields are the fallback for props without keyframes.
  const base = clipVisual(clip)
  const style: { transform: string, opacity: number, clipPath?: string } = { ...base }

  // Transition crossfade (roadmap B3): the main element is the INCOMING
  // clip — ramp it (or wipe/slide/zoom it) over the outgoing layer.
  const cf = transitionCrossfade.value
  if (cf && cf.incoming.id === clip.id) {
    const ramp = incomingRamp(cf.type, cf.progress)
    style.opacity = base.opacity * ramp.opacity
    if (ramp.clipPath) style.clipPath = ramp.clipPath
    if (ramp.prepend) style.transform = `${ramp.prepend} ${style.transform}`
    if (ramp.append) style.transform = `${style.transform} ${ramp.append}`
  }
  return style
})

// OUTGOING crossfade layer style: the neighbor's own fit, transform and
// opacity. The layer stays opaque (ramping only the incoming layer — see
// incomingRamp) so the composite is a clean crossfade.
const outgoingStyle = computed(() => {
  const cf = transitionCrossfade.value
  if (!cf) return null
  const clip = cf.outgoing
  return {
    ...computeFitObjectStyle(clip.fit || 'fit', clip.focusX ?? 0.5, clip.focusY ?? 0.5, clip.cropRect),
    ...clipVisual(clip)
  }
})

// Element fullscreen for the monitor frame (browser F11 stays available
// too — this only expands the canvas itself)
function toggleFullscreen() {
  const el = monitorRef.value
  if (!el) return
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
  } else {
    el.requestFullscreen().catch(() => {})
  }
}

function textOverlayStyle(textClip: {
  id: string
  color?: string
  fontSize?: number
  offset?: number
  x?: number
  y?: number
  scale?: number
  rotation?: number
  opacity?: number
  text?: string
  keyframes?: Array<{ t: number, prop: string, value: number, easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step' }>
}) {
  const scale = textScale.value
  // Keyframes (roadmap B1): x/y/scale/opacity evaluate at the playhead
  // (clip-local ticks); static fields are the no-keyframe fallback.
  const at = localTicks(textClip)
  const tx = evalKeyframe(textClip, 'x', at) ?? textClip.x ?? 0
  const ty = evalKeyframe(textClip, 'y', at) ?? textClip.y ?? 0
  const ts = evalKeyframe(textClip, 'scale', at) ?? textClip.scale ?? 100
  const to = evalKeyframe(textClip, 'opacity', at) ?? textClip.opacity ?? 100
  return {
    color: textClip.color || '#ffffff',
    fontSize: `${(textClip.fontSize || 36) * scale}px`,
    transform: `translate(${tx * scale}px, ${ty * scale}px) scale(${ts / 100}) rotate(${textClip.rotation || 0}deg)`,
    opacity: to / 100
  }
}

// Drag text overlays directly in preview (CapCut-style). Overlay units are
// canvas pixels, so pointer deltas divide by the preview scale.
let suppressCanvasClickUntil = 0

function onTextMouseDown(e: MouseEvent, textClip: { id: string, x?: number, y?: number }) {
  if (e.button !== 0) return
  e.stopPropagation()
  selectClip(textClip.id)
  pushHistory()
  const startX = e.clientX
  const startY = e.clientY
  const initialX = textClip.x || 0
  const initialY = textClip.y || 0
  let moved = false

  function onMouseMove(moveEvent: MouseEvent) {
    if (!moved && Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < 3) return
    moved = true
    suppressCanvasClickUntil = Date.now() + 250
    const scale = textScale.value || 1
    updateClip(textClip.id, {
      x: Math.round((initialX + (moveEvent.clientX - startX) / scale) * 10) / 10,
      y: Math.round((initialY + (moveEvent.clientY - startY) / scale) * 10) / 10
    })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// --- Video transform selection box (Roadmap A3) ---
// Shown only when the SELECTED clip is the video actually rendered at
// the playhead — no box floats over an empty canvas or a hidden track.
const selectionBoxClip = computed(() => {
  const clip = activeVideoClip.value?.clip
  if (!clip || clip.id !== selectedClipId.value) return null
  if (isTrackHidden.value || mediaLoadError.value) return null
  return clip
})

const selectionBoxRef = ref<HTMLDivElement | null>(null)

// Same transform as the rendered video, plus a constant 2px border:
// the transform scales CSS lengths, so the width is pre-divided.
const selectionBoxStyle = computed(() => {
  const clip = selectionBoxClip.value
  if (!clip) return null
  const scale = (clip.scale || 100) / 100
  const preview = textScale.value || 1
  return {
    transform: `translate(${(clip.x || 0) * preview}px, ${(clip.y || 0) * preview}px) scale(${scale}) rotate(${clip.rotation || 0}deg)`,
    borderWidth: `${2 / scale}px`
  }
})

// Corner handles: cosmetic cursor per corner; all four resize identically
// (uniform scale around the clip center).
const selectionCorners = [
  { key: 'nw', pos: '-top-1.5 -left-1.5', cursor: 'cursor-nwse-resize' },
  { key: 'ne', pos: '-top-1.5 -right-1.5', cursor: 'cursor-nesw-resize' },
  { key: 'sw', pos: '-bottom-1.5 -left-1.5', cursor: 'cursor-nesw-resize' },
  { key: 'se', pos: '-bottom-1.5 -right-1.5', cursor: 'cursor-nwse-resize' }
]

// Keep handles a constant size on screen regardless of clip scale.
const handleInverseScale = computed(() => 1 / ((selectionBoxClip.value?.scale || 100) / 100))

// Move the selected video clip in the preview: canvas-px deltas divided
// by the preview scale (same math as onTextMouseDown).
function onSelectionBodyMouseDown(e: MouseEvent) {
  const clip = selectionBoxClip.value
  if (!clip || e.button !== 0) return
  e.stopPropagation()
  pushHistory()
  const clipId = clip.id
  const startX = e.clientX
  const startY = e.clientY
  const initialX = clip.x || 0
  const initialY = clip.y || 0
  let moved = false

  function onMouseMove(moveEvent: MouseEvent) {
    if (!moved && Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < 3) return
    moved = true
    suppressCanvasClickUntil = Date.now() + 250
    const scale = textScale.value || 1
    updateClip(clipId, {
      x: Math.round((initialX + (moveEvent.clientX - startX) / scale) * 10) / 10,
      y: Math.round((initialY + (moveEvent.clientY - startY) / scale) * 10) / 10
    })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Corner resize: new scale = initial scale × (pointer distance from the
// clip center / distance at grab). The screen-px ratio equals the scale
// ratio (transform origin is the center) and distance is rotation
// invariant, so rotated clips resize correctly too. Clamp matches the
// Inspector scale input (10–300). Rotation has no handle on purpose —
// the export has no rotate filter yet (C7; same honesty rule that keeps
// the Inspector rotation slider hidden).
function onSelectionResizeMouseDown(e: MouseEvent) {
  const clip = selectionBoxClip.value
  if (!clip || e.button !== 0 || !selectionBoxRef.value) return
  e.stopPropagation()
  pushHistory()
  const clipId = clip.id
  const rect = selectionBoxRef.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY) || 1
  const initialScale = clip.scale || 100
  let moved = false

  function onMouseMove(moveEvent: MouseEvent) {
    if (!moved && Math.abs(moveEvent.clientX - e.clientX) + Math.abs(moveEvent.clientY - e.clientY) < 3) return
    moved = true
    suppressCanvasClickUntil = Date.now() + 250
    const dist = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY)
    const next = Math.min(300, Math.max(10, Math.round(initialScale * (dist / startDist))))
    updateClip(clipId, { scale: next })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Rotate handle: angle of the pointer around the clip center (screen
// space, y-down => atan2 grows clockwise) minus the angle at grab, added
// to the initial rotation. Matches CSS rotate(deg) direction — which
// matches the export filter since R21 verified rotate == transpose CW.
function onSelectionRotateMouseDown(e: MouseEvent) {
  const clip = selectionBoxClip.value
  if (!clip || e.button !== 0 || !selectionBoxRef.value) return
  e.stopPropagation()
  pushHistory()
  const clipId = clip.id
  // getBoundingClientRect of the rotated box: its AABB center is the
  // element center regardless of rotation.
  const rect = selectionBoxRef.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX)
  const initialRotation = clip.rotation || 0
  let moved = false

  function onMouseMove(moveEvent: MouseEvent) {
    if (!moved && Math.hypot(moveEvent.clientX - e.clientX, moveEvent.clientY - e.clientY) < 3) return
    moved = true
    suppressCanvasClickUntil = Date.now() + 250
    const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX)
    const deg = initialRotation + (angle - startAngle) * 180 / Math.PI
    const normalized = Math.round(((deg + 180) % 360 + 360) % 360 - 180)
    updateClip(clipId, { rotation: normalized })
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onCanvasClick() {
  if (Date.now() < suppressCanvasClickUntil) return
  togglePlayPause()
}

// Playback shortcuts: Space play/pause, arrow step, J-K-L shuttle
// (no-op when the timeline is empty)
function handleKeydown(e: KeyboardEvent) {
  if (!hasTimelineClips.value) return
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlayPause()
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault()
    stepBackward(e.shiftKey ? 5 : 1)
  } else if (e.code === 'ArrowRight') {
    e.preventDefault()
    stepForward(e.shiftKey ? 5 : 1)
  } else if (e.code === 'KeyJ' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    shuttleBackward()
  } else if (e.code === 'KeyK' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    shuttleStop()
  } else if (e.code === 'KeyL' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    shuttleForward()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', measureViewport)
  measureViewport()
  if (monitorRef.value) {
    containerWidth.value = monitorRef.value.clientWidth
    resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) containerWidth.value = width
    })
    resizeObserver.observe(monitorRef.value)
  }
  if (viewportRef.value) {
    viewportWidth.value = viewportRef.value.clientWidth
    viewportObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) viewportWidth.value = width
    })
    viewportObserver.observe(viewportRef.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', measureViewport)
  resizeObserver?.disconnect()
  resizeObserver = null
  viewportObserver?.disconnect()
  viewportObserver = null
})
</script>

<template>
  <div ref="viewportRef" class="flex flex-col items-center justify-center w-full max-w-full">
    <!-- HUD header (design #2): canvas info + engine badge | overlay toggles + fullscreen -->
    <div class="w-full mb-2 flex items-center justify-between gap-2 text-[11px]">
      <div class="flex items-center gap-2 min-w-0 text-neutral-400">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        <span class="font-medium text-neutral-300 truncate">{{ t('tmcut.player.hudCanvas') }}</span>
        <span v-if="currentProject?.canvas" class="font-mono text-neutral-500 shrink-0">
          {{ currentProject.canvas.width }}x{{ currentProject.canvas.height }}
        </span>
        <span v-if="aspectLabel" class="font-mono text-neutral-600 shrink-0">({{ aspectLabel }})</span>
        <span v-if="currentProject?.canvas" class="font-mono text-neutral-500 shrink-0">
          {{ currentProject.canvas.fps }} FPS
        </span>
        <span
          class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/25 text-primary text-[10px] font-medium shrink-0"
        >
          {{ t('tmcut.player.engineBadge') }}
        </span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <UButton
          v-for="toggle in overlayToggles"
          :key="toggle.key"
          :icon="toggle.icon"
          size="xs"
          variant="soft"
          :color="toggle.active ? 'primary' : 'neutral'"
          :title="toggle.label"
          @click="toggle.onSelect()"
        />
        <UDropdownMenu
          :items="canvasZoomItems"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-zoom-in"
            size="xs"
            variant="soft"
            :color="canvasZoom !== 'fit' ? 'primary' : 'neutral'"
            :title="t('tmcut.player.zoom')"
          />
        </UDropdownMenu>
        <UDropdownMenu
          :items="ratioGuideItems"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-rectangle-horizontal"
            size="xs"
            variant="soft"
            :color="ratioGuideId ? 'primary' : 'neutral'"
            :title="t('tmcut.safeArea.ratioGuide')"
          />
        </UDropdownMenu>
        <UButton
          v-if="canExtractFrames && activeVideoClip"
          :icon="snapshotBusy ? 'i-lucide-loader-circle' : 'i-lucide-camera'"
          size="xs"
          variant="soft"
          color="neutral"
          :loading="snapshotBusy"
          :title="t('tmcut.player.snapshot')"
          @click="snapshotFrame"
        />
        <UButton
          icon="i-lucide-maximize"
          size="xs"
          variant="soft"
          color="neutral"
          :title="t('tmcut.player.fullscreen')"
          @click="toggleFullscreen"
        />
      </div>
    </div>

    <!-- Monitor stage (roadmap F-2): auto height in fit mode — layout stays
         pixel-identical to before; pinned 40vh + scroll when zoomed so the
         HUD header and transport deck never scroll away. `m-auto` on the
         monitor centers when it fits and releases to the top-left when it
         overflows (flex centering would clip the top out of reach). -->
    <div
      class="w-full"
      :class="canvasZoom !== 'fit' ? 'overflow-auto' : ''"
      :style="canvasZoom !== 'fit' ? { height: `${monitorStageHeight}px` } : undefined"
    >
      <div
        ref="monitorRef"
        class="tmcut-monitor relative bg-black rounded-lg border border-neutral-800 shadow-2xl overflow-hidden select-none m-auto"
        :style="monitorBoxStyle"
        :title="isPlaying ? t('tmcut.player.pause') : t('tmcut.player.play')"
        @click="onCanvasClick"
      >
        <!-- OUTGOING crossfade layer (roadmap B3): the neighbor under the
           incoming clip during a transition window. Muted — preview audio
           follows the incoming clip (documented simplification, §102).
           Tree order puts it below the (positioned) main element above. -->
        <video
          v-if="transitionCrossfade && outgoingMediaSrc"
          v-show="!isTrackHidden"
          ref="internalOutgoingRef"
          :src="outgoingMediaSrc"
          class="absolute inset-0 w-full h-full pointer-events-none"
          :style="outgoingStyle || undefined"
          :muted="true"
          preload="auto"
          playsinline
          @loadedmetadata="onOutgoingLoadedMetadata"
        />

        <!-- HTML5 Video Element (served via media://local protocol,
           same as ToolsVideoFramePreview in tools/video.vue).
           `relative` keeps it in the stacking tree ABOVE the outgoing
           crossfade layer (both positioned z-auto → tree order wins). -->
        <video
          v-show="currentMediaSrc && !isTrackHidden"
          ref="internalVideoRef"
          :src="currentMediaSrc"
          class="relative w-full h-full pointer-events-none transition-transform duration-75"
          :style="{ ...videoObjectStyle, ...videoTransformStyle }"
          :muted="isVideoMuted || previewMuted"
          :volume="videoVolume * previewVolume"
          preload="auto"
          playsinline
          @loadedmetadata="onLoadedMetadata"
          @error="onMediaError"
        />

        <!-- Hidden-track badge (CapCut eye-off state) -->
        <div
          v-if="isTrackHidden && currentMediaSrc"
          class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-500 select-none"
        >
          <UIcon name="i-lucide-eye-off" class="size-10 opacity-40" />
          <span class="text-xs">{{ t('tmcut.player.trackHidden') }}</span>
        </div>

        <!-- Media load error overlay (only when a src was actually attempted) -->
        <div
          v-if="mediaLoadError && currentMediaSrc"
          class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-red-950/70 backdrop-blur-xs p-4 text-center select-none"
        >
          <UIcon name="i-lucide-alert-triangle" class="size-8 text-red-400 animate-pulse" />
          <p class="text-xs font-semibold text-red-200">
            {{ t('tmcut.player.loadError') }}
          </p>
          <p class="text-[10px] font-mono text-red-300/80 break-all max-w-full">
            {{ activeVideoClip?.clip?.src }}
          </p>
        </div>

        <!-- Safe Area / Guides / Grid / Center Overlays (Phase 2) -->
        <div
          v-if="showSafeArea"
          class="absolute pointer-events-none border border-dashed border-emerald-400/60"
          :style="{
            left: pct(safeArea.actionSafe.x),
            top: pct(safeArea.actionSafe.y),
            width: pct(safeArea.actionSafe.w),
            height: pct(safeArea.actionSafe.h)
          }"
        />
        <div
          v-if="showSafeArea"
          class="absolute pointer-events-none border border-dashed border-amber-400/60"
          :style="{
            left: pct(safeArea.titleSafe.x),
            top: pct(safeArea.titleSafe.y),
            width: pct(safeArea.titleSafe.w),
            height: pct(safeArea.titleSafe.h)
          }"
        />
        <!-- Ratio frame guide (roadmap C13): centered box of the picked
           target ratio — a composition aid, not a crop. -->
        <div
          v-if="ratioGuideStyle"
          class="absolute pointer-events-none border border-dashed border-primary/60"
          :style="ratioGuideStyle"
        />
        <div v-if="showGuides" class="absolute inset-0 pointer-events-none">
          <div class="absolute top-0 bottom-0 left-1/3 w-px bg-primary/40" />
          <div class="absolute top-0 bottom-0 left-2/3 w-px bg-primary/40" />
          <div class="absolute left-0 right-0 top-1/3 h-px bg-primary/40" />
          <div class="absolute left-0 right-0 top-2/3 h-px bg-primary/40" />
        </div>
        <div
          v-if="showGrid"
          class="absolute inset-0 pointer-events-none opacity-30"
          style="background-image: linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.35) 1px, transparent 1px); background-size: 10% 10%;"
        />
        <div v-if="showCenter" class="absolute inset-0 pointer-events-none flex items-center justify-center">
          <UIcon name="i-lucide-crosshair" class="size-6 text-red-400/70" />
        </div>

        <!-- Empty / Standby Canvas Placeholder -->
        <div
          v-if="!currentMediaSrc"
          class="absolute inset-0 flex flex-col items-center justify-center text-neutral-600 gap-2 p-6 text-center"
        >
          <UIcon name="i-lucide-clapperboard" class="size-12 opacity-30 text-primary" />
          <span class="text-xs font-medium text-neutral-500">
            {{ t('tmcut.player.noVideoAtPlayhead', { time: formatTimecode(playhead) }) }}
          </span>
          <span class="text-[10px] text-neutral-600 font-mono">
            {{ currentProject?.canvas?.width }} x {{ currentProject?.canvas?.height }}
          </span>
        </div>

        <!-- Selected video transform box (Roadmap A3): drag the body to
           move, drag a corner to scale. Sits BELOW the text overlays so
           text stays clickable on top of it. -->
        <div
          v-if="selectionBoxClip && selectionBoxStyle"
          ref="selectionBoxRef"
          class="absolute left-0 top-0 w-full h-full border-primary cursor-move"
          :style="selectionBoxStyle"
          @mousedown="onSelectionBodyMouseDown"
        >
          <span
            v-for="corner in selectionCorners"
            :key="corner.key"
            class="absolute w-2.5 h-2.5 -m-1 bg-white border-2 border-primary rounded-[2px]"
            :class="[corner.pos, corner.cursor]"
            :style="{ transform: `scale(${handleInverseScale})` }"
            @mousedown.stop="onSelectionResizeMouseDown"
          />
          <!-- Rotate stem + knob (R22): above the top edge, orbits with the
             box rotation; the knob is counter-scaled to stay constant size -->
          <div class="absolute left-1/2 -top-5 w-px h-4 -translate-x-1/2 bg-primary/70 pointer-events-none" />
          <span
            class="absolute left-1/2 -top-6 w-3 h-3 -translate-x-1/2 rounded-full bg-white border-2 border-primary cursor-grab active:cursor-grabbing pointer-events-auto"
            :style="{ transform: `scale(${handleInverseScale})` }"
            @mousedown.stop="onSelectionRotateMouseDown"
          />
        </div>

        <!-- Text Overlays (draggable in preview; explicit top-left anchor:
           absolute-without-offsets would collapse to the static position
           and get clipped by overflow-hidden) -->
        <div
          v-for="textClip in activeTextClips"
          :key="textClip.id"
          class="absolute left-0 top-0 font-bold text-center leading-tight drop-shadow-md select-none cursor-move hover:ring-1 hover:ring-primary/60 rounded"
          :style="textOverlayStyle(textClip)"
          @mousedown="onTextMouseDown($event, textClip)"
        >
          {{ textClip.text }}
        </div>
      </div>
    </div><!-- /monitor stage (F-2) -->

    <!-- Scrub bar + Transport deck (design #2) -->
    <div class="w-full mt-3 bg-neutral-900/50 border border-neutral-800 rounded-lg px-3 py-2 flex flex-col gap-2">
      <!-- Mini scrub bar: click/drag to seek -->
      <div
        ref="scrubRef"
        class="flex items-center gap-2 select-none"
        :class="hasTimelineClips ? 'cursor-pointer' : 'opacity-50 cursor-default'"
        @mousedown="onScrubDown"
      >
        <span class="font-mono text-[11px] text-primary font-semibold w-20 shrink-0 tabular-nums">
          {{ formatTimecode(playhead) }}
        </span>
        <div class="relative flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-[width] duration-75"
            :style="{ width: scrubProgress + '%' }"
          />
        </div>
        <span class="font-mono text-[11px] text-neutral-400 w-20 shrink-0 text-right tabular-nums">
          {{ formatTimecode(totalDuration) }}
        </span>
      </div>

      <!-- Transport controls -->
      <div class="flex items-center justify-between">
        <!-- Left: Loop, In/Out marks, jumps -->
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-repeat"
            size="xs"
            :variant="loopPlayback ? 'solid' : 'soft'"
            :color="loopPlayback ? 'primary' : 'neutral'"
            :disabled="!hasTimelineClips"
            :title="t('tmcut.player.loop')"
            @click="loopPlayback = !loopPlayback"
          />
          <UButton
            size="xs"
            :variant="renderIn !== null ? 'solid' : 'soft'"
            :color="renderIn !== null ? 'primary' : 'neutral'"
            :disabled="!hasTimelineClips"
            :title="t('tmcut.player.markIn')"
            @click="setRenderMark('in')"
          >
            IN
          </UButton>
          <UButton
            size="xs"
            :variant="renderOut !== null ? 'solid' : 'soft'"
            :color="renderOut !== null ? 'primary' : 'neutral'"
            :disabled="!hasTimelineClips"
            :title="t('tmcut.player.markOut')"
            @click="setRenderMark('out')"
          >
            OUT
          </UButton>
          <div class="w-px h-4 bg-neutral-800 mx-0.5" />
          <UButton
            icon="i-lucide-skip-back"
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="!hasTimelineClips"
            :title="t('tmcut.player.jumpToStart')"
            @click="seek(0)"
          />
          <UButton
            icon="i-lucide-chevron-left"
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="!hasTimelineClips"
            :title="t('tmcut.player.stepBackward')"
            @click="stepBackward(1)"
          />
        </div>

        <!-- Center: Play/Pause -->
        <UButton
          :icon="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          size="sm"
          color="primary"
          variant="solid"
          class="rounded-full w-9 h-9 p-0 flex items-center justify-center shadow-lg shadow-primary/20"
          :disabled="!hasTimelineClips"
          :title="isPlaying ? t('tmcut.player.pause') : t('tmcut.player.play')"
          @click="togglePlayPause"
        />

        <!-- Right: Steps, jumps & master volume -->
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-chevron-right"
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="!hasTimelineClips"
            :title="t('tmcut.player.stepForward')"
            @click="stepForward(1)"
          />
          <UButton
            icon="i-lucide-skip-forward"
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="!hasTimelineClips"
            :title="t('tmcut.player.jumpToEnd')"
            @click="seek(totalDuration)"
          />
          <div class="w-px h-4 bg-neutral-800 mx-0.5" />
          <UButton
            :icon="previewMuted || previewVolume === 0 ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
            size="xs"
            variant="soft"
            color="neutral"
            :title="t('tmcut.player.mute')"
            @click="previewMuted = !previewMuted"
          />
          <input
            v-model.number="previewVolume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="w-16 accent-primary cursor-pointer"
            :title="t('tmcut.player.volume')"
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Element fullscreen: the monitor keeps inline pixel sizes from
   monitorBoxStyle, and author !important beats inline styles, so the
   frame can expand to the full screen without a re-measure. */
.tmcut-monitor:fullscreen {
  width: 100vw !important;
  height: 100vh !important;
  border-radius: 0 !important;
  border: none !important;
}
</style>
