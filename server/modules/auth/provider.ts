import type { AuthUser, AuthResponse, LoginRequest, RegisterRequest } from '../../../types/auth'

export interface AuthServiceProvider {
  login(input: LoginRequest, ip?: string, userAgent?: string): Promise<AuthResponse>
  register(input: RegisterRequest): Promise<AuthResponse>
  refreshTokens(refreshToken: string): Promise<AuthResponse>
  logout(refreshToken: string): Promise<void>
  revokeAllTokens(userId: string): Promise<void>
  getCurrentUser(userId: string): Promise<AuthUser | null>
}
