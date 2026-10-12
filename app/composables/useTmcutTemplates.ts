import type {
  TmcutTemplate,
  TmcutTemplateCategory
} from '~/types/tmcut'
import {
  getBuiltinTemplates,
  instantiateTemplate,
  filterTemplates,
  createTemplateFromTimeline,
  validateTemplate,
  TICKS_PER_SECOND
} from '@tmcut-core'
import { normalizeCanvas, canvasFpsValue } from '~/utils/tmcut/canvas'

const USER_TEMPLATES_STORAGE_KEY = 'tmcut_user_templates_v1'

// Shared reactive state
const userTemplates = ref<TmcutTemplate[]>([])
const selectedCategory = ref<string>('all')
const selectedAspectRatio = ref<string>('all')
const searchQuery = ref<string>('')
const isLoaded = ref<boolean>(false)

export function useTmcutTemplates() {
  const { createProject, saveProject, currentProject } = useTmcutProject()

  function loadUserTemplates() {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(USER_TEMPLATES_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          userTemplates.value = parsed
        }
      }
    } catch (e) {
      console.warn('[useTmcutTemplates] Failed to parse user templates from localStorage', e)
    } finally {
      isLoaded.value = true
    }
  }

  function persistUserTemplates() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(USER_TEMPLATES_STORAGE_KEY, JSON.stringify(userTemplates.value))
    } catch (e) {
      console.warn('[useTmcutTemplates] Failed to save user templates to localStorage', e)
    }
  }

  // Load once on client mount
  if (typeof window !== 'undefined' && !isLoaded.value) {
    loadUserTemplates()
  }

  const builtinList = computed<TmcutTemplate[]>(() => {
    return getBuiltinTemplates()
  })

  const allTemplates = computed<TmcutTemplate[]>(() => {
    return [...builtinList.value, ...userTemplates.value]
  })

  const filteredTemplates = computed<TmcutTemplate[]>(() => {
    return filterTemplates(allTemplates.value, {
      category: selectedCategory.value,
      aspectRatio: selectedAspectRatio.value,
      search: searchQuery.value
    })
  })

  const categoryCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = { all: allTemplates.value.length, custom: userTemplates.value.length }
    for (const t of allTemplates.value) {
      counts[t.category] = (counts[t.category] || 0) + 1
    }
    return counts
  })

  /**
   * Instantiates a template into a brand new project and saves it.
   */
  async function createProjectFromTemplate(
    template: TmcutTemplate,
    options: {
      projectName?: string
      replacements?: Record<string, { src?: string, text?: string, name?: string }>
    } = {}
  ) {
    const instantiated = instantiateTemplate(template, {
      replacements: options.replacements
    })

    const name = options.projectName?.trim() || `${template.name} - Project`
    const proj = createProject(name)

    // Set canvas
    proj.canvas = normalizeCanvas({
      width: instantiated.canvas.width,
      height: instantiated.canvas.height,
      fps: instantiated.canvas.fps
    })

    // Set timeline items and duration
    proj.timeline = {
      version: 1,
      tracks: instantiated.timeline.tracks,
      durationMs: instantiated.durationMs,
      markers: instantiated.timeline.markers || []
    }
    proj.durationMs = instantiated.durationMs
    saveProject()
    return proj
  }

  /**
   * Saves current timeline as a user-defined template.
   */
  function saveCurrentProjectAsTemplate(meta: {
    name: string
    description?: string
    category?: TmcutTemplateCategory
    aspectRatio?: '9:16' | '16:9' | '1:1'
  }): TmcutTemplate | null {
    if (!currentProject.value) return null

    const aspect = meta.aspectRatio || (
      currentProject.value.canvas.height > currentProject.value.canvas.width
        ? '9:16'
        : currentProject.value.canvas.width === currentProject.value.canvas.height
          ? '1:1'
          : '16:9'
    )

    const rawTpl = createTemplateFromTimeline(currentProject.value.timeline, {
      name: meta.name,
      description: meta.description || '',
      category: meta.category || 'custom',
      aspectRatio: aspect,
      canvas: {
        width: currentProject.value.canvas.width,
        height: currentProject.value.canvas.height,
        fps: canvasFpsValue(currentProject.value.canvas)
      }
    })

    const validation = validateTemplate(rawTpl)
    if (!validation.valid) {
      console.error('[useTmcutTemplates] Invalid template generated', validation.errors)
      return null
    }

    const tpl = (rawTpl as unknown) as TmcutTemplate
    userTemplates.value.unshift(tpl)
    persistUserTemplates()
    return tpl
  }

  /**
   * Deletes a user template by ID.
   */
  function deleteUserTemplate(id: string): boolean {
    const initialLen = userTemplates.value.length
    userTemplates.value = userTemplates.value.filter(t => t.id !== id)
    if (userTemplates.value.length !== initialLen) {
      persistUserTemplates()
      return true
    }
    return false
  }

  return {
    allTemplates,
    userTemplates,
    filteredTemplates,
    categoryCounts,
    selectedCategory,
    selectedAspectRatio,
    searchQuery,
    createProjectFromTemplate,
    saveCurrentProjectAsTemplate,
    deleteUserTemplate,
    ticksToSeconds: (ticks: number) => (ticks / TICKS_PER_SECOND).toFixed(1)
  }
}
