export default defineNitroPlugin(async () => {
  try {
    const { getDatabase } = await import('../modules/database/index')
    await getDatabase()
    console.log('[Database] Connected')
  } catch (err) {
    const e = err as Error
    console.error('[Database] Connection failed:', e.message)
  }
})
