import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '~/types/auth'

export const useAuth = () => {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const accessToken = useState<string | null>('auth:accessToken', () => null)
  const refreshToken = useState<string | null>('auth:refreshToken', () => null)
  const loading = useState('auth:loading', () => false)

  const isAuthenticated = computed(() => !!user.value)
  const can = (module: string, action: string) => {
    if (!user.value) return false
    if (user.value.permissions.includes('*')) return true
    return user.value.permissions.includes(`${module}:${action}`)
  }

  async function login(credentials: LoginRequest): Promise<AuthResponse> {
    if (loading.value) return Promise.reject(new Error('Request in progress'))
    loading.value = true
    try {
      const { data } = await $fetch<{ success: boolean; data: AuthResponse }>('/api/auth/login', {
        method: 'POST',
        body: credentials
      })

      user.value = data.user
      accessToken.value = data.accessToken
      refreshToken.value = data.refreshToken

      const cookieAccess = useCookie('accessToken', { maxAge: data.expiresIn, path: '/', sameSite: 'lax' })
      const cookieRefresh = useCookie('refreshToken', { maxAge: 604800, path: '/', sameSite: 'lax', httpOnly: true })

      cookieAccess.value = data.accessToken
      cookieRefresh.value = data.refreshToken

      return data
    } finally {
      loading.value = false
    }
  }

  async function register(input: RegisterRequest): Promise<AuthResponse> {
    if (loading.value) return Promise.reject(new Error('Request in progress'))
    loading.value = true
    try {
      const { data } = await $fetch<{ success: boolean; data: AuthResponse }>('/api/auth/register', {
        method: 'POST',
        body: input
      })

      user.value = data.user
      accessToken.value = data.accessToken
      refreshToken.value = data.refreshToken

      return data
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      if (refreshToken.value) {
        await $fetch('/api/auth/logout', {
          method: 'POST',
          body: { refreshToken: refreshToken.value }
        })
      }
    } catch {
      // Ignore logout errors
    } finally {
      user.value = null
      accessToken.value = null
      refreshToken.value = null

      const cookieAccess = useCookie('accessToken')
      const cookieRefresh = useCookie('refreshToken')
      cookieAccess.value = null
      cookieRefresh.value = null
    }
  }

  async function fetchUser(): Promise<void> {
    try {
      const token = useCookie('accessToken').value
      if (!token) return

      accessToken.value = token
      refreshToken.value = useCookie('refreshToken').value || null

      const { data } = await $fetch<{ success: boolean; data: AuthUser }>('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })

      user.value = data
    } catch {
      user.value = null
      accessToken.value = null
      refreshToken.value = null
    }
  }

  async function revokeTokens(): Promise<void> {
    await $fetch('/api/auth/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken.value}` }
    })
    await logout()
  }

  return {
    user: readonly(user),
    accessToken: readonly(accessToken),
    loading: readonly(loading),
    isAuthenticated,
    can,
    login,
    register,
    logout,
    fetchUser,
    revokeTokens
  }
}
