import type { AuthServiceProvider } from './provider'
import { config } from '../../config/index'

let provider: AuthServiceProvider | null = null

export async function getAuthService(): Promise<AuthServiceProvider> {
  if (provider) return provider

  if (config.auth.provider === 'supabase') {
    const { SupabaseAuthService } = await import('./providers/supabase')
    provider = new SupabaseAuthService()
  } else {
    const { MongoDBAuthService } = await import('./providers/mongodb')
    provider = new MongoDBAuthService()
  }

  return provider
}
