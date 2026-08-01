import { config } from '../config/index'
import { getDatabase } from '../modules/database/index'

export default defineEventHandler(async () => {
  const diagnostics: Record<string, any> = {
    config: {
      authProvider: config.auth.provider,
      mongodbUri: config.mongodb.uri ? '(set)' : '(not set)',
      supabaseUrl: config.supabase.url ? '(set)' : '(not set)',
      supabaseKey: config.supabase.publishableKey ? '(set)' : '(not set)',
      supabaseServiceRoleKey: config.supabase.serviceRoleKey ? '(set)' : '(not set)',
      appPort: config.app.port
    }
  }

  try {
    const db = await getDatabase()
    diagnostics.database = 'connected'
    diagnostics.adapter = db.constructor.name

    const testUser = await db.findByEmail('admin@example.com')
    diagnostics.testUser = testUser ? `found (id: ${testUser.id})` : 'NOT FOUND'
  } catch (err: any) {
    diagnostics.database = 'error'
    diagnostics.error = err.message
    diagnostics.stack = err.stack?.split('\n').slice(0, 4).join('\n')
  }

  return { success: true, data: diagnostics }
})
