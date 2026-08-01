export default defineNitroPlugin(async () => {
  try {
    const { getDatabase } = await import('../modules/database/index')
    await getDatabase()
    console.log('[Database] Connected')

    const { applyPersistedConfig } = await import('../modules/config/service')
    const result = await applyPersistedConfig()
    if (result.applied) {
      console.log(`[Config] Applied ${result.count} persisted value(s) from MongoDB`)
    }
  } catch (err) {
    const e = err as Error
    console.error('[Database] Connection failed:', e.message)
  }
})
