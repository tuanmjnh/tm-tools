import type { AuthUser, AuthResponse, LoginRequest, RegisterRequest, TokenPayload } from '../../../../types/auth'
import { getDatabase } from '../../database/index'
import { comparePassword, sanitizeUser } from '../../../utils/crypto'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../../utils/jwt'
import { config } from '../../../config/index'
import { getUserAccess } from '../../rbac/service'
import type { AuthServiceProvider } from '../provider'

export class SupabaseAuthService implements AuthServiceProvider {
  async login(input: LoginRequest, ip?: string, userAgent?: string): Promise<AuthResponse> {
    const db = await getDatabase()

    let user: AuthUser | null = null
    if (input.email) {
      user = await db.findByEmail(input.email)
    } else if (input.username) {
      user = await db.findByUsername(input.username)
    }
    if (!user) {
      user = input.email ? await db.findByUsername(input.email) : null
    }

    if (!user || !(user as any).password) {
      throw createError({ statusCode: 401, statusMessage: 'error.invalidCredentials', message: 'Invalid email/username or password' })
    }

    const valid = await comparePassword(input.password, (user as any).password)
    if (!valid) {
      throw createError({ statusCode: 401, statusMessage: 'error.invalidCredentials', message: 'Invalid email/username or password' })
    }

    const platform = input.platform || 'web'
    await db.updateUser(user.id, { lastLogin: new Date().toISOString(), lastIp: ip, userAgent, platform } as any)

    const access = await getUserAccess(user.id, user.role)
    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role, permissions: access.permissions, allowedRoutes: access.allowedRoutes }
    const accessToken = await signAccessToken(payload)
    const refreshToken = await signRefreshToken({ userId: user.id })

    const expiresAt = new Date(Date.now() + config.auth.refreshTokenExpiry * 1000)
    await db.saveRefreshToken(user.id, refreshToken, expiresAt, { platform, userAgent, lastIp: ip })

    return { user: { ...sanitizeUser(user as any), permissions: access.permissions, allowedRoutes: access.allowedRoutes } as AuthUser, accessToken, refreshToken, expiresIn: config.auth.accessTokenExpiry }
  }

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const db = await getDatabase()
    const existing = await db.findByEmail(input.email)
    if (existing) {
      throw createError({ statusCode: 409, statusMessage: 'error.emailExists', message: 'Email already registered' })
    }

    const user = await db.createUser({ email: input.email, password: input.password, name: input.name, role: 'user', platform: 'web' })
    const access = await getUserAccess(user.id, user.role)
    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role, permissions: access.permissions, allowedRoutes: access.allowedRoutes }
    const accessToken = await signAccessToken(payload)
    const refreshToken = await signRefreshToken({ userId: user.id })

    const expiresAt = new Date(Date.now() + config.auth.refreshTokenExpiry * 1000)
    await db.saveRefreshToken(user.id, refreshToken, expiresAt, { platform: 'web' })

    return { user: { ...user, permissions: access.permissions, allowedRoutes: access.allowedRoutes } as AuthUser, accessToken, refreshToken, expiresIn: config.auth.accessTokenExpiry }
  }

  async refreshTokens(refreshToken: string): Promise<AuthResponse> {
    const db = await getDatabase()
    const decoded = await verifyRefreshToken(refreshToken)
    if (!decoded) throw createError({ statusCode: 401, statusMessage: 'error.invalidToken', message: 'Invalid refresh token' })

    const stored = await db.findRefreshToken(refreshToken)
    if (!stored || stored.revokedAt) throw createError({ statusCode: 401, statusMessage: 'error.invalidToken', message: 'Refresh token revoked or expired' })

    await db.revokeRefreshToken(refreshToken)
    const user = await db.findById(decoded.userId)
    if (!user) throw createError({ statusCode: 401, statusMessage: 'error.userNotFound', message: 'User not found' })

    const access = await getUserAccess(user.id, user.role)
    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role, permissions: access.permissions, allowedRoutes: access.allowedRoutes }
    const newAccessToken = await signAccessToken(payload)
    const newRefreshToken = await signRefreshToken({ userId: user.id })

    const expiresAt = new Date(Date.now() + config.auth.refreshTokenExpiry * 1000)
    await db.saveRefreshToken(user.id, newRefreshToken, expiresAt, { platform: 'web' })

    return { user: { ...sanitizeUser(user as any), permissions: access.permissions, allowedRoutes: access.allowedRoutes } as AuthUser, accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: config.auth.accessTokenExpiry }
  }

  async logout(refreshToken: string): Promise<void> {
    const db = await getDatabase()
    await db.revokeRefreshToken(refreshToken)
  }

  async revokeAllTokens(userId: string): Promise<void> {
    const db = await getDatabase()
    await db.revokeAllUserTokens(userId)
  }

  async getCurrentUser(userId: string): Promise<AuthUser | null> {
    const db = await getDatabase()
    const user = await db.findById(userId)
    if (!user) return null
    const access = await getUserAccess(user.id, user.role)
    return { ...sanitizeUser(user as any), permissions: access.permissions, allowedRoutes: access.allowedRoutes } as AuthUser
  }
}
