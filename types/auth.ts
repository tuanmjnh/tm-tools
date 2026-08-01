export type AuthProvider = 'mongodb' | 'supabase'
export type LoginPlatform = 'web' | 'desktop' | 'mobile'

export interface User {
  id: string
  email: string
  username?: string
  name: string
  avatar?: string
  role: string
  password?: string
  platform: LoginPlatform
  lastLogin?: string
  lastIp?: string
  userAgent?: string
  createdAt: string
  updatedAt: string
}

export interface AuthUser extends User {
  permissions: string[]
  allowedRoutes?: string[]
}

export interface RefreshToken {
  id: string
  userId: string
  token: string
  expiresAt: string
  revokedAt?: string
  revokedBy?: string
  createdAt: string
  platform?: string
  userAgent?: string
  lastIp?: string
}

export interface UserSession {
  id: string
  platform: string
  userAgent: string
  lastIp: string
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

export interface LoginRequest {
  email?: string
  username?: string
  password: string
  platform?: LoginPlatform
}

export interface RegisterRequest {
  email: string
  password: string
  name: string
}

export interface AuthResponse {
  user: AuthUser
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface TokenPayload {
  userId: string
  email: string
  role: string
  permissions: string[]
  allowedRoutes?: string[]
}

export interface AuthConfig {
  provider: AuthProvider
  accessTokenSecret: string
  refreshTokenSecret: string
  accessTokenExpiry: number
  refreshTokenExpiry: number
}
