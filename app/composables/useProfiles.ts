import { ref, onMounted, onUnmounted } from 'vue'
import type { BrowserProfile, ProfileFilters } from '~/types'

export function useProfiles() {
  const profiles = ref<BrowserProfile[]>([])
  const loading = ref(false)
  const total = ref(0)
  const selected = ref<BrowserProfile[]>([])

  const search = ref('')
  const groupId = ref('all')
  const statusFilter = ref('all')
  const limit = ref(50)
  const offset = ref(0)

  const toast = useToast()
  const { t } = useI18n()

  let unlistenStatus: (() => void) | null = null

  async function fetchProfiles(reset = false) {
    if (!window.electronAPI?.tools?.profiles) return
    if (reset) {
      offset.value = 0
    }
    loading.value = true
    try {
      const filters: ProfileFilters = {
        groupId: (groupId.value && groupId.value !== 'all') ? groupId.value : undefined,
        search: search.value.trim() || undefined,
        status: (statusFilter.value && statusFilter.value !== 'all') ? statusFilter.value : undefined,
        limit: limit.value,
        offset: offset.value
      }

      const res = await window.electronAPI.tools.profiles.listProfiles(filters)
      if (res.success && res.data) {
        profiles.value = res.data.items
        total.value = res.data.total
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  async function launchProfile(id: string) {
    if (!window.electronAPI?.tools?.profiles) return
    try {
      const res = await window.electronAPI.tools.profiles.launchBrowser({ profileId: id })
      if (res.success) {
        toast.add({ title: t('profiles.profileLaunched'), color: 'success' })
        // Optimistic update
        const item = profiles.value.find(p => p.id === id)
        if (item) {
          item.isRunning = true
          item.last_launched_at = new Date().toISOString()
        }
      } else {
        toast.add({ title: t('global.error'), description: res.error, color: 'error' })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
    }
  }

  async function stopProfile(id: string) {
    if (!window.electronAPI?.tools?.profiles) return
    try {
      const res = await window.electronAPI.tools.profiles.stopBrowser(id)
      if (res.success) {
        toast.add({ title: t('profiles.profileStopped'), color: 'info' })
        const item = profiles.value.find(p => p.id === id)
        if (item) item.isRunning = false
      } else {
        toast.add({ title: t('global.error'), description: res.error, color: 'error' })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
    }
  }

  async function cloneProfile(id: string, newName?: string) {
    if (!window.electronAPI?.tools?.profiles) return false
    try {
      const res = await window.electronAPI.tools.profiles.cloneProfile({ id, newName })
      if (res.success) {
        toast.add({ title: t('global.success'), description: t('profiles.profileSaved'), color: 'success' })
        await fetchProfiles()
        return true
      }
      throw new Error(res.error || 'Failed to clone profile')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
      return false
    }
  }

  async function deleteProfile(id: string) {
    if (!window.electronAPI?.tools?.profiles) return false
    try {
      const res = await window.electronAPI.tools.profiles.deleteProfiles(id)
      if (res.success) {
        toast.add({ title: t('profiles.profileDeleted'), color: 'success' })
        selected.value = selected.value.filter(p => p.id !== id)
        await fetchProfiles()
        return true
      }
      throw new Error(res.error || 'Failed to delete profile')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
      return false
    }
  }

  async function batchDelete(ids?: string[]) {
    const targetIds = ids || selected.value.map(p => p.id)
    if (targetIds.length === 0) return false
    if (!window.electronAPI?.tools?.profiles) return false
    try {
      const res = await window.electronAPI.tools.profiles.deleteProfiles(targetIds)
      if (res.success) {
        toast.add({ title: t('profiles.profilesDeleted'), color: 'success' })
        selected.value = []
        await fetchProfiles()
        return true
      }
      throw new Error(res.error || 'Failed to batch delete profiles')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
      return false
    }
  }

  async function openFolder(id: string) {
    if (!window.electronAPI?.tools?.profiles) return
    try {
      await window.electronAPI.tools.profiles.openProfileFolder(id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
    }
  }

  async function clearCache(id: string) {
    if (!window.electronAPI?.tools?.profiles) return
    try {
      const res = await window.electronAPI.tools.profiles.clearProfileCache(id)
      if (res.success) {
        toast.add({ title: t('profiles.cacheCleared'), color: 'success' })
      } else {
        toast.add({ title: t('global.error'), description: res.error, color: 'error' })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
    }
  }

  onMounted(() => {
    if (window.electronAPI?.tools?.profiles?.onStatusChanged) {
      unlistenStatus = window.electronAPI.tools.profiles.onStatusChanged((payload) => {
        const item = profiles.value.find(p => p.id === payload.profileId)
        if (item) {
          item.isRunning = payload.isRunning
          if (payload.pid) item.runningPid = payload.pid
        }
      })
    }
  })

  onUnmounted(() => {
    if (unlistenStatus) unlistenStatus()
  })

  return {
    profiles,
    loading,
    total,
    selected,
    search,
    groupId,
    statusFilter,
    limit,
    offset,
    fetchProfiles,
    launchProfile,
    stopProfile,
    cloneProfile,
    deleteProfile,
    batchDelete,
    openFolder,
    clearCache
  }
}
