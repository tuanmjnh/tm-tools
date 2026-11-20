import type { DocumentOperationDefinition } from '#shared/types/document'
import { documentStudioOperation } from '~/utils/documentStudio'
import { loadBatchSettings, loadConfig, savePrefs } from '~/utils/documentPrefs'

export interface OperationPageConfig {
  operationId: string
  optional?: 'zip' | 'scale' | 'none'
}

/**
 * Binds one operation page to the shared Choose → Process → Save machinery.
 * The page keeps only its own config fields; everything else lives here so the
 * six operation pages stay small and behave identically.
 */
export function useDocumentOperationPage(operationId: string) {
  const { t } = useI18n()
  const api = useDocumentApi()
  const runtime = useDocumentRuntime()

  const definition = ref<DocumentOperationDefinition | null>(null)
  const loadingDefinition = ref(true)
  /** Runtime availability of this operation, folded from the catalogue. */
  const entry = ref<{ available: boolean, unavailableReason: string | null }>({ available: true, unavailableReason: null })

  const selection = useDocumentFiles(() => definition.value)
  const session = useDocumentRun()
  const batch = useDocumentBatch(operationId, () => definition.value)

  async function loadDefinition() {
    loadingDefinition.value = true
    try {
      // One `/operations` call feeds both the definition and the runtime
      // capabilities; fetching them separately doubled the request per mount.
      const catalog = await api.operations()
      const matched = catalog.operations.find(operation => operation.id === operationId)
      definition.value = matched ?? null
      entry.value = matched
        ? { available: matched.available, unavailableReason: matched.runtimeSupport?.reasonDisabled ?? null }
        : { available: true, unavailableReason: null }
      await runtime.load(catalog)
    } catch (caught) {
      definition.value = null
      // Retrying `/operations` here would repeat the request that just failed,
      // so surface its code directly and only fetch the output folder.
      runtime.connectionError.value = (caught as { code?: string })?.code || 'DOCUMENT_STORAGE_UNAVAILABLE'
      await runtime.loadSettings()
    } finally {
      loadingDefinition.value = false
    }
  }

  const operationMeta = computed(() => documentStudioOperation(operationId))
  const title = computed(() => operationMeta.value ? t(operationMeta.value.titleKey) : '')
  const description = computed(() => operationMeta.value ? t(operationMeta.value.descriptionKey) : '')
  const isPerFileBatch = computed(() => definition.value?.batch?.mode === 'per-file')
  const multiple = computed(() => definition.value?.input.mode !== 'single-file' || isPerFileBatch.value)

  // Per-file ops run through the batch pool, so the shell must render the batch
  // view model and results; combine ops keep the single-session job.
  const batchViewModel = computed(() => isPerFileBatch.value ? batch.viewModel.value : null)
  const resultArtifacts = computed(() => isPerFileBatch.value ? batch.artifacts.value : session.artifacts.value)

  /** Page counts of the single running job; the shell prints them next to the bar. */
  const progressUnits = computed(() => {
    const current = session.progress.value
    if (!current || current.totalUnits <= 0) return null
    return { done: current.completedUnits, total: current.totalUnits }
  })

  function removeArtifact(artifactId: string) {
    if (isPerFileBatch.value) batch.removeArtifact(artifactId)
    else session.removeArtifact(artifactId)
  }

  /**
   * Saves the settings the page is currently showing, so the next visit opens
   * with the same model, preset, formats and pool tuning.
   */
  function rememberSettings(config?: Record<string, unknown>) {
    if (!import.meta.client) return
    const patch: Parameters<typeof savePrefs>[1] = {}
    if (config) patch.config = config
    if (isPerFileBatch.value) {
      patch.concurrency = batch.concurrency.value
      patch.pauseMs = batch.pauseMs.value
      patch.maxRetry = batch.maxRetry.value
    }
    savePrefs(operationId, patch)
  }

  /** Defaults merged with the last run's values for this operation. */
  function restoredConfig<T extends Record<string, unknown>>(defaults: T): T {
    return loadConfig(operationId, defaults)
  }

  function addFiles(files: File[]) {
    const overflow = selection.add(files)
    if (overflow > 0) {
      // The picker silently drops extras when the operation caps the count, so
      // the page is told how many would be lost.
      session.error.value = { code: 'DOCUMENT_INPUT_COUNT_INVALID' }
    }
  }

  async function run(config: Record<string, unknown> = {}) {
    const files = selection.uploadPayload()
    if (!files.length) {
      session.error.value = { code: 'DOCUMENT_INPUT_REQUIRED' }
      return false
    }
    // Whichever settings produced this run are the ones worth restoring next time.
    rememberSettings(config)
    const executionConfig: Record<string, unknown> = { ...config }
    if (runtime.isLocal.value && runtime.outputPath.value) {
      executionConfig.outputDir = runtime.outputPath.value
    }
    // Cloud storage is only reachable through a signed plan; the local
    // runtime posts the bytes to its own staging route. An ephemeral cloud
    // has neither, so the whole job goes through one request.
    const directUpload = !runtime.isLocal.value && !runtime.capabilities.value?.ephemeralResults
    const inline = runtime.capabilities.value?.ephemeralResults === true
    if (isPerFileBatch.value) {
      batch.start(files, executionConfig, { directUpload, inline })
      selection.clear()
      return true
    }
    const ok = await session.run({
      operationId,
      files,
      config: executionConfig,
      directUpload,
      inline
    })
    if (ok) selection.clear()
    return ok
  }

  onMounted(async () => {
    await loadDefinition()
    // Pool tuning is per operation and survives a reload; restoring it before
    // the first run means the operator does not re-enter it each session.
    const saved = loadBatchSettings(operationId)
    if (saved.concurrency !== undefined) batch.setConcurrency(saved.concurrency)
    if (saved.pauseMs !== undefined) batch.setPauseMs(saved.pauseMs)
    if (saved.maxRetry !== undefined) batch.setMaxRetry(saved.maxRetry)
  })

  async function reload() {
    await loadDefinition()
  }

  return {
    definition,
    entry: computed(() => entry.value),
    operationMeta,
    title,
    description,
    multiple,
    isPerFileBatch,
    batchViewModel,
    resultArtifacts,
    loading: computed(() => loadingDefinition.value),
    /** Percent of the single running job, or null while it has not reported yet. */
    progressPercent: session.progressPercent,
    progress: session.progress,
    progressUnits,
    selection,
    session,
    batch,
    runtime,
    loadDefinition,
    reload,
    addFiles,
    removeArtifact,
    run,
    restoredConfig,
    rememberSettings,
    errorText: computed(() => session.error.value ? t(`document.errors.${session.error.value.code}`) : '')
  }
}
