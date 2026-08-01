import type { AuthUser } from '~/types/auth'

export const useUsers = () => {
  const users = ref<AuthUser[]>([])
  const cursor = ref<string | null>(null)
  const canLoadMore = ref(true)
  const loading = ref(false)

  const fetchUsers = async (reset = false) => {
    if (loading.value) return
    if (!canLoadMore.value && !reset) return

    loading.value = true
    if (reset) {
      cursor.value = null
      users.value = []
      canLoadMore.value = true
    }

    try {
      const res = await $fetch<{ success: boolean, data: AuthUser[], nextCursor: string | null }>('/api/users', {
        query: {
          cursor: cursor.value || undefined,
          limit: 10
        }
      })

      if (res.success && res.data) {
        if (reset) {
          users.value = res.data
        } else {
          const existingIds = new Set(users.value.map(u => u.id))
          const newItems = res.data.filter(u => !existingIds.has(u.id))
          users.value = [...users.value, ...newItems]
        }

        cursor.value = res.nextCursor
        canLoadMore.value = !!res.nextCursor
      }
    } catch (err) {
      console.error('Error fetching users:', err)
    } finally {
      loading.value = false
    }
  }

  return {
    users,
    cursor,
    canLoadMore,
    loading,
    fetchUsers
  }
}
