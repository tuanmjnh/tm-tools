import type { DocumentOperationDefinition, SelectedDocumentFile } from '#shared/types/document'
import { extensionOf } from '~/utils/documentStudio'

/**
 * Owns the Choose step: the picked files, their validation state and the
 * reorder/remove actions. Files stay client-side until a job is created, and
 * the raw `File` objects live outside the reactive state so Vue does not proxy
 * megabytes of user data.
 */
export function useDocumentFiles(operation: MaybeRefOrGetter<DocumentOperationDefinition | null | undefined>) {
  const files = ref<SelectedDocumentFile[]>([])
  const blobs = new Map<string, File>()
  let counter = 0

  const spec = computed(() => toValue(operation) ?? null)
  const accept = computed(() => spec.value?.input.acceptedExtensions.map(ext => `.${ext}`).join(',') ?? '')
  const ordered = computed(() => spec.value?.input.ordered ?? false)
  const maxFiles = computed(() => spec.value?.batch?.maxFiles ?? spec.value?.input.maxFiles ?? 1)

  function describe(file: File, status: SelectedDocumentFile['status'], errorCode?: SelectedDocumentFile['errorCode']): SelectedDocumentFile {
    return {
      id: `file-${counter++}`,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      extension: extensionOf(file.name),
      origin: 'device',
      status,
      errorCode
    }
  }

  function add(incoming: File[]) {
    const accepted = spec.value?.input.acceptedExtensions ?? []
    const next: SelectedDocumentFile[] = []
    let room = Math.max(0, maxFiles.value - files.value.length)
    let overflow = 0

    for (const file of incoming) {
      if (!accepted.includes(extensionOf(file.name))) {
        next.push(describe(file, 'invalid', 'DOCUMENT_INPUT_TYPE_NOT_SUPPORTED'))
        continue
      }
      if (room === 0) {
        overflow++
        continue
      }
      const entry = describe(file, 'selected')
      blobs.set(entry.id, file)
      next.push(entry)
      room--
    }

    files.value = [...files.value, ...next]
    return overflow
  }

  function remove(id: string) {
    files.value = files.value.filter(entry => entry.id !== id)
    blobs.delete(id)
  }

  function clear() {
    files.value = []
    blobs.clear()
  }

  function move(from: number, to: number) {
    if (!ordered.value || to < 0 || to >= files.value.length) return
    const next = [...files.value]
    const [entry] = next.splice(from, 1)
    if (!entry) return
    next.splice(to, 0, entry)
    files.value = next
  }

  function uploadPayload(): File[] {
    return files.value
      .filter(entry => entry.status === 'selected')
      .flatMap((entry) => {
        const file = blobs.get(entry.id)
        return file ? [file] : []
      })
  }

  const valid = computed(() => files.value.filter(entry => entry.status === 'selected'))
  const invalid = computed(() => files.value.filter(entry => entry.status === 'invalid'))
  const totalBytes = computed(() => valid.value.reduce((total, entry) => total + entry.size, 0))
  const ready = computed(() => {
    const current = spec.value
    if (!current) return false
    const cap = current.batch?.maxFiles ?? current.input.maxFiles
    return valid.value.length >= current.input.minFiles
      && valid.value.length <= cap
      && invalid.value.length === 0
  })

  return {
    files,
    accept,
    ordered,
    valid,
    invalid,
    totalBytes,
    ready,
    add,
    remove,
    clear,
    move,
    uploadPayload
  }
}
