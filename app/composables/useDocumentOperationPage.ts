import type { DocumentOperationDefinition } from '#shared/types/document'
import { documentStudioOperation } from '~/utils/documentStudio'

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

  const selection = useDocumentFiles(() => definition.value)
  const session = useDocumentRun()

  async function loadDefinition() {
    loadingDefinition.value = true
    try {
      const catalog = await api.operations()
      definition.value = catalog.operations.find(operation => operation.id === operationId) ?? null
    } catch {
      definition.value = null
    } finally {
      loadingDefinition.value = false
    }
  }

  const operationMeta = computed(() => documentStudioOperation(operationId))
  const title = computed(() => operationMeta.value ? t(operationMeta.value.titleKey) : '')
  const description = computed(() => operationMeta.value ? t(operationMeta.value.descriptionKey) : '')
  const multiple = computed(() => definition.value?.input.mode !== 'single-file')

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
    const executionConfig: Record<string, unknown> = { ...config }
    if (runtime.isLocal.value && runtime.outputPath.value) {
      executionConfig.outputDir = runtime.outputPath.value
    }
    const ok = await session.run({
      operationId,
      files,
      config: executionConfig,
      // Cloud storage is only reachable through a signed plan; the local
      // runtime posts the bytes to its own staging route. An ephemeral cloud
      // has neither, so the whole job goes through one request.
      directUpload: !runtime.isLocal.value && !runtime.capabilities.value?.ephemeralResults,
      inline: runtime.capabilities.value?.ephemeralResults === true
    })
    if (ok) selection.clear()
    return ok
  }

  onMounted(async () => {
    await Promise.all([loadDefinition(), runtime.load()])
  })

  async function reload() {
    await Promise.all([loadDefinition(), runtime.load()])
  }

  return {
    definition,
    operationMeta,
    title,
    description,
    multiple,
    loading: computed(() => loadingDefinition.value),
    selection,
    session,
    runtime,
    loadDefinition,
    reload,
    addFiles,
    run,
    errorText: computed(() => session.error.value ? t(`document.errors.${session.error.value.code}`) : '')
  }
}
