import type { User } from '~/types'

export const useCustomers = () => {
  const customers = shallowRef<User[]>([])
  const cursor = ref<number | null>(null)
  const canLoadMore = ref(true)
  const loading = ref(false)
  const filterQ = ref('')
  const filterStatus = ref('all')

  const fetchCustomers = async (reset = false) => {
    if (loading.value) return
    if (!canLoadMore.value && !reset) return

    loading.value = true
    if (reset) {
      cursor.value = null
      customers.value = []
      canLoadMore.value = true
    }

    try {
      const res = await $fetch<{ success: boolean, data: User[], nextCursor: number | null }>('/api/customers', {
        query: {
          cursor: cursor.value || undefined,
          limit: 10,
          q: filterQ.value || undefined,
          status: filterStatus.value || undefined
        }
      })

      if (res.success && res.data) {
        if (reset) {
          customers.value = res.data
        } else {
          const existingIds = new Set(customers.value.map(c => c.id as number))
          const newItems = res.data.filter(c => !existingIds.has(c.id as number))
          customers.value = [...customers.value, ...newItems]
        }

        cursor.value = res.nextCursor
        canLoadMore.value = !!res.nextCursor
      }
    } catch (err) {
      console.error('Error fetching customers:', err)
    } finally {
      loading.value = false
    }
  }

  return {
    customers,
    cursor,
    canLoadMore,
    loading,
    filterQ,
    filterStatus,
    fetchCustomers
  }
}
