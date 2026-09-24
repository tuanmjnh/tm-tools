import type { AuthResponse, AuthUser, LoginPlatform, LoginRequest, RegisterRequest } from '~/types/auth'

interface HubUserData {
  id: string
  email: string
  name: string
  roles?: string[]
  permissions?: string[]
  platform?: LoginPlatform
  createdAt?: string
  updatedAt?: string
}

interface HubAuthData {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: HubUserData
}

interface HubMeData {
  userId: string
  email: string
  name: string
  roles?: string[]
  permissions?: string[]
  allowedRoutes?: string[]
  platform?: LoginPlatform
  createdAt?: string
  updatedAt?: string
}

export const useAuth = () => {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const accessToken = useState<string | null>('auth:accessToken', () => null)
  const refreshToken = useState<string | null>('auth:refreshToken', () => null)
  const loading = useState('auth:loading', () => false)

  const config = useRuntimeConfig()
  const hubUrl = (config.public.hubUrl as string) || 'http://localhost:4000'
  const appId = (config.public.hubAppId as string) || 'tm-tools'

  const isAuthenticated = computed(() => !!user.value)
  const can = (module: string, action: string) => {
    if (!user.value) return false
    const perms = user.value.permissions || []
    if (perms.includes('*')) return true
    const candidates = new Set<string>([`${module}.${action}`, `${module}:${action}`])
    if (action === 'write') {
      for (const a of ['upload', 'create', 'update', 'manage']) {
        candidates.add(`${module}.${a}`)
        candidates.add(`${module}:${a}`)
      }
    }
    if (action === 'manage') {
      for (const a of ['create', 'update', 'delete', 'write']) {
        candidates.add(`${module}.${a}`)
        candidates.add(`${module}:${a}`)
      }
    }
    if (module === 'logs' && action === 'read') {
      candidates.add('apps.logs.read')
      candidates.add('apps:logs.read')
    }
    return perms.some(p => candidates.has(p))
  }

  async function login(credentials: LoginRequest): Promise<AuthResponse> {
    if (loading.value) return Promise.reject(new Error('Request in progress'))
    loading.value = true
    try {
      const { data } = await $fetch<{ success: boolean, data: HubAuthData }>(`${hubUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'X-App-Id': appId },
        body: { ...credentials, appId }
      })

      const formattedUser: AuthUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.roles?.[0] || 'user',
        permissions: data.user.permissions || [],
        platform: data.user.platform || 'web',
        createdAt: data.user.createdAt || new Date().toISOString(),
        updatedAt: data.user.updatedAt || new Date().toISOString()
      }

      user.value = formattedUser
      accessToken.value = data.accessToken
      refreshToken.value = data.refreshToken

      const cookieAccess = useCookie('accessToken', { maxAge: data.expiresIn, path: '/', sameSite: 'lax' })
      const cookieRefresh = useCookie('refreshToken', { maxAge: 604800, path: '/', sameSite: 'lax' })

      cookieAccess.value = data.accessToken
      cookieRefresh.value = data.refreshToken

      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        user: formattedUser
      }
    } finally {
      loading.value = false
    }
  }

  async function register(input: RegisterRequest): Promise<AuthResponse> {
    if (loading.value) return Promise.reject(new Error('Request in progress'))
    loading.value = true
    try {
      const { data } = await $fetch<{ success: boolean, data: HubAuthData }>(`${hubUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'X-App-Id': appId },
        body: { ...input, appId }
      })

      const formattedUser: AuthUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.roles?.[0] || 'user',
        permissions: data.user.permissions || [],
        platform: data.user.platform || 'web',
        createdAt: data.user.createdAt || new Date().toISOString(),
        updatedAt: data.user.updatedAt || new Date().toISOString()
      }

      user.value = formattedUser
      accessToken.value = data.accessToken
      refreshToken.value = data.refreshToken

      const cookieAccess = useCookie('accessToken', { maxAge: data.expiresIn, path: '/', sameSite: 'lax' })
      const cookieRefresh = useCookie('refreshToken', { maxAge: 604800, path: '/', sameSite: 'lax' })

      cookieAccess.value = data.accessToken
      cookieRefresh.value = data.refreshToken

      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        user: formattedUser
      }
    } finally {
      loading.value = false
    }
  }

  let refreshPromise: Promise<boolean> | null = null

  async function refresh(): Promise<boolean> {
    if (refreshPromise) return refreshPromise

    refreshPromise = (async () => {
      const rToken = refreshToken.value || useCookie('refreshToken').value
      if (!rToken) return false

      try {
        const res = await fetch(`${hubUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-App-Id': appId
          },
          body: JSON.stringify({ refreshToken: rToken, appId })
        })

        if (!res.ok) return false

        const json = await res.json()
        if (!json.success || !json.data) return false

        const data = json.data
        accessToken.value = data.accessToken
        refreshToken.value = data.refreshToken

        const cookieAccess = useCookie('accessToken', { maxAge: data.expiresIn, path: '/', sameSite: 'lax' })
        const cookieRefresh = useCookie('refreshToken', { maxAge: 604800, path: '/', sameSite: 'lax' })

        cookieAccess.value = data.accessToken
        cookieRefresh.value = data.refreshToken

        // Refresh user info
        await fetchUser()

        return true
      } catch {
        return false
      } finally {
        refreshPromise = null
      }
    })()

    return refreshPromise
  }

  async function logout(): Promise<void> {
    try {
      const rToken = refreshToken.value || useCookie('refreshToken').value
      if (rToken) {
        await fetch(`${hubUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-App-Id': appId
          },
          body: JSON.stringify({ refreshToken: rToken })
        }).catch(() => { })
      }
    } catch {
      // Ignore logout errors
    } finally {
      user.value = null
      accessToken.value = null
      refreshToken.value = null

      const cookieAccess = useCookie('accessToken', { path: '/' })
      const cookieRefresh = useCookie('refreshToken', { path: '/' })
      cookieAccess.value = null
      cookieRefresh.value = null
    }
  }

  async function fetchUser(): Promise<void> {
    try {
      const token = useCookie('accessToken').value
      if (!token) {
        const rToken = useCookie('refreshToken').value
        if (rToken) {
          const success = await refresh()
          if (success) return
        }
        user.value = null
        accessToken.value = null
        refreshToken.value = null
        return
      }

      accessToken.value = token
      refreshToken.value = useCookie('refreshToken').value || null

      const { data } = await $fetch<{ success: boolean, data: HubMeData }>(`${hubUrl}/api/v1/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-App-Id': appId
        }
      })

      user.value = {
        id: data.userId,
        email: data.email,
        name: data.name,
        role: data.roles?.[0] || 'user',
        permissions: data.permissions || [],
        platform: data.platform || 'web',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString()
      }
    } catch {
      const success = await refresh()
      if (!success) {
        user.value = null
        accessToken.value = null
        refreshToken.value = null
      }
    }
  }

  async function revokeTokens(): Promise<void> {
    await logout()
  }

  function setTokens(tokens: { accessToken: string, refreshToken: string, expiresIn: number }) {
    accessToken.value = tokens.accessToken
    refreshToken.value = tokens.refreshToken
    const cookieAccess = useCookie('accessToken', { maxAge: tokens.expiresIn, path: '/', sameSite: 'lax' })
    const cookieRefresh = useCookie('refreshToken', { maxAge: 604800, path: '/', sameSite: 'lax' })
    cookieAccess.value = tokens.accessToken
    cookieRefresh.value = tokens.refreshToken
  }

  return {
    user: readonly(user),
    accessToken: readonly(accessToken),
    refreshToken: readonly(refreshToken),
    loading: readonly(loading),
    isAuthenticated,
    can,
    login,
    register,
    logout,
    refresh,
    fetchUser,
    revokeTokens,
    setTokens
  }
}
