import type { TmcutCanvas, TmcutCropRect, TmcutFitMode } from '~/types/tmcut'
import { findCanvasPreset, normalizeCanvas, reframeTransform } from '~/utils/tmcut/canvas'
import { decideRecovery } from '~/utils/tmcut/recovery'
import {
  addTrack,
  removeTrack,
  copyClips,
  pasteClips,
  duplicateClips,
  rippleDelete,
  snapTime,
  secToTicks,
  ticksToSec,
  v1TracksToV3,
  syncV3Result,
  expandRelated,
  addMarker,
  removeMarker,
  trimClip,
  groupClips,
  ungroupClips,
  insertClipRipple,
  closeGaps,
  v1ClipToV3,
  canApplyTransition,
  applyTransition,
  clearTransition
} from '@tmcut-core'
import type { CoreClipboard, TmcutTimeline } from '@tmcut-core'

// Type definitions for TMCut project
export interface TmcutTimelineItem {
  id: string
  name?: string
  src?: string
  text?: string
  color?: string
  fontSize?: number
  in: number
  out: number
  offset: number
  speed: number
  reverse?: boolean
  /** Group editing: clips sharing a groupId move/select together (core Phase 2). */
  groupId?: string | null
  /** Linked pair (e.g. video + its audio): select/move together. */
  linkId?: string | null
  opacity: number
  scale: number
  x: number
  y: number
  rotation: number
  volume?: number
  fit?: TmcutFitMode
  focusX?: number
  focusY?: number
  cropRect?: TmcutCropRect
  effects?: Array<{ type: string, params: Record<string, unknown> }>
  /** Keyframes: animated prop values (t in ticks; easing drives the
      segment to the NEXT keyframe). Export renders them in a later R
      item — until then the UI must label keyframes preview-only. */
  keyframes?: Array<{ t: number, prop: string, value: number, easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step' }>
  transitionIn?: { type: string, duration: number }
  /** Fade in/out audio envelope (t in TICKS; core C12). */
  fade?: { in: number, out: number }
}

export interface TmcutTrack {
  id: string
  type: 'video' | 'text' | 'audio'
  name?: string
  muted?: boolean
  locked?: boolean
  hidden?: boolean
  items: TmcutTimelineItem[]
}

/** Ruler marker (roadmap B5) — structurally identical to the core type. */
export interface TmcutMarker {
  id: string
  /** Timeline position in ticks (TICKS_PER_SECOND). */
  at: number
  label?: string
  color?: string
}

export interface TmcutProjectTimeline {
  version: number
  tracks: TmcutTrack[]
  durationMs: number
  /** Ruler markers — read/written in place by the core marker ops. */
  markers?: TmcutMarker[]
}

export interface TmcutProject {
  id: string
  name: string
  cover: string
  durationMs: number
  canvas: TmcutCanvas
  timeline: TmcutProjectTimeline
  settings: {
    resolution: string
    fps: number
    format: string
    bitrate: number
  }
  source: 'manual' | 'autocut' | 'template'
  created_at: string
  updated_at: string
}

// Global project state
const currentProject = ref<TmcutProject | null>(null)
const projects = ref<TmcutProject[]>([])
const isLoading = ref(false)
const selectedClipId = ref<string | null>(null)
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const lastSavedAt = ref<string | null>(null)
const pendingRecovery = ref<{ id: string, updatedAt: string } | null>(null)
const snapshots = ref<Array<{ ts: number, name: string, updatedAt: string }>>([])

function tmcutIpc() {
  return typeof window !== 'undefined' ? window.electronAPI?.tmcut : undefined
}

function normalizePath(input: string): string {
  return String(input || '').trim().replace(/\\/g, '/')
}

// Compute selected clip with track reference
const selectedClip = computed(() => {
  if (!selectedClipId.value || !currentProject.value?.timeline?.tracks) return null
  for (const track of currentProject.value.timeline.tracks) {
    const item = track.items?.find(i => i.id === selectedClipId.value)
    if (item) {
      return { track: track.type, item }
    }
  }
  return null
})

// Compute total timeline duration in seconds
const totalDuration = computed(() => {
  if (!currentProject.value?.timeline?.tracks) return 0
  let maxSec = 0
  for (const track of currentProject.value.timeline.tracks) {
    for (const item of track.items || []) {
      const dur = (item.out - item.in) / (item.speed || 1)
      const endSec = (item.offset || 0) + Math.max(0, dur)
      if (endSec > maxSec) {
        maxSec = endSec
      }
    }
  }
  return Math.max(maxSec, 5) // Minimum 5 seconds ruler
})

// True when at least one clip exists on any timeline track.
// Used to disable preview transport controls when the timeline is empty
// (playhead animation and seeking are meaningless without media).
const hasTimelineClips = computed(() => {
  if (!currentProject.value?.timeline?.tracks) return false
  return currentProject.value.timeline.tracks.some(t => (t.items?.length || 0) > 0)
})

function buildDefaultProject(projectId: string, name = 'Untitled Project'): TmcutProject {
  return {
    id: projectId,
    name,
    cover: '',
    durationMs: 0,
    canvas: normalizeCanvas({ width: 1920, height: 1080, fps: 30 }),
    timeline: {
      version: 1,
      tracks: [
        { id: 't-text-1', type: 'text', name: 'Text', items: [] },
        { id: 't-video-1', type: 'video', name: 'Video 1', items: [] },
        { id: 't-audio-1', type: 'audio', name: 'Audio 1', items: [] }
      ],
      durationMs: 0,
      markers: []
    },
    settings: {
      resolution: '1920x1080',
      fps: 30,
      format: 'mp4',
      bitrate: 5000
    },
    source: 'manual',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

// Backward-compat migration for pre-v2 projects (legacy canvas + missing tracks)
function applyProjectMigration(project: TmcutProject) {
  project.canvas = normalizeCanvas(project.canvas)
  ensureDefaultTracks(project)
  // Pre-B5 projects were saved without a markers array (core addMarker
  // throws on a missing array), so backfill it during migration.
  if (!Array.isArray(project.timeline.markers)) {
    project.timeline.markers = []
  }
}

function ensureDefaultTracks(project: TmcutProject) {
  if (!project.timeline) {
    project.timeline = { version: 1, tracks: [], durationMs: 0, markers: [] }
  }
  if (!project.timeline.tracks) {
    project.timeline.tracks = []
  }
  if (!Array.isArray(project.timeline.markers)) {
    project.timeline.markers = []
  }
  const hasText = project.timeline.tracks.some(t => t.type === 'text')
  const hasVideo = project.timeline.tracks.some(t => t.type === 'video')
  const hasAudio = project.timeline.tracks.some(t => t.type === 'audio')

  if (!hasText) {
    project.timeline.tracks.unshift({ id: 't-text-1', type: 'text', name: 'Text', items: [] })
  }
  if (!hasVideo) {
    project.timeline.tracks.push({ id: 't-video-1', type: 'video', name: 'Video 1', items: [] })
  }
  if (!hasAudio) {
    project.timeline.tracks.push({ id: 't-audio-1', type: 'audio', name: 'Audio 1', items: [] })
  }
}

async function persistProjectToDisk() {
  const project = currentProject.value
  const ipc = tmcutIpc()
  if (!project || !ipc || import.meta.server) return
  saveStatus.value = 'saving'
  try {
    // Convert Vue reactive project to plain object for IPC serialization
    // JSON.parse/stringify handles the reactive proxies properly
    const plainProject = JSON.parse(JSON.stringify(project)) as TmcutProject
    plainProject.updated_at = new Date().toISOString()
    await ipc.writeProject({ id: plainProject.id, data: plainProject })
    await ipc.writeRecovery({ id: plainProject.id, data: plainProject })
    saveStatus.value = 'saved'
    lastSavedAt.value = plainProject.updated_at
  } catch (error) {
    console.error('Failed to persist project to disk:', error)
    saveStatus.value = 'error'
  }
}

// Helper: convert Vue reactive project to plain object for IPC serialization
// (removed - using inline JSON.parse/stringify instead)

let diskSaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleDiskSave(delayMs = 2000) {
  if (diskSaveTimer) clearTimeout(diskSaveTimer)
  diskSaveTimer = setTimeout(() => {
    diskSaveTimer = null
    void persistProjectToDisk()
  }, delayMs)
}

function flushDiskSave() {
  if (diskSaveTimer) {
    clearTimeout(diskSaveTimer)
    diskSaveTimer = null
  }
  void persistProjectToDisk()
}

// Load project by ID
async function loadProject(projectId: string) {
  isLoading.value = true
  selectedClipId.value = null
  pendingRecovery.value = null

  const ipc = tmcutIpc()
  if (ipc && !import.meta.server) {
    try {
      const disk = (await ipc.readProject(projectId)) as TmcutProject | null
      if (disk && disk.id && Array.isArray(disk.timeline?.tracks)) {
        currentProject.value = disk
        applyProjectMigration(disk)
        syncProjectIndex(disk)
        await detectRecovery(projectId)
        isLoading.value = false
        return
      }
    } catch (error) {
      console.error('Failed to read project from disk:', error)
    }
  }

  if (!import.meta.server) {
    const stored = localStorage.getItem(`tmcut_project_${projectId}`)
    if (stored) {
      try {
        const local = JSON.parse(stored) as TmcutProject
        currentProject.value = local
        applyProjectMigration(local)
        syncProjectIndex(local)
        isLoading.value = false
        return
      } catch (error) {
        console.error('Failed to parse project from localStorage:', error)
      }
    }
  }

  const newProj = buildDefaultProject(projectId)
  currentProject.value = newProj
  isLoading.value = false
}

function syncProjectIndex(project: TmcutProject) {
  const idx = projects.value.findIndex(p => p.id === project.id)
  if (idx !== -1) {
    projects.value[idx] = { ...project }
  } else {
    projects.value.unshift(project)
  }
}

async function detectRecovery(projectId: string) {
  const ipc = tmcutIpc()
  if (!ipc || !currentProject.value) return
  try {
    const meta = await ipc.readProjectMeta(projectId)
    const decision = decideRecovery({
      hasRecovery: meta.hasRecovery,
      recoveryUpdatedAtMs: meta.recoveryUpdatedAtMs,
      hasProject: meta.hasProject,
      projectMtimeMs: meta.projectMtimeMs
    })
    if (decision === 'none') return
    const recovery = (await ipc.readRecovery(projectId)) as TmcutProject | null
    if (!recovery?.id) return
    const updatedAt = recovery.updated_at || new Date(meta.recoveryUpdatedAtMs ?? Date.now()).toISOString()
    if (decision === 'force') {
      currentProject.value = recovery
      applyProjectMigration(recovery)
      syncProjectIndex(recovery)
      scheduleDiskSave(0)
    }
    pendingRecovery.value = { id: projectId, updatedAt }
  } catch (error) {
    console.error('Recovery detection failed:', error)
  }
}

async function applyRecovery() {
  const info = pendingRecovery.value
  const ipc = tmcutIpc()
  if (!info || !ipc) return
  try {
    const recovery = (await ipc.readRecovery(info.id)) as TmcutProject | null
    if (!recovery?.id) {
      pendingRecovery.value = null
      return
    }
    currentProject.value = recovery
    applyProjectMigration(recovery)
    syncProjectIndex(recovery)
    pendingRecovery.value = null
    flushDiskSave()
  } catch (error) {
    console.error('Failed to apply recovery:', error)
  }
}

async function dismissRecovery() {
  const info = pendingRecovery.value
  const ipc = tmcutIpc()
  if (info && ipc) {
    try {
      await ipc.deleteRecovery(info.id)
    } catch (error) {
      console.error('Failed to delete recovery file:', error)
    }
  }
  pendingRecovery.value = null
}

async function refreshProjects() {
  const ipc = tmcutIpc()
  if (!ipc || import.meta.server) return
  try {
    const files = await ipc.listProjectFiles()
    for (const file of files) {
      const existing = projects.value.find(p => p.id === file.id)
      if (existing && currentProject.value?.id === file.id) continue
      if (existing) {
        if (file.updatedAt && file.updatedAt > existing.updated_at && currentProject.value?.id !== file.id) {
          const data = (await ipc.readProject(file.id)) as TmcutProject | null
          if (data?.id) {
            projects.value[projects.value.indexOf(existing)] = data
          }
        }
        continue
      }
      const data = (await ipc.readProject(file.id)) as TmcutProject | null
      if (data?.id) {
        projects.value.unshift(data)
      }
    }
  } catch (error) {
    console.error('Failed to refresh project index from disk:', error)
  }
}

// Save project (localStorage mirror + scheduled disk write)
function saveProject() {
  if (!currentProject.value || import.meta.server) return

  currentProject.value.updated_at = new Date().toISOString()
  currentProject.value.durationMs = Math.round(totalDuration.value * 1000)

  const idx = projects.value.findIndex(p => p.id === currentProject.value!.id)
  if (idx !== -1) {
    projects.value[idx] = { ...currentProject.value }
  }

  try {
    localStorage.setItem(`tmcut_project_${currentProject.value.id}`, JSON.stringify(currentProject.value))
  } catch (e) {
    console.error('Failed to save project:', e)
  }

  scheduleDiskSave()
}

// Create new project
function createProject(name: string = 'Untitled Project'): TmcutProject {
  const newProject = buildDefaultProject(Math.random().toString(36).slice(2, 10), name)

  currentProject.value = newProject
  projects.value.unshift(newProject)
  saveProject()

  return newProject
}

// Rename a project from the dashboard. The project does not need to be
// the open one: on desktop the new name is written straight to disk, on
// the web session it stays in memory (same rule as saveProject).
async function renameProject(projectId: string, name: string) {
  const project = projects.value.find(p => p.id === projectId)
  const clean = String(name || '').trim()
  if (!project || !clean) return
  project.name = clean
  project.updated_at = new Date().toISOString()

  if (currentProject.value?.id === projectId) {
    currentProject.value.name = clean
    saveProject()
    return
  }

  const ipc = tmcutIpc()
  if (ipc) {
    try {
      await ipc.writeProject({ id: projectId, data: JSON.parse(JSON.stringify(project)) })
    } catch (error) {
      console.error('Failed to rename project on disk:', error)
    }
  }
}

// Duplicate a project from the dashboard (full deep copy with a new id).
// The copy suffix is passed in by the caller — module-scope composable
// code has no vue-i18n instance (useI18n only works inside setup).
function duplicateProject(projectId: string, copySuffix = 'copy'): TmcutProject | null {
  const source = projects.value.find(p => p.id === projectId)
  if (!source) return null
  const clone: TmcutProject = JSON.parse(JSON.stringify(source))
  clone.id = Math.random().toString(36).slice(2, 10)
  clone.name = `${source.name} (${copySuffix})`
  clone.created_at = new Date().toISOString()
  clone.updated_at = clone.created_at
  projects.value.unshift(clone)

  const ipc = tmcutIpc()
  if (ipc) {
    try {
      void ipc.writeProject({ id: clone.id, data: JSON.parse(JSON.stringify(clone)) })
    } catch (error) {
      console.error('Failed to persist duplicated project:', error)
    }
  }
  return clone
}

// Delete project
async function deleteProject(projectId: string) {
  if (!import.meta.server) {
    localStorage.removeItem(`tmcut_project_${projectId}`)
  }

  projects.value = projects.value.filter(p => p.id !== projectId)

  if (currentProject.value?.id === projectId) {
    currentProject.value = null
    selectedClipId.value = null
    pendingRecovery.value = null
  }

  const ipc = tmcutIpc()
  if (ipc) {
    try {
      await ipc.deleteProject(projectId)
    } catch (error) {
      console.error('Failed to delete project files:', error)
    }
  }
}

function selectClip(clipId: string | null) {
  selectedClipId.value = clipId
}

// Add a clip to a track
function addClipToTrack(trackType: 'video' | 'text' | 'audio', partialItem: Partial<TmcutTimelineItem>, trackId?: string) {
  if (!currentProject.value) return null
  ensureDefaultTracks(currentProject.value)
  pushHistory()
  // Optional explicit target (timeline drop, Roadmap A4): only honored
  // when the id belongs to the matching track type, otherwise fall back
  // to the first track of the desired type (or create one below).
  let track = trackId
    ? currentProject.value.timeline.tracks.find(t => t.id === trackId && t.type === trackType)
    : undefined
  if (!track) {
    track = currentProject.value.timeline.tracks.find(t => t.type === trackType)
  }
  if (!track) {
    track = { id: `t-${trackType}-${Date.now()}`, type: trackType, name: trackType, items: [] }
    currentProject.value.timeline.tracks.push(track)
  }

  const speed = partialItem.speed ?? 1
  const inPoint = partialItem.in ?? 0
  const outPoint = partialItem.out ?? (trackType === 'text' ? 4 : 5)

  // Determine offset if not specified
  let offset = partialItem.offset
  if (offset === undefined) {
    offset = track.items.reduce((max, i) => Math.max(max, (i.offset || 0) + ((i.out - i.in) / (i.speed || 1))), 0)
  }

  const newItem: TmcutTimelineItem = {
    id: partialItem.id || `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: partialItem.name || 'Clip',
    src: partialItem.src,
    text: partialItem.text,
    color: partialItem.color || '#ffffff',
    fontSize: partialItem.fontSize || 36,
    in: inPoint,
    out: outPoint,
    offset,
    speed,
    reverse: partialItem.reverse ?? false,
    opacity: partialItem.opacity ?? 100,
    scale: partialItem.scale ?? 100,
    x: partialItem.x ?? 0,
    y: partialItem.y ?? 0,
    rotation: partialItem.rotation ?? 0,
    volume: partialItem.volume ?? 100,
    fit: partialItem.fit,
    focusX: partialItem.focusX,
    focusY: partialItem.focusY,
    cropRect: partialItem.cropRect,
    effects: partialItem.effects || [],
    keyframes: partialItem.keyframes || [],
    transitionIn: partialItem.transitionIn
  }

  // Ripple insert (roadmap B9, core C2): with ripple mode ON, dropping
  // a clip ON TOP of existing content becomes an INSERT edit — the new
  // clip lands at the target and every later clip on the track shifts
  // right by its duration. Drops into empty gaps keep the plain
  // overlay behaviour, like CapCut's insert mode. History was already
  // pushed above, so the bridge runs with skipHistory.
  const durationSec = (outPoint - inPoint) / speed
  const collides = track.items.some((i) => {
    const start = i.offset || 0
    const end = start + (i.out - i.in) / (i.speed || 1)
    return start < offset + durationSec && end > offset
  })
  if (rippleMode.value && collides) {
    const rippleId = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const v3Partial = v1ClipToV3({ ...newItem, id: rippleId }, trackType)
    const result = applyV3Edit(v3 => insertClipRipple(v3, trackType, v3Partial, secToTicks(offset)), { skipHistory: true })
    if (result) {
      selectedClipId.value = result.clip.id
      return currentProject.value.timeline.tracks
        .flatMap(t => t.items || [])
        .find(i => i.id === result.clip.id) ?? null
    }
    // A locked target track refuses the bridge insert; fall through to
    // the plain overlay path so the drop never silently vanishes.
  }

  track.items.push(newItem)
  selectedClipId.value = newItem.id
  saveProject()
  return newItem
}

// Close gaps (roadmap B9 — core C2): pull every unlocked track
// together. A cheap v1 pre-scan avoids pushing a no-op history entry
// when there is nothing to close; returns the seconds closed.
function closeProjectGaps(): number {
  const tracks = currentProject.value?.timeline?.tracks
  if (!tracks) return 0
  let hasGap = false
  for (const track of tracks) {
    if (track.locked) continue
    const sorted = [...(track.items || [])].sort((a, b) => (a.offset || 0) - (b.offset || 0))
    let cursor = 0
    for (const item of sorted) {
      const start = item.offset || 0
      if (start > cursor) {
        hasGap = true
        break
      }
      cursor = Math.max(cursor, start + (item.out - item.in) / (item.speed || 1))
    }
    if (hasGap) break
  }
  if (!hasGap) return 0
  return applyV3Edit(v3 => closeGaps(v3)) ?? 0
}

// Update clip
function updateClip(clipId: string, patch: Partial<TmcutTimelineItem>) {
  if (!currentProject.value?.timeline?.tracks) return
  for (const track of currentProject.value.timeline.tracks) {
    const idx = track.items?.findIndex(i => i.id === clipId)
    if (idx !== undefined && idx !== -1) {
      track.items[idx] = { ...track.items[idx]!, ...patch }
      saveProject()
      return
    }
  }
}

// Remove clip
function removeClip(clipId: string) {
  if (!currentProject.value?.timeline?.tracks) return
  for (const track of currentProject.value.timeline.tracks) {
    const idx = track.items?.findIndex(i => i.id === clipId)
    if (idx !== undefined && idx !== -1) {
      pushHistory()
      track.items.splice(idx, 1)
      if (selectedClipId.value === clipId) {
        selectedClipId.value = null
      }
      saveProject()
      return
    }
  }
}

// ===== Core-backed editing (roadmap Phase 2 wiring) =====
// The v1 state shape stays untouched: conversions run through the
// dependency-free @tmcut/core bridge, results merge back by clip id, and
// the app JSON history wraps every op so undo keeps working.

const clipboard = ref<CoreClipboard | null>(null)
const rippleMode = ref(false)

function expandedSelectionIds(): string[] {
  if (!selectedClipId.value || !currentProject.value) return []
  return expandRelated(v1TracksToV3(currentProject.value.timeline.tracks), [selectedClipId.value])
}

/** Run a core op on a converted v3 copy, then merge results back by id. */
function applyV3Edit<T>(operate: (v3: TmcutTimeline) => T, options?: { skipHistory?: boolean }): T | null {
  const tracks = currentProject.value?.timeline?.tracks
  if (!tracks) return null
  const v3 = v1TracksToV3(tracks)
  // Callers that already pushed history (multi-step gestures) pass
  // skipHistory so one user action stays ONE undo entry.
  if (!options?.skipHistory) pushHistory()
  const result = operate(v3)
  syncV3Result(tracks, v3)
  saveProject()
  return result
}

function copySelectedClips(): boolean {
  const tracks = currentProject.value?.timeline?.tracks
  const ids = expandedSelectionIds()
  if (!tracks || ids.length === 0) return false
  const data = copyClips(v1TracksToV3(tracks), ids)
  clipboard.value = data
  return !!data
}

function pasteClipboardAt(timeSec: number): string[] {
  const data = clipboard.value
  if (!data) return []
  const target = Math.max(0, Math.round(secToTicks(timeSec)))
  const result = applyV3Edit(v3 => pasteClips(v3, data, target))
  if (result && result.length > 0) {
    selectedClipId.value = result[result.length - 1] ?? null
  }
  return result ?? []
}

function duplicateSelectedClips(atSec?: number): string[] {
  const ids = expandedSelectionIds()
  if (ids.length === 0) return []
  const target = atSec === undefined ? undefined : Math.max(0, Math.round(secToTicks(atSec)))
  const result = applyV3Edit(v3 => duplicateClips(v3, ids, target))
  const newIds = result ? result.map(copy => copy.id) : []
  if (newIds.length > 0) {
    selectedClipId.value = newIds[0] ?? null
  }
  return newIds
}

function rippleDeleteSelected(acrossTracks = false): boolean {
  const id = selectedClipId.value
  if (!id || !currentProject.value) return false
  for (const track of currentProject.value.timeline.tracks) {
    const item = track.items?.find(i => i.id === id)
    if (item) {
      if (track.locked) return false
      break
    }
  }
  const shifted = applyV3Edit(v3 => rippleDelete(v3, id, { acrossTracks }))
  if (shifted === null || shifted === undefined) return false
  selectedClipId.value = null
  return true
}

function snapTimeSec(
  targetSec: number,
  playheadSec: number,
  options?: { ignoreIds?: string[], thresholdSec?: number }
): number {
  const tracks = currentProject.value?.timeline?.tracks
  if (!tracks) return targetSec
  const v3 = v1TracksToV3(tracks)
  // Roadmap B5: real markers join the snap candidates — core snapTime
  // reads timeline.markers, but v1TracksToV3 always starts it empty.
  v3.markers = ensureMarkers()
  return ticksToSec(snapTime(v3, Math.round(secToTicks(targetSec)), {
    playheadTicks: Math.round(secToTicks(playheadSec)),
    ignoreIds: options?.ignoreIds,
    thresholdTicks: options?.thresholdSec !== undefined
      ? Math.round(secToTicks(options.thresholdSec))
      : undefined
  }))
}

// ---- Ruler markers (roadmap B5) ----
// Core marker ops mutate a timeline's `markers` array in place. The app
// wraps them with pushHistory + saveProject itself (applyV3Edit only
// bridges TRACKS between the v1 project model and the v3 DSL) and hands
// core a minimal { markers } shim — the array reference is shared with
// project state, so changes show up in the UI immediately.
function ensureMarkers(): TmcutMarker[] {
  const timeline = currentProject.value?.timeline
  if (!timeline) return []
  if (!Array.isArray(timeline.markers)) timeline.markers = []
  return timeline.markers
}

function markerShim(): TmcutTimeline {
  return { version: 3, tracks: [], markers: ensureMarkers() }
}

/** Reactive view of the project's ruler markers (empty array when none. */
const timelineMarkers = computed<TmcutMarker[]>(() => ensureMarkers())

/** Drop a marker at the given timeline position (seconds). */
function addMarkerAt(timeSec: number): boolean {
  if (!currentProject.value) return false
  ensureMarkers()
  pushHistory()
  addMarker(markerShim(), Math.max(0, Math.round(secToTicks(timeSec))))
  saveProject()
  return true
}

/** Rename / recolor a marker. Returns false when the id is unknown. */
function updateMarker(markerId: string, patch: { label?: string, color?: string }): boolean {
  const marker = ensureMarkers().find(m => m.id === markerId)
  if (!marker) return false
  pushHistory()
  if (patch.label !== undefined) marker.label = patch.label
  if (patch.color !== undefined) marker.color = patch.color
  saveProject()
  return true
}

/** Delete a marker by id. Returns false when the id is unknown. */
function removeMarkerById(markerId: string): boolean {
  if (!ensureMarkers().some(m => m.id === markerId)) return false
  pushHistory()
  const removed = removeMarker(markerShim(), markerId)
  saveProject()
  return removed
}

// ===== Transitions (roadmap B3 / core C5) =====
// `transitionIn.duration` is stored in TICKS inside the v1 seconds model —
// the v1compat bridge passes the field through untouched (like keyframes).
// Applying shifts the clip left so its head overlaps the neighbor's tail;
// clearing restores the original cut. Validation always runs BEFORE the
// history push so a refused request leaves no stray undo entry.

/** Read-only transition validation for the clip context menu. */
function checkClipTransition(clipId: string, type: string, durationSec: number): { ok: boolean, reason?: string } {
  const tracks = currentProject.value?.timeline?.tracks
  if (!tracks) return { ok: false, reason: 'no-neighbor' }
  const check = canApplyTransition(v1TracksToV3(tracks), clipId, type, Math.round(secToTicks(durationSec)))
  return check.ok ? { ok: true } : { ok: false, reason: check.reason ?? 'no-neighbor' }
}

/** Apply a transition (core C5) — one undo entry per successful call. */
function applyClipTransition(clipId: string, type: string, durationSec: number): { ok: boolean, reason?: string } {
  const check = checkClipTransition(clipId, type, durationSec)
  if (!check.ok) return check
  const ticks = Math.round(secToTicks(durationSec))
  const applied = applyV3Edit(v3 => applyTransition(v3, clipId, type, ticks))
  return applied === true ? { ok: true } : { ok: false, reason: 'no-neighbor' }
}

/** Remove a transition and restore the original cut position. */
function clearClipTransition(clipId: string): boolean {
  const tracks = currentProject.value?.timeline?.tracks
  if (!tracks) return false
  // Probe on a throwaway conversion first — a refusal pushes no history.
  if (!clearTransition(v1TracksToV3(tracks), clipId)) return false
  return applyV3Edit(v3 => clearTransition(v3, clipId)) === true
}

/** Clips carrying a transition — drives the export honesty badge. */
const timelineTransitionCount = computed(() => {
  const tracks = currentProject.value?.timeline?.tracks
  if (!tracks) return 0
  let count = 0
  for (const track of tracks) {
    for (const item of track.items || []) {
      if ((item.transitionIn?.duration ?? 0) > 0) count++
    }
  }
  return count
})

// Re-point all clips that reference an old media path (media relink)
function updateClipsSrc(oldSrc: string, newSrc: string): number {
  if (!currentProject.value?.timeline?.tracks) return 0
  const oldKey = normalizePath(oldSrc)
  let count = 0
  for (const track of currentProject.value.timeline.tracks) {
    for (const item of track.items || []) {
      if (item.src && normalizePath(item.src) === oldKey) {
        item.src = newSrc
        count++
      }
    }
  }
  if (count > 0) {
    saveProject()
  }
  return count
}

// Split clip at timeline splitTime (in seconds)
function splitClip(clipId: string, splitTime: number): boolean {
  if (!currentProject.value?.timeline?.tracks) return false

  for (const track of currentProject.value.timeline.tracks) {
    const idx = track.items?.findIndex(i => i.id === clipId)
    if (idx === undefined || idx === -1) continue

    const clip = track.items[idx]!
    const speed = clip.speed || 1
    const clipStart = clip.offset
    const clipDuration = (clip.out - clip.in) / speed
    const clipEnd = clipStart + clipDuration

    // Ensure split time is within clip boundaries (leave at least 0.1s margin)
    if (splitTime <= clipStart + 0.1 || splitTime >= clipEnd - 0.1) {
      return false
    }

    const elapsedOnTimeline = splitTime - clipStart
    const splitSourceTime = clip.in + elapsedOnTimeline * speed

    pushHistory()
    // First piece: keep original in, adjust out
    const originalOut = clip.out
    clip.out = splitSourceTime

    // Second piece: starts at splitSourceTime, ends at originalOut, offset at splitTime
    const secondClip: TmcutTimelineItem = {
      ...JSON.parse(JSON.stringify(clip)),
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      in: splitSourceTime,
      out: originalOut,
      offset: splitTime
    }
    // The tail's incoming neighbor changed (roadmap B3): the inherited
    // transition only ever described the ORIGINAL pair (the first half
    // keeps it — its start still touches the previous clip).
    delete secondClip.transitionIn

    track.items.splice(idx + 1, 0, secondClip)
    selectedClipId.value = secondClip.id
    saveProject()
    return true
  }

  return false
}

// Keyboard trim (roadmap B7): cut the selected clip's in/out edge to a
// timeline position (seconds) via the core trimClip through the v1↔v3
// bridge. The playhead must sit INSIDE the clip with the same 0.1s
// margin splitClip uses, so the core never has to clamp the source
// boundary and no over-extension past the source can happen.
function trimSelectedEdgeAt(edge: 'in' | 'out', timeSec: number): boolean {
  const id = selectedClipId.value
  const tracks = currentProject.value?.timeline?.tracks
  if (!id || !tracks) return false
  for (const track of tracks) {
    const clip = track.items?.find(i => i.id === id)
    if (!clip) continue
    if (track.locked) return false
    const speed = clip.speed || 1
    const start = clip.offset
    const end = start + (clip.out - clip.in) / speed
    if (timeSec <= start + 0.1 || timeSec >= end - 0.1) return false
    const sourceTicks = Math.round(secToTicks(clip.in + (timeSec - start) * speed))
    return applyV3Edit(v3 => trimClip(v3, id, edge, sourceTicks)) === true
  }
  return false
}

// ---- Groups & linked pairs (roadmap B4, core C9) ----
// The app selection is single-clip, so both operations work on the
// EXPANDED selection (the clip plus its group/link relatives).

/** Unlocked members of the expanded selection (core also skips locks). */
function expandedUnlockedIds(): string[] {
  const wanted = new Set(expandedSelectionIds())
  const ids: string[] = []
  for (const track of currentProject.value?.timeline?.tracks || []) {
    if (track.locked) continue
    for (const item of track.items || []) {
      if (wanted.has(item.id)) ids.push(item.id)
    }
  }
  return ids
}

/** Group the expanded selection (Ctrl+G). False when it cannot reach 2. */
function groupSelection(): boolean {
  const ids = expandedUnlockedIds()
  if (ids.length < 2) return false
  return typeof applyV3Edit(v3 => groupClips(v3, ids)) === 'string'
}

/** Dissolve the group of the expanded selection (Ctrl+Shift+G). */
function ungroupSelection(): boolean {
  const tracks = currentProject.value?.timeline?.tracks
  const ids = expandedUnlockedIds()
  if (!tracks || ids.length === 0) return false
  const hasGroup = tracks.some(track => !track.locked
    && (track.items || []).some(item => ids.includes(item.id) && item.groupId))
  if (!hasGroup) return false
  return (applyV3Edit(v3 => ungroupClips(v3, ids)) ?? 0) > 0
}

/**
 * Link / unlink the selected clip to every clip overlapping it in time
 * on other tracks (Ctrl+L toggles). Returns 'linked' | 'unlinked' |
 * 'none' (nothing overlapping or selection locked) for honest toasts.
 */
function toggleLinkSelection(): 'linked' | 'unlinked' | 'none' {
  const tracks = currentProject.value?.timeline?.tracks
  const id = selectedClipId.value
  if (!tracks || !id) return 'none'
  let clip: TmcutTimelineItem | undefined
  let locked = false
  for (const track of tracks) {
    const item = track.items?.find(i => i.id === id)
    if (item) {
      clip = item
      locked = !!track.locked
      break
    }
  }
  if (!clip || locked) return 'none'
  const start = clip.offset || 0
  const end = start + (clip.out - clip.in) / (clip.speed || 1)
  const overlaps: TmcutTimelineItem[] = []
  for (const track of tracks) {
    if (track.locked) continue
    for (const item of track.items || []) {
      if (item.id === id) continue
      const itemStart = item.offset || 0
      const itemEnd = itemStart + (item.out - item.in) / (item.speed || 1)
      if (itemStart < end && itemEnd > start) overlaps.push(item)
    }
  }
  if (overlaps.length === 0) return 'none'
  // Toggle: when the clip and every overlap already share one linkId,
  // Ctrl+L breaks the pair instead of minting a new link.
  const current = clip.linkId
  if (current && overlaps.every(o => o.linkId === current)) {
    pushHistory()
    clip.linkId = null
    for (const overlap of overlaps) overlap.linkId = null
    saveProject()
    return 'unlinked'
  }
  pushHistory()
  const linkId = `link_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  clip.linkId = linkId
  for (const overlap of overlaps) overlap.linkId = linkId
  saveProject()
  return 'linked'
}

/**
 * Relative offsets (id → offset) of the expanded selection WITHOUT the
 * given clip — the drag handler carries them along so grouped/linked
 * clips travel together (roadmap B4). Locked tracks are excluded.
 */
function relatedOffsetsFor(clipId: string): Record<string, number> {
  const wanted = new Set(expandedSelectionIds())
  wanted.delete(clipId)
  const out: Record<string, number> = {}
  for (const track of currentProject.value?.timeline?.tracks || []) {
    if (track.locked) continue
    for (const item of track.items || []) {
      if (wanted.has(item.id)) out[item.id] = item.offset || 0
    }
  }
  return out
}

// ===== Canvas Engine (Phase 2) =====

// Switch canvas ratio: keeps timeline intact, re-frames manual offsets proportionally
function switchCanvas(width: number, height: number) {
  const project = currentProject.value
  if (!project || !width || !height) return
  const fromW = project.canvas?.width || 1920
  const fromH = project.canvas?.height || 1080
  project.canvas = normalizeCanvas({
    width,
    height,
    fps: project.canvas?.fps || 30,
    background: project.canvas?.background
  })
  for (const track of project.timeline?.tracks || []) {
    for (const item of track.items || []) {
      const rt = reframeTransform(item.x, item.y, fromW, fromH, width, height)
      item.x = rt.x
      item.y = rt.y
    }
  }
  saveProject()
}

function setCanvasBackground(type: 'color' | 'image' | 'transparent', value?: string) {
  const project = currentProject.value
  if (!project) return
  project.canvas = normalizeCanvas({ ...project.canvas, background: { type, value } })
  saveProject()
}

// Duplicate the current project as another canvas ratio (reframe)
function duplicateAsProject(presetId: string): TmcutProject | null {
  const project = currentProject.value
  const preset = findCanvasPreset(presetId)
  if (!project || !preset) return null

  const clone: TmcutProject = JSON.parse(JSON.stringify(project))
  clone.id = Math.random().toString(36).slice(2, 10)
  clone.name = `${project.name} (${preset.id})`
  clone.created_at = new Date().toISOString()
  clone.updated_at = new Date().toISOString()

  const fromW = project.canvas?.width || 1920
  const fromH = project.canvas?.height || 1080
  clone.canvas = normalizeCanvas({
    width: preset.width,
    height: preset.height,
    fps: project.canvas?.fps || 30,
    background: project.canvas?.background
  })
  for (const track of clone.timeline?.tracks || []) {
    for (const item of track.items || []) {
      const rt = reframeTransform(item.x, item.y, fromW, fromH, preset.width, preset.height)
      item.x = rt.x
      item.y = rt.y
    }
  }

  currentProject.value = clone
  projects.value.unshift(clone)
  saveProject()
  return clone
}

// ===== Undo / Redo history (timeline + canvas snapshots) =====

const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const HISTORY_LIMIT = 50

function historySnapshot(): string {
  return JSON.stringify({
    timeline: currentProject.value?.timeline,
    canvas: currentProject.value?.canvas
  })
}

// Capture state BEFORE a mutation so it can be restored with undo().
// Call at drag/trim gesture start and inside discrete ops (add/remove/split).
function pushHistory() {
  if (!currentProject.value) return
  undoStack.value.push(historySnapshot())
  if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
  redoStack.value = []
}

// Undo coalescing (roadmap B8 — the snapshot-stack twin of core C15):
// consecutive edits of the SAME target inside a short burst become ONE
// undo entry, so typing a text or dragging a slider undoes as a whole.
// Snapshots hold full state, so merging only means "do not push again" —
// the top entry already captures the state from before the burst.
const HISTORY_COALESCE_MS = 800
let lastCoalesce: { key: string, at: number } | null = null

function pushHistoryCoalesced(key: string) {
  const now = Date.now()
  if (lastCoalesce && lastCoalesce.key === key && now - lastCoalesce.at < HISTORY_COALESCE_MS) {
    lastCoalesce.at = now
    redoStack.value = [] // a fresh edit invalidates redo, like pushHistory
    return
  }
  pushHistory()
  lastCoalesce = { key, at: now }
}

const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

function restoreHistorySnapshot(raw: string) {
  if (!currentProject.value) return
  // Restoring breaks any edit burst — the next edit starts fresh.
  lastCoalesce = null
  try {
    const parsed = JSON.parse(raw) as { timeline?: TmcutProjectTimeline, canvas?: TmcutCanvas }
    if (parsed.timeline) currentProject.value.timeline = parsed.timeline
    if (parsed.canvas) currentProject.value.canvas = parsed.canvas
    selectedClipId.value = null
    saveProject()
  } catch (error) {
    console.error('Failed to restore history snapshot:', error)
  }
}

function undo() {
  if (!currentProject.value || undoStack.value.length === 0) return
  redoStack.value.push(historySnapshot())
  const prev = undoStack.value.pop()!
  restoreHistorySnapshot(prev)
}

function redo() {
  if (!currentProject.value || redoStack.value.length === 0) return
  undoStack.value.push(historySnapshot())
  const next = redoStack.value.pop()!
  restoreHistorySnapshot(next)
}

// Track-level flags (CapCut-style eye / lock / mute per track)
function updateTrack(trackId: string, patch: Partial<TmcutTrack>) {
  if (!currentProject.value?.timeline?.tracks) return
  const track = currentProject.value.timeline.tracks.find(t => t.id === trackId)
  if (!track) return
  Object.assign(track, patch)
  saveProject()
}

function toggleTrackMute(trackId: string) {
  const track = currentProject.value?.timeline?.tracks.find(t => t.id === trackId)
  if (!track) return
  updateTrack(trackId, { muted: !track.muted })
}

function toggleTrackLock(trackId: string) {
  const track = currentProject.value?.timeline?.tracks.find(t => t.id === trackId)
  if (!track) return
  updateTrack(trackId, { locked: !track.locked })
}

function toggleTrackHidden(trackId: string) {
  const track = currentProject.value?.timeline?.tracks.find(t => t.id === trackId)
  if (!track) return
  updateTrack(trackId, { hidden: !track.hidden })
}

// Track add/remove (Roadmap A5): routed through applyV3Edit so history,
// undo and autosave see the change; syncV3Result keeps the v1 track list
// in step (creates on add, prunes on remove).
function addTrackToProject(trackType: 'video' | 'text' | 'audio'): boolean {
  return applyV3Edit(v3 => addTrack(v3, trackType)) !== null
}

function removeTrackFromProject(trackId: string): boolean {
  const track = currentProject.value?.timeline?.tracks.find(t => t.id === trackId)
  // Locked tracks refuse removal (core does the same; checked here too so
  // no history entry or save is pushed for a refused operation).
  if (!track || track.locked) return false
  const removedIds = new Set((track.items || []).map(item => item.id))
  const ok = applyV3Edit(v3 => removeTrack(v3, trackId)) === true
  if (ok && selectedClipId.value && removedIds.has(selectedClipId.value)) {
    selectedClipId.value = null
  }
  return ok
}

// Autosave
let autosaveTimeout: ReturnType<typeof setTimeout> | null = null
function setupAutosave() {
  if (autosaveTimeout) clearTimeout(autosaveTimeout)

  autosaveTimeout = setTimeout(() => {
    autosaveTimeout = null
    saveProject()
  }, 3000)
}

// ===== Snapshots =====

async function loadSnapshots() {
  const ipc = tmcutIpc()
  const project = currentProject.value
  if (!ipc || !project || import.meta.server) {
    snapshots.value = []
    return
  }
  try {
    snapshots.value = await ipc.listSnapshots(project.id)
  } catch (error) {
    console.error('Failed to list snapshots:', error)
    snapshots.value = []
  }
}

async function createSnapshot(name?: string) {
  const ipc = tmcutIpc()
  const project = currentProject.value
  if (!ipc || !project || import.meta.server) return
  saveProject()
  try {
    // Plain copy for IPC structured clone (reactive proxies fail)
    const plain = JSON.parse(JSON.stringify(project)) as TmcutProject
    await ipc.saveSnapshot({ id: project.id, data: plain, name })
    await loadSnapshots()
  } catch (error) {
    console.error('Failed to save snapshot:', error)
  }
}

async function restoreSnapshot(ts: number) {
  const ipc = tmcutIpc()
  const project = currentProject.value
  if (!ipc || !project || import.meta.server) return
  try {
    const data = (await ipc.readSnapshot({ id: project.id, ts })) as TmcutProject | null
    if (!data?.id) return
    currentProject.value = data
    applyProjectMigration(data)
    syncProjectIndex(data)
    saveProject()
  } catch (error) {
    console.error('Failed to restore snapshot:', error)
  }
}

async function deleteSnapshot(ts: number) {
  const ipc = tmcutIpc()
  const project = currentProject.value
  if (!ipc || !project || import.meta.server) return
  try {
    await ipc.deleteSnapshot({ id: project.id, ts })
    await loadSnapshots()
  } catch (error) {
    console.error('Failed to delete snapshot:', error)
  }
}

// Initialize from localStorage on module load
function init() {
  if (import.meta.server) return
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('tmcut_project_') || key.startsWith('vc_project_'))) {
        try {
          const project = JSON.parse(localStorage.getItem(key) || '{}')
          if (project.id && !projects.value.some(p => p.id === project.id)) {
            projects.value.unshift(project)
          }
        } catch (e) {
          console.error(`Failed to parse project ${key}:`, e)
        }
      }
    }
  } catch (e) {
    console.error('LocalStorage not available:', e)
  }
}

// Export composable
export function useTmcutProject() {
  init()
  return {
    currentProject,
    projects,
    isLoading,
    selectedClipId,
    selectedClip,
    totalDuration,
    hasTimelineClips,
    saveStatus,
    lastSavedAt,
    pendingRecovery,
    snapshots,
    loadProject,
    saveProject,
    createProject,
    deleteProject,
    renameProject,
    duplicateProject,
    selectClip,
    addClipToTrack,
    updateClip,
    removeClip,
    splitClip,
    closeProjectGaps,
    pushHistory,
    pushHistoryCoalesced,
    undo,
    redo,
    canUndo,
    canRedo,
    clipboard,
    rippleMode,
    copySelectedClips,
    pasteClipboardAt,
    duplicateSelectedClips,
    rippleDeleteSelected,
    snapTimeSec,
    timelineMarkers,
    addMarkerAt,
    updateMarker,
    removeMarkerById,
    checkClipTransition,
    applyClipTransition,
    clearClipTransition,
    timelineTransitionCount,
    flushDiskSave,
    updateTrack,
    toggleTrackMute,
    toggleTrackLock,
    toggleTrackHidden,
    addTrackToProject,
    removeTrackFromProject,
    updateClipsSrc,
    trimSelectedEdgeAt,
    groupSelection,
    ungroupSelection,
    toggleLinkSelection,
    relatedOffsetsFor,
    switchCanvas,
    setCanvasBackground,
    duplicateAsProject,
    setupAutosave,
    persistProjectToDisk,
    refreshProjects,
    applyRecovery,
    dismissRecovery,
    loadSnapshots,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot
  }
}
