import type {
  DocumentArtifactView,
  DocumentJobProgress,
  DocumentJobView,
  DocumentRuntimeCapabilities
} from '#shared/types/document'
import type { DocumentErrorPayload } from './useDocumentApi'
import { isDocumentConnectionError } from '~/utils/documentStudio'

export interface SingleDocumentJobOptions {
  operationId: string
  files: File[]
  config: Record<string, unknown>
  directUpload?: boolean
  inline?: boolean
  idempotencyKey?: string
  signal?: AbortSignal
  onJobId?: (id: string) => void
  onUploading?: (uploading: boolean) => void
  onProgress?: (progress: DocumentJobProgress) => void
}

/** The job record only advances while `start` is open, so read it on a timer. */
const PROGRESS_POLL_MS = 900

/**
 * Ref-free single-job lifecycle: create draft → stage bytes → start → return
 * the finished job and its artifacts. Throws the normalized `DOCUMENT_*`
 * payload on failure so callers (the reactive wrapper and the batch pool) can
 * decide how to surface it. Local posts multipart; cloud stages per signed plan.
 */
export async function runSingleDocumentJob(
  api: ReturnType<typeof useDocumentApi>,
  opts: SingleDocumentJobOptions
): Promise<{ job: DocumentJobView, artifacts: DocumentArtifactView[] }> {
  // One token per attempt: a retried POST returns this run's draft instead of
  // creating a second job, and the next user-initiated run gets a fresh one.
  const idempotencyKey = opts.idempotencyKey ?? crypto.randomUUID()

  // Ephemeral cloud: no storage outlives the request, so the run and its
  // result travel in a single call instead of create → upload → start.
  if (opts.inline) {
    opts.onUploading?.(true)
    try {
      const finished = await api.runInline(opts.operationId, opts.files, opts.config, opts.signal)
      return { job: finished, artifacts: finished.artifacts }
    } finally {
      opts.onUploading?.(false)
    }
  }

  const draft = await api.createJob(opts.operationId, opts.config, undefined, idempotencyKey, opts.signal)
  opts.onJobId?.(draft.id)

  opts.onUploading?.(true)

  let poll: ReturnType<typeof setInterval> | null = null

  /** `start` resolves only when the job is finished, so progress arrives out of band. */
  const pollProgress = () => {
    if (!opts.onProgress || poll) return
    poll = setInterval(() => {
      void api.job(draft.id)
        .then((view) => {
          const progress = view.progress
          if (progress.totalUnits > 0) opts.onProgress?.(progress)
        })
        .catch(() => {})
    }, PROGRESS_POLL_MS)
  }
  const stopPolling = () => {
    if (poll) {
      clearInterval(poll)
      poll = null
    }
  }
  try {
    if (!opts.directUpload) {
      await api.uploadInputs(draft.id, opts.files, opts.signal)
    } else {
      for (const file of opts.files) {
        const declared = await api.declareInput(draft.id, { name: file.name, size: file.size, type: file.type }, opts.signal)
        if (declared.plan.mode === 'form-post') {
          await api.uploadInputs(draft.id, [file], opts.signal)
          await api.completeInput(draft.id, declared.input.id, {}, opts.signal)
          continue
        }
        const completed = await api.uploadWithPlan(declared.plan, file)
        await api.completeInput(draft.id, declared.input.id, completed, opts.signal)
      }
    }
  } finally {
    opts.onUploading?.(false)
  }

  pollProgress()
  try {
    const finished = await api.startJob(draft.id, opts.signal)
    opts.onProgress?.(finished.progress)
    return { job: finished, artifacts: finished.artifacts }
  } finally {
    stopPolling()
  }
}

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
  /** Latest `completedUnits / totalUnits` of the running job, or null before one starts. */
  const progress = ref<DocumentJobProgress | null>(null)

  const progressPercent = computed(() => {
    const current = progress.value
    if (!current || current.totalUnits <= 0) return null
    return Math.min(100, Math.round((current.completedUnits / current.totalUnits) * 100))
  })

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
    progress.value = null

    try {
      const result = await runSingleDocumentJob(api, {
        ...options,
        onUploading: (value) => { uploading.value = value },
        onProgress: (value) => { progress.value = value }
      })
      job.value = result.job
      artifacts.value = result.artifacts
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
    progress.value = null
  }

  function removeArtifact(artifactId: string) {
    artifacts.value = artifacts.value.filter(artifact => artifact.id !== artifactId)
  }

  return { running, uploading, progress, progressPercent, job, artifacts, error, run, cancel, reset, removeArtifact }
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

  /** Output folder only: Activity and Settings need no catalogue probe. */
  async function loadSettings() {
    try {
      const settings = await api.settings()
      const saved = typeof window !== 'undefined' ? localStorage.getItem(OUTPUT_PATH_STORAGE_KEY) : null
      outputPath.value = saved || settings.defaultOutputPath
    } catch {
      outputPath.value = ''
    }
  }

  /**
   * `catalog` is passed by a page that already called `/operations`; without
   * it the same request would be issued twice per page mount.
   */
  async function load(catalog?: { capabilities: DocumentRuntimeCapabilities }) {
    if (catalog) {
      capabilities.value = catalog.capabilities
      connectionError.value = null
    } else {
      try {
        const fetched = await api.operations()
        capabilities.value = fetched.capabilities
        connectionError.value = null
      } catch (caught) {
        capabilities.value = null
        // A missing or mismatched shared secret is a device setup problem, not
        // a broken page: keep the code so the UI can point at the Hub settings
        // instead of showing an empty catalogue with no explanation.
        connectionError.value = (caught as DocumentErrorPayload)?.code || 'DOCUMENT_STORAGE_UNAVAILABLE'
      }
    }
    await loadSettings()
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

  return { capabilities, outputPath, isLocal, destinationLabel, connectionError, needsSetup, load, loadSettings, setOutputPath }
}
