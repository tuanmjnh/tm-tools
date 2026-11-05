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

interface HubNotificationItem {
  id: string
  is_read: boolean
  title?: string
  body: string
  icon?: string
  created_at: string
}

const NOTIFY_FETCH_INTERVAL_MS = 30_000

let fetchInFlight: Promise<NotificationItem[]> | null = null
let lastFetchAt = 0

export const useNotify = () => {
  const auth = useAuth()
  const { notifications } = useHub()
  const toast = useToast()

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

  const notify = useState<NotificationItem[]>('notify:items', () => [])
  const isLoading = useState<boolean>('notify:loading', () => false)
  const unreadCount = computed(() => notify.value.filter(n => n.unread).length)

  const fetchNotify = async (force = false): Promise<NotificationItem[]> => {
    if (!auth.user.value) return []
    if (fetchInFlight) return fetchInFlight

    if (!force && import.meta.client && lastFetchAt && Date.now() - lastFetchAt < NOTIFY_FETCH_INTERVAL_MS) {
      return notify.value
    }

    isLoading.value = true
    const request = (async () => {
      try {
        const res = await notifications.list()
        const list = (res.data || []) as unknown as HubNotificationItem[]
        notify.value = list.map(n => ({
          id: n.id,
          unread: !n.is_read,
          body: n.body,
          date: n.created_at,
          priority: 'normal',
          type: 'system',
          sender: { name: n.title, avatar: n.icon }
        }))
        return notify.value
      } catch (error) {
        console.error('Error fetching notifications:', error)
        return notify.value
      } finally {
        isLoading.value = false
        lastFetchAt = Date.now()
        fetchInFlight = null
      }
    })()

    fetchInFlight = request
    return request
  }

  const markAsRead = async (notifyId: string) => {
    try {
      const response = await notifications.markRead(notifyId)

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
      const response = await notifications.markReadAll()

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
      const response = await notifications.delete(ids)

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
    toast.add({
      title: notification.sender?.name || 'System',
      description: notification.body,
      icon: getNotifyIcon(notification.type || ''),
      color: getNotifyColor(notification.priority || 'normal'),
      duration: notification.priority === 'high' ? 10000 : 5000
    })
  }

  const success = (title: string, description?: string) => {
    toast.add({ title, description, icon: 'i-lucide-check-circle-2', color: 'success', duration: 4000 })
  }

  const error = (title: string, description?: string) => {
    toast.add({ title, description, icon: 'i-lucide-alert-circle', color: 'error', duration: 6000 })
  }

  const warning = (title: string, description?: string) => {
    toast.add({ title, description, icon: 'i-lucide-alert-triangle', color: 'warning', duration: 5000 })
  }

  const info = (title: string, description?: string) => {
    toast.add({ title, description, icon: 'i-lucide-info', color: 'info', duration: 4000 })
  }

  const refresh = async () => {
    await fetchNotify(true)
  }

  const clear = () => {
    notify.value = []
    lastFetchAt = 0
  }

  return {
    notify,
    unreadCount,
    isLoading,
    fetchNotify,
    markAsRead,
    markAllAsRead,
    deleteNotify,
    refresh,
    clear,
    showToast,
    getNotifyIcon,
    getNotifyColor,
    success,
    error,
    warning,
    info
  }
}
