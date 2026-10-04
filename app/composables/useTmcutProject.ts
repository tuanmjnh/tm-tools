import type { TmcutCanvas, TmcutCropRect, TmcutFitMode } from '~/types/tmcut'
import { findCanvasPreset, normalizeCanvas, reframeTransform } from '~/utils/tmcut/canvas'
import { decideRecovery } from '~/utils/tmcut/recovery'

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
  keyframes?: Array<{ t: number, prop: string, value: number }>
  transitionIn?: { type: string, duration: number }
}

export interface TmcutTrack {
  id: string
  type: 'video' | 'text' | 'audio'
  name?: string
  muted?: boolean
  locked?: boolean
  items: TmcutTimelineItem[]
}

export interface TmcutProjectTimeline {
  version: number
  tracks: TmcutTrack[]
  durationMs: number
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
      durationMs: 0
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
}

function ensureDefaultTracks(project: TmcutProject) {
  if (!project.timeline) {
    project.timeline = { version: 1, tracks: [], durationMs: 0 }
  }
  if (!project.timeline.tracks) {
    project.timeline.tracks = []
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

// ===== Disk persistence (Electron IPC, localStorage mirror) =====

async function persistProjectToDisk() {
  const project = currentProject.value
  const ipc = tmcutIpc()
  if (!project || !ipc || import.meta.server) return
  saveStatus.value = 'saving'
  try {
    project.updated_at = new Date().toISOString()
    await ipc.writeProject({ id: project.id, data: project })
    await ipc.writeRecovery({ id: project.id, data: project })
    saveStatus.value = 'saved'
    lastSavedAt.value = project.updated_at
  } catch (error) {
    console.error('Failed to persist project to disk:', error)
    saveStatus.value = 'error'
  }
}

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
function addClipToTrack(trackType: 'video' | 'text' | 'audio', partialItem: Partial<TmcutTimelineItem>) {
  if (!currentProject.value) return null
  ensureDefaultTracks(currentProject.value)

  let track = currentProject.value.timeline.tracks.find(t => t.type === trackType)
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

  track.items.push(newItem)
  selectedClipId.value = newItem.id
  saveProject()
  return newItem
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
      track.items.splice(idx, 1)
      if (selectedClipId.value === clipId) {
        selectedClipId.value = null
      }
      saveProject()
      return
    }
  }
}

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

    track.items.splice(idx + 1, 0, secondClip)
    selectedClipId.value = secondClip.id
    saveProject()
    return true
  }

  return false
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
    await ipc.saveSnapshot({ id: project.id, data: project, name })
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
    saveStatus,
    lastSavedAt,
    pendingRecovery,
    snapshots,
    loadProject,
    saveProject,
    createProject,
    deleteProject,
    selectClip,
    addClipToTrack,
    updateClip,
    removeClip,
    splitClip,
    updateClipsSrc,
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
