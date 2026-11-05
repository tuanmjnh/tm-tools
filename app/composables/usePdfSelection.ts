import type { PdfDocumentRef, PdfSelection } from '#shared/types/pdf'
import type { PdfOperationId, PdfOperationInput } from '~/utils/pdfOperations'
import { pdfOperation } from '~/utils/pdfOperations'

/**
 * Active input for one operation, kept apart from the folder the explorer is
 * browsing: changing folders never clears it, and opening a preview never sets it.
 */
export function usePdfSelection(operationId: PdfOperationId) {
  const operation = pdfOperation(operationId)
  const selection = ref<PdfSelection | null>(null)

  /** The metadata calls a single input `single-file`; a ref calls it `file`. */
  function kindOf(mode: PdfOperationInput['mode']): PdfDocumentRef['kind'] {
    return mode === 'folder' ? 'folder' : 'file'
  }

  function compatible(ref: PdfDocumentRef): { ok: boolean, reason?: string } {
    if (ref.kind !== kindOf(operation.input.mode)) {
      return {
        ok: false,
        reason: ref.kind === 'folder' ? 'pdf.selection.needsFile' : 'pdf.selection.needsFolder'
      }
    }
    if (!operation.input.areas.includes(ref.area)) {
      return { ok: false, reason: 'pdf.selection.wrongArea' }
    }
    return { ok: true }
  }

  function pick(ref: PdfDocumentRef): boolean {
    if (!compatible(ref).ok) return false
    selection.value = { mode: ref.kind === 'folder' ? 'folder' : 'single-file', item: ref }
    return true
  }

  function pickFile(ref: Omit<PdfDocumentRef, 'kind'>): boolean {
    return pick({ ...ref, kind: 'file' })
  }

  function pickFolder(ref: Omit<PdfDocumentRef, 'kind'>): boolean {
    return pick({ ...ref, kind: 'folder' })
  }

  function clear() {
    selection.value = null
  }

  const isValid = computed(() => Boolean(selection.value && compatible(selection.value.item).ok))

  return { selection, pickFile, pickFolder, clear, compatible, isValid }
}
