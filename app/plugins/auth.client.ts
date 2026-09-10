export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuth()
  const router = useRouter()
  const tokenCookie = useCookie('accessToken')

  let isLoggingOut = false

  const handleSessionExpired = async () => {
    if (isLoggingOut) return
    isLoggingOut = true

    try {
      await auth.logout()
      if (router.currentRoute.value.path !== '/login') {
        const toast = useToast()
        const i18n = (nuxtApp as unknown as { $i18n?: { t: (key: string) => string } }).$i18n
        const title = i18n?.t?.('auth.sessionExpired') ?? 'Phiên đăng nhập đã hết hạn'
        const description = i18n?.t?.('auth.sessionExpiredDesc') ?? 'Vui lòng đăng nhập lại để tiếp tục.'

        toast.add({
          title,
          description,
          color: 'error'
        })
        await router.push('/login')
      }
    } finally {
      setTimeout(() => {
        isLoggingOut = false
      }, 1000)
    }
  }

  const originalFetch = globalThis.$fetch

  const customFetch = originalFetch.create({
    onRequest({ options }) {
      const token = auth.accessToken.value || tokenCookie.value
      if (!token) return

      const headers = new Headers(options.headers)
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      options.headers = headers
    },
    async onResponseError({ response, request }) {
      if (response.status === 401) {
        const url = typeof request === 'string' ? request : (request as { url?: string })?.url || ''

        if (url.includes('/api/auth/login') || url.includes('/api/auth/register')) {
          return
        }

        if (url.includes('/api/auth/refresh')) {
          await handleSessionExpired()
          return
        }

        const refreshed = await auth.refresh()
        if (refreshed) {
          return
        }

        await handleSessionExpired()
      }
    }
  })

  globalThis.$fetch = customFetch
  nuxtApp.$fetch = customFetch

  // Window focus listener: verify session when user returns to app
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
      if (auth.isAuthenticated.value) {
        auth.fetchUser().catch(() => { })
      }
    })
  }
})
