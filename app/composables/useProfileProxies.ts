import { ref } from 'vue'
import type { ProfileProxy } from '~/types'

export function useProfileProxies() {
  const proxies = ref<ProfileProxy[]>([])
  const loading = ref(false)
  const testingProxyId = ref<string | null>(null)
  const toast = useToast()
  const { t } = useI18n()

  async function fetchProxies() {
    if (!window.electronAPI?.tools?.profiles) return
    loading.value = true
    try {
      const res = await window.electronAPI.tools.profiles.listProxies()
      if (res.success && res.data) {
        proxies.value = res.data
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  async function saveProxy(proxy: Partial<ProfileProxy>) {
    if (!window.electronAPI?.tools?.profiles) return false
    try {
      const res = await window.electronAPI.tools.profiles.saveProxy(proxy)
      if (res.success) {
        await fetchProxies()
        return true
      }
      throw new Error(res.error || 'Failed to save proxy')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
      return false
    }
  }

  async function deleteProxy(id: string) {
    if (!window.electronAPI?.tools?.profiles) return false
    try {
      const res = await window.electronAPI.tools.profiles.deleteProxy(id)
      if (res.success) {
        await fetchProxies()
        return true
      }
      throw new Error(res.error || 'Failed to delete proxy')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
      return false
    }
  }

  async function batchDelete(ids: string[]) {
    if (!window.electronAPI?.tools?.profiles || ids.length === 0) return false
    try {
      const res = await window.electronAPI.tools.profiles.deleteProxy(ids.join(','))
      if (res.success) {
        await fetchProxies()
        return true
      }
      throw new Error(res.error || 'Failed to delete proxies')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.add({ title: t('global.error'), description: message, color: 'error' })
      return false
    }
  }

  async function checkProxy(proxy: Partial<ProfileProxy>) {
    if (!window.electronAPI?.tools?.profiles) return null
    if (proxy.id) testingProxyId.value = proxy.id
    try {
      const res = await window.electronAPI.tools.profiles.checkProxy(proxy)
      if (res.success && res.data) {
        // If it was an existing proxy, update its status in the list
        if (proxy.id) {
          await window.electronAPI.tools.profiles.saveProxy({
            ...proxy,
            id: proxy.id,
            status: res.data.status,
            ip: res.data.ip,
            latency_ms: res.data.latency_ms,
            last_checked_at: new Date().toISOString()
          })
          await fetchProxies()
        }
        return res.data
      }
      return { status: 'dead', error: res.error }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { status: 'dead', error: message }
    } finally {
      testingProxyId.value = null
    }
  }

  return {
    proxies,
    loading,
    testingProxyId,
    fetchProxies,
    saveProxy,
    deleteProxy,
    batchDelete,
    checkProxy
  }
}
