interface NotificationItem {
  id: string
  unread: boolean
  sender?: {
    name?: string
    avatar?: string | { src: string }
  }
  body: string
  date: string
  priority?: string
  type?: string
}

export const useNotify = () => {
  const auth = useAuth()

  const getNotifyIcon = (type: string): string => {
    const icons: Record<string, string> = {
      order: 'i-lucide-shopping-cart',
      inventory: 'i-lucide-package',
      payment: 'i-lucide-credit-card',
      system: 'i-lucide-settings',
      security: 'i-lucide-shield-alert',
      user: 'i-lucide-user',
      default: 'i-lucide-bell'
    }
    return (icons[type] || icons.default) as string
  }

  const getNotifyColor = (priority: string): 'neutral' | 'primary' | 'error' | 'success' | 'warning' | 'info' => {
    const colors: Record<string, 'neutral' | 'primary' | 'error' | 'success' | 'warning' | 'info'> = {
      low: 'neutral',
      normal: 'primary',
      high: 'error'
    }
    return colors[priority] || 'primary'
  }

  const notify = ref<NotificationItem[]>([])
  const unreadCount = computed(() => notify.value.filter(n => n.unread).length)
  const isLoading = ref(false)

  const fetchNotify = async () => {
    if (!auth.user.value) return []
    isLoading.value = true
    try {
      const data = await $fetch<NotificationItem[]>('/api/notifications')
      notify.value = data || []
      return notify.value
    } catch (error) {
      console.error('Error fetching notifications:', error)
      return []
    } finally {
      isLoading.value = false
    }
  }

  const markAsRead = async (notifyId: string) => {
    try {
      const response = await $fetch<{ success: boolean }>(`/api/notifications/${notifyId}/read`, {
        method: 'PATCH'
      })

      if (response.success) {
        const item = notify.value.find(n => n.id === notifyId)
        if (item) {
          item.unread = false
        }
      }
      return response.success
    } catch (error) {
      console.error('Error marking notification as read:', error)
      return false
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await $fetch<{ success: boolean }>('/api/notifications/read-all', {
        method: 'POST'
      })

      if (response.success) {
        notify.value.forEach((n) => {
          n.unread = false
        })
      }
      return response.success
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      return false
    }
  }

  const deleteNotify = async (ids: string[]) => {
    try {
      const response = await $fetch<{ success: boolean }>('/api/notifications', {
        method: 'DELETE',
        query: { id: ids.join(',') }
      })

      if (response.success) {
        notify.value = notify.value.filter(n => !ids.includes(n.id))
      }
      return response.success
    } catch (error) {
      console.error('Error deleting notifications:', error)
      return false
    }
  }

  const showToast = (notification: NotificationItem) => {
    const toast = useToast()
    toast.add({
      title: notification.sender?.name || 'System',
      description: notification.body,
      icon: getNotifyIcon(notification.type || ''),
      color: getNotifyColor(notification.priority || 'normal'),
      duration: notification.priority === 'high' ? 10000 : 5000
    })
  }

  const refresh = async () => {
    await fetchNotify()
  }

  // Setup auto-fetch if mounted
  if (import.meta.client) {
    onMounted(() => {
      if (auth.user.value) {
        fetchNotify()
      }
    })
  }

  watch(() => auth.user.value, (newUser) => {
    if (newUser) {
      refresh()
    } else {
      notify.value = []
    }
  })

  return {
    notify,
    unreadCount,
    isLoading,
    fetchNotify,
    markAsRead,
    markAllAsRead,
    deleteNotify,
    refresh,
    showToast,
    getNotifyIcon,
    getNotifyColor
  }
}
