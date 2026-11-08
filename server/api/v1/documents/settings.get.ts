import { documentCaller, runDocument } from '#server/utils/documentApi'
import { documentDirs } from '#server/modules/document/paths'
import { defaultSettings, MAX_RETENTION_DAYS } from '#server/modules/document/runner'
import { documentRuntime, isLocalRuntime } from '#server/modules/document/runtime-context'

/**
 * Reports the delivery destination for this runtime. Local answers with the
 * folder path; cloud answers with "download", because there is no shared
 * filesystem and the bytes come from a signed route instead.
 */
export default defineEventHandler(async (event) => {
  const caller = documentCaller(event)
  void caller

  return runDocument(event, async () => {
    const runtime = await documentRuntime(event)
    const retention = {
      defaultRetentionDays: defaultSettings().defaultRetentionDays,
      maxRetentionDays: MAX_RETENTION_DAYS
    }

    if (!isLocalRuntime()) {
      return {
        runtime: runtime.capabilities.runtime,
        defaultOutputPath: '',
        delivery: 'download' as const,
        supportsNativeSaveDialog: false,
        ...retention
      }
    }

    return {
      runtime: runtime.capabilities.runtime,
      defaultOutputPath: documentDirs.output,
      delivery: 'folder' as const,
      supportsNativeSaveDialog: runtime.capabilities.supportsNativeSaveDialog,
      ...retention
    }
  })
})
