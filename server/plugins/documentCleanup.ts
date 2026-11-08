import { cleanupOrphans } from '../modules/document/cleanup'
import { isLocalRuntime } from '../modules/document/runtime-context'

/**
 * Removes expired job directories at boot. A cloud runtime has no persistent
 * filesystem, so the janitor only makes sense where the local adapter is active.
 */
export default defineNitroPlugin(() => {
  if (!isLocalRuntime()) return
  try {
    const result = cleanupOrphans()
    if (result.removed.length) {
      console.log(`[Document] cleaned ${result.removed.length} expired job(s)`)
    }
  } catch (error) {
    console.error('[Document] orphan cleanup failed:', (error as Error).message)
  }
})
