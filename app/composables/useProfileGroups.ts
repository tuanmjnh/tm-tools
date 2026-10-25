import { ref } from 'vue'
import type { ProfileGroup } from '#shared/types/electron'

export function useProfileGroups() {
  const groups = ref<ProfileGroup[]>([])
  const loading = ref(false)
  const toast = useToast()
  const { t } = useI18n()

  async function fetchGroups() {
    if (!window.electronAPI?.tools?.profiles) return
    loading.value = true
    try {
      const res = await window.electronAPI.tools.profiles.listGroups()
      if (res.success && res.data) {
        groups.value = res.data
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  async function saveGroup(group: Partial<ProfileGroup>) {
    if (!window.electronAPI?.tools?.profiles) return false
    try {
      const res = await window.electronAPI.tools.profiles.saveGroup(group)
      if (res.success) {
        await fetchGroups()
        return true
      }
      throw new Error(res.error || 'Failed to save group')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
      return false
    }
  }

  async function deleteGroup(id: string) {
    if (!window.electronAPI?.tools?.profiles) return false
    try {
      const res = await window.electronAPI.tools.profiles.deleteGroup(id)
      if (res.success) {
        await fetchGroups()
        return true
      }
      throw new Error(res.error || 'Failed to delete group')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
      return false
    }
  }

  async function batchDelete(ids: string[]) {
    if (!window.electronAPI?.tools?.profiles || ids.length === 0) return false
    try {
      const res = await window.electronAPI.tools.profiles.deleteGroup(ids.join(','))
      if (res.success) {
        await fetchGroups()
        return true
      }
      throw new Error(res.error || 'Failed to delete groups')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
      return false
    }
  }

  return {
    groups,
    loading,
    fetchGroups,
    saveGroup,
    deleteGroup,
    batchDelete
  }
}
