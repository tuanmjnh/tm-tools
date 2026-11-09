import type { DocumentArtifactView, DocumentJobView, DocumentRuntimeCapabilities } from '#shared/types/document'
import type { DocumentErrorPayload } from './useDocumentApi'
import { isDocumentConnectionError } from '~/utils/documentStudio'

/**
 * Runs one job: create draft → upload the picked bytes → start → keep the
 * returned artifacts. Local posts a multipart form; cloud asks for a signed
 * plan per file so the bytes go straight to storage. Errors are normalized to
 * `DOCUMENT_*` codes so the page can localize them.
 */
export function useDocumentRun() {
  const api = useDocumentApi()
  const running = ref(false)
  const uploading = ref(false)
  const job = ref<DocumentJobView | null>(null)
  const artifacts = ref<DocumentArtifactView[]>([])
  const error = ref<DocumentErrorPayload | null>(null)

  async function run(options: {
    operationId: string
    files: File[]
    config: Record<string, unknown>
    directUpload?: boolean
    inline?: boolean
  }): Promise<boolean> {
    running.value = true
    error.value = null
    job.value = null
    artifacts.value = []
    // One token per attempt: a retried POST returns this run's draft instead of
    // creating a second job, and the next user-initiated run gets a fresh one.
    const idempotencyKey = crypto.randomUUID()

    try {
      // Ephemeral cloud: no storage outlives the request, so the run and its
      // result travel in a single call instead of create → upload → start.
      if (options.inline) {
        uploading.value = true
        try {
          const finished = await api.runInline(options.operationId, options.files, options.config)
          job.value = finished
          artifacts.value = finished.artifacts
          return true
        } finally {
          uploading.value = false
        }
      }

      const draft = await api.createJob(options.operationId, options.config, undefined, idempotencyKey)
      job.value = draft

      uploading.value = true
      try {
        if (!options.directUpload) {
          await api.uploadInputs(draft.id, options.files)
        } else {
          for (const file of options.files) {
            const declared = await api.declareInput(draft.id, { name: file.name, size: file.size, type: file.type })
            if (declared.plan.mode === 'form-post') {
              await api.uploadInputs(draft.id, [file])
              await api.completeInput(draft.id, declared.input.id)
              continue
            }
            const completed = await api.uploadWithPlan(declared.plan, file)
            await api.completeInput(draft.id, declared.input.id, completed)
          }
        }
      } finally {
        uploading.value = false
      }

      const finished = await api.startJob(draft.id)
      job.value = finished
      artifacts.value = finished.artifacts
      return true
    } catch (caught) {
      uploading.value = false
      error.value = caught as DocumentErrorPayload
      return false
    } finally {
      running.value = false
    }
  }

  async function cancel() {
    if (!job.value) return
    try {
      await api.cancelJob(job.value.id)
      job.value = await api.job(job.value.id)
    } catch (caught) {
      error.value = caught as DocumentErrorPayload
    }
  }

  function reset() {
    job.value = null
    artifacts.value = []
    error.value = null
  }

  function removeArtifact(artifactId: string) {
    artifacts.value = artifacts.value.filter(artifact => artifact.id !== artifactId)
  }

  return { running, uploading, job, artifacts, error, run, cancel, reset, removeArtifact }
}

/**
 * Runtime facade for the UI: which destination options to offer and the size
 * limits to show next to the dropzone.
 */
const OUTPUT_PATH_STORAGE_KEY = 'document_studio:custom_output_dir'

export function useDocumentRuntime() {
  const api = useDocumentApi()
  const capabilities = ref<DocumentRuntimeCapabilities | null>(null)
  const outputPath = ref('')
  const connectionError = ref<string | null>(null)

  async function load() {
    try {
      const catalog = await api.operations()
      capabilities.value = catalog.capabilities
      connectionError.value = null
    } catch (caught) {
      capabilities.value = null
      // A missing or mismatched shared secret is a device setup problem, not
      // a broken page: keep the code so the UI can point at the Hub settings
      // instead of showing an empty catalogue with no explanation.
      connectionError.value = (caught as DocumentErrorPayload)?.code || 'DOCUMENT_STORAGE_UNAVAILABLE'
    }
    try {
      const settings = await api.settings()
      const saved = typeof window !== 'undefined' ? localStorage.getItem(OUTPUT_PATH_STORAGE_KEY) : null
      outputPath.value = saved || settings.defaultOutputPath
    } catch {
      outputPath.value = ''
    }
  }

  function setOutputPath(path: string) {
    outputPath.value = path
    if (typeof window !== 'undefined') {
      if (path) {
        localStorage.setItem(OUTPUT_PATH_STORAGE_KEY, path)
      } else {
        localStorage.removeItem(OUTPUT_PATH_STORAGE_KEY)
      }
    }
  }

  const isLocal = computed(() => {
    const runtime = capabilities.value?.runtime
    return runtime === 'local' || runtime === 'electron'
  })

  const destinationLabel = computed(() => {
    if (!capabilities.value) return ''
    if (capabilities.value.requiresDownloadDelivery) return 'download'
    return 'output-folder'
  })

  const needsSetup = computed(() => isDocumentConnectionError(connectionError.value))

  return { capabilities, outputPath, isLocal, destinationLabel, connectionError, needsSetup, load, setOutputPath }
}
