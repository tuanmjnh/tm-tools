import { getDatabase } from '../modules/database/index'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  const isRoot = auth.role === 'root' || auth.permissions?.includes('*')
  if (!isRoot) throw createError({ statusCode: 403, statusMessage: 'error.notRoot', message: 'Only root role can seed the database' })

  const body = await readBody<{ reset?: boolean }>(event).catch(() => ({} as { reset?: boolean }))
  const reset = !!body.reset
  const db = await getDatabase()
  await db.seed({ reset })
  return { success: true, message: reset ? 'Database reset & reseeded' : 'Database seeded successfully (idempotent)' }
})
