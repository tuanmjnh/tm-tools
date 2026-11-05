import type {
  PdfDirectoryListing,
  PdfExportFormatResult,
  PdfExtractJobState,
  PdfExtractJobSummary,
  PdfFileInfo,
  PdfFolderInfo,
  PdfFolderTreeNode,
  PdfLibrary,
  PdfSourceExportFormat,
  PdfTrashItem,
  PdfWorkspaceRepair,
  PdfWorkspaceReport
} from '#shared/types/pdf'
import { PDF_ERROR_KEYS, type PdfFileArea } from '~/utils/pdfStudio'

interface PdfResponse<T> {
  success: boolean
  data: T
}

function pdfUrl(path: string): string {
  return `/api/v1/pdf${path}`
}

function segment(name: string): string {
  return encodeURIComponent(name)
}

export function usePdfStudio() {
  const { t } = useI18n()
  const notify = useNotify()

  const library = ref<PdfLibrary | null>(null)
  const jobs = ref<PdfExtractJobState[]>([])
  const trashItems = ref<PdfTrashItem[]>([])
  const loading = ref(false)
  const busy = ref<string | null>(null)

  function errorText(error: unknown): string {
    const code = typeof error === 'string'
      ? error
      : (error as { statusMessage?: string, data?: { statusMessage?: string, message?: string } })?.data?.statusMessage
        || (error as { statusMessage?: string })?.statusMessage
        || ''
    const key = PDF_ERROR_KEYS[code]
    return key ? t(key) : t('pdf.errors.generic')
  }

  function fail(action: string, error: unknown) {
    notify.error(t(`pdf.actions.${action}`), errorText(error))
  }

  async function run<T>(action: string, task: () => Promise<T>): Promise<T | null> {
    busy.value = action
    try {
      return await task()
    } catch (error) {
      fail(action, error)
      return null
    } finally {
      busy.value = null
    }
  }

  /** Upload replies carry an `overwritten` flag so a replaced file is not silent. */
  function notifySaved(action: string, notice: string, saved: PdfFileInfo[]): void {
    const replaced = saved.filter(file => file.overwritten)
    if (!replaced.length) {
      notify.success(t(`pdf.actions.${action}`), t(notice, { count: saved.length }))
      return
    }
    const names = replaced.slice(0, 3).map(file => file.name).join(', ')
    notify.warning(t(`pdf.actions.${action}`), t('pdf.notices.overwritten', {
      count: saved.length,
      replaced: replaced.length,
      names: replaced.length > 3 ? `${names}…` : names
    }))
  }

  async function refreshLibrary(): Promise<PdfLibrary | null> {
    const res = await $fetch<PdfResponse<PdfLibrary>>(pdfUrl('/library'))
    library.value = res.data
    return res.data
  }

  async function refreshJobs(): Promise<PdfExtractJobState[]> {
    const res = await $fetch<PdfResponse<PdfExtractJobState[]>>(pdfUrl('/extract/jobs'))
    jobs.value = res.data
    return res.data
  }

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      await Promise.all([refreshLibrary(), refreshJobs()])
    } catch (error) {
      fail('refresh', error)
    } finally {
      loading.value = false
    }
  }

  async function upload(files: File[], folder = ''): Promise<boolean> {
    const limit = library.value?.maxUploadMb
    const oversized = limit ? files.find(file => file.size > limit * 1024 * 1024) : undefined
    if (oversized) {
      notify.error(t('pdf.actions.upload'), t('pdf.errors.tooLarge'))
      return false
    }

    const body = new FormData()
    if (folder) body.append('folder', folder)
    for (const file of files) body.append('files', file)

    const result = await run('upload', async () => {
      const res = await $fetch<PdfResponse<PdfFileInfo[]>>(pdfUrl('/upload'), { method: 'POST', body })
      await refreshLibrary()
      return res.data
    })
    if (result) notifySaved('upload', 'pdf.notices.uploaded', result)
    return Boolean(result)
  }

  /** Uploads the non-PDF inputs (docx / xlsx / csv / json / xml / images). */
  async function uploadInputs(files: File[], folder = ''): Promise<boolean> {
    const limit = library.value?.maxUploadMb
    const oversized = limit ? files.find(file => file.size > limit * 1024 * 1024) : undefined
    if (oversized) {
      notify.error(t('pdf.actions.uploadInput'), t('pdf.errors.tooLarge'))
      return false
    }

    const body = new FormData()
    if (folder) body.append('folder', folder)
    for (const file of files) body.append('files', file)

    const result = await run('uploadInput', async () => {
      const res = await $fetch<PdfResponse<PdfFileInfo[]>>(pdfUrl('/inputs/upload'), { method: 'POST', body })
      await refreshLibrary()
      return res.data
    })
    if (result) notifySaved('uploadInput', 'pdf.notices.inputsUploaded', result)
    return Boolean(result)
  }

  async function removeInput(name: string): Promise<boolean> {
    const result = await run('removeInput', async () => {
      await $fetch(pdfUrl(`/inputs/${segment(name)}`), { method: 'DELETE' })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.removeInput'), t('pdf.notices.removed', { name }))
    return Boolean(result)
  }

  /** image / docx / xlsx / csv / json / xml → PDF, written to the merged folder. */
  async function convertInput(name: string, overwrite = true): Promise<PdfFileInfo | null> {
    const result = await run('convertInput', async () => {
      const res = await $fetch<PdfResponse<PdfFileInfo>>(pdfUrl(`/inputs/${segment(name)}/pdf`), {
        method: 'POST',
        body: { overwrite }
      })
      await refreshLibrary()
      return res.data
    })
    if (result) notify.success(t('pdf.actions.convertInput'), t('pdf.notices.convertDone', { name: result.name }))
    return result
  }

  /** PDF → png / docx / xlsx / csv / json / xml for one source. */
  async function exportSource(name: string, formats: PdfSourceExportFormat[], overwrite = true): Promise<PdfExportFormatResult[] | null> {
    const result = await run('exportSource', async () => {
      const res = await $fetch<PdfResponse<PdfExportFormatResult[]>>(pdfUrl(`/sources/${segment(name)}/export`), {
        method: 'POST',
        body: { formats, overwrite }
      })
      await refreshLibrary()
      return res.data
    })

    if (!result) return null
    const failed = result.filter(entry => !entry.ok)
    if (!failed.length) {
      notify.success(t('pdf.actions.exportSource'), t('pdf.notices.exportDone', { count: result.length }))
    } else {
      notify.warning(t('pdf.actions.exportSource'), t('pdf.notices.exportPartial', { ok: result.length - failed.length, failed: failed.length }))
    }
    return result
  }

  async function uploadWord(files: File[]): Promise<boolean> {
    const body = new FormData()
    for (const file of files) body.append('files', file)

    const result = await run('uploadWord', async () => {
      const res = await $fetch<PdfResponse<PdfFileInfo[]>>(pdfUrl('/word/upload'), { method: 'POST', body })
      await refreshLibrary()
      return res.data
    })
    if (result) notifySaved('uploadWord', 'pdf.notices.uploaded', result)
    return Boolean(result)
  }

  /** Word→PDF creates a normal source, so split/rasterize/extract work on it. */
  async function wordToPdf(name: string, overwrite = true): Promise<boolean> {
    const result = await run('wordToPdf', async () => {
      await $fetch(pdfUrl(`/word/${segment(name)}/pdf`), { method: 'POST', body: { overwrite } })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.wordToPdf'), t('pdf.notices.wordToPdfDone', { name }))
    return Boolean(result)
  }

  async function removeWord(name: string): Promise<boolean> {
    const result = await run('removeWord', async () => {
      await $fetch(pdfUrl(`/word/${segment(name)}`), { method: 'DELETE' })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.removeWord'), t('pdf.notices.removed', { name }))
    return Boolean(result)
  }

  async function removeOffice(name: string): Promise<boolean> {
    const result = await run('removeOffice', async () => {
      await $fetch(pdfUrl(`/office/${segment(name)}`), { method: 'DELETE' })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.removeOutput'), t('pdf.notices.removed', { name }))
    return Boolean(result)
  }

  async function splitSource(name: string, overwrite = true): Promise<boolean> {
    const result = await run('split', async () => {
      await $fetch(pdfUrl(`/sources/${segment(name)}/split`), { method: 'POST', body: { overwrite } })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.split'), t('pdf.notices.splitDone', { name }))
    return Boolean(result)
  }

  async function rasterizeSource(name: string, overwrite = true): Promise<boolean> {
    const result = await run('rasterize', async () => {
      await $fetch(pdfUrl(`/sources/${segment(name)}/images`), { method: 'POST', body: { overwrite } })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.rasterize'), t('pdf.notices.rasterizeDone', { name }))
    return Boolean(result)
  }

  async function removeSource(name: string): Promise<boolean> {
    const result = await run('removeSource', async () => {
      await $fetch(pdfUrl(`/sources/${segment(name)}`), { method: 'DELETE' })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.removeSource'), t('pdf.notices.removed', { name }))
    return Boolean(result)
  }

  async function mergeFolder(name: string, overwrite = true): Promise<boolean> {
    const result = await run('merge', async () => {
      await $fetch(pdfUrl(`/split/${segment(name)}/merge`), { method: 'POST', body: { overwrite } })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.merge'), t('pdf.notices.mergeDone', { name }))
    return Boolean(result)
  }

  async function removeSplitFolder(name: string): Promise<boolean> {
    const result = await run('removeFolder', async () => {
      await $fetch(pdfUrl(`/split/${segment(name)}`), { method: 'DELETE' })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.removeFolder'), t('pdf.notices.removed', { name }))
    return Boolean(result)
  }

  async function imagesToPdf(name: string, overwrite = true): Promise<boolean> {
    const result = await run('imagesToPdf', async () => {
      await $fetch(pdfUrl(`/images/${segment(name)}/pdf`), { method: 'POST', body: { overwrite } })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.imagesToPdf'), t('pdf.notices.imagesToPdfDone', { name }))
    return Boolean(result)
  }

  async function removeImagesFolder(name: string): Promise<boolean> {
    const result = await run('removeFolder', async () => {
      await $fetch(pdfUrl(`/images/${segment(name)}`), { method: 'DELETE' })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.removeFolder'), t('pdf.notices.removed', { name }))
    return Boolean(result)
  }

  async function removeMerged(name: string): Promise<boolean> {
    const result = await run('removeOutput', async () => {
      await $fetch(pdfUrl(`/merged/${segment(name)}`), { method: 'DELETE' })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.removeOutput'), t('pdf.notices.removed', { name }))
    return Boolean(result)
  }

  async function removeProduct(name: string): Promise<boolean> {
    const result = await run('removeOutput', async () => {
      await $fetch(pdfUrl(`/products/${segment(name)}`), { method: 'DELETE' })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.removeOutput'), t('pdf.notices.removed', { name }))
    return Boolean(result)
  }

  async function startExtraction(
    source: string,
    force = false,
    target?: { connectionId: string, model: string } | null,
    preset?: { preset: string, description: string, sample: string } | null,
    overwrite = true
  ): Promise<boolean> {
    const result = await run('extract', async () => {
      await $fetch(pdfUrl('/extract/start'), {
        method: 'POST',
        body: { source, force, overwrite, ...(target ?? {}), ...(preset ? { preset } : {}) }
      })
      await refreshJobs()
      return true
    })
    return Boolean(result)
  }

  async function cancelJob(id: string): Promise<boolean> {
    const result = await run('cancel', async () => {
      await $fetch(pdfUrl(`/extract/${segment(id)}/cancel`), { method: 'POST' })
      await refreshJobs()
      return true
    })
    if (result) notify.info(t('pdf.actions.cancel'), t('pdf.notices.cancelRequested'))
    return Boolean(result)
  }

  async function refreshTrash(): Promise<PdfTrashItem[]> {
    const res = await $fetch<PdfResponse<PdfTrashItem[]>>(pdfUrl('/trash'))
    trashItems.value = res.data
    return res.data
  }

  async function restoreTrash(id: string): Promise<boolean> {
    const result = await run('restoreTrash', async () => {
      await $fetch(pdfUrl('/trash/restore'), { method: 'POST', body: { id } })
      await Promise.all([refreshLibrary(), refreshTrash()])
      return true
    })
    if (result) notify.success(t('pdf.actions.restore'), t('pdf.notices.restored'))
    return Boolean(result)
  }

  async function deleteTrashPermanent(id: string): Promise<boolean> {
    const result = await run('deleteTrashPermanent', async () => {
      await $fetch(pdfUrl(`/trash/${segment(id)}`), { method: 'DELETE' })
      await refreshTrash()
      return true
    })
    if (result) notify.success(t('pdf.actions.deletePermanent'), t('pdf.notices.deletedPermanent'))
    return Boolean(result)
  }

  async function emptyAllTrash(): Promise<boolean> {
    const result = await run('emptyTrash', async () => {
      await $fetch(pdfUrl('/trash/empty'), { method: 'DELETE' })
      await refreshTrash()
      return true
    })
    if (result) notify.success(t('pdf.actions.emptyTrash'), t('pdf.notices.trashEmptied'))
    return Boolean(result)
  }

  async function getDirectory(area: PdfFileArea, folder = ''): Promise<PdfDirectoryListing | null> {
    const folderParam = folder ? `&folder=${encodeURIComponent(folder)}` : ''
    const res = await $fetch<PdfResponse<PdfDirectoryListing>>(pdfUrl(`/directory?area=${area}${folderParam}`))
    return res.data
  }

  /**
   * Area folder trees for the explorer: first level by default, or the complete
   * trees when `deep` is set and a search needs to match nested folders.
   */
  async function getExplorerTrees(deep = false): Promise<Record<PdfFileArea, PdfFolderTreeNode[]>> {
    const res = await $fetch<PdfResponse<Record<PdfFileArea, PdfFolderTreeNode[]>>>(pdfUrl(`/explorer${deep ? '?depth=full' : ''}`))
    return res.data
  }

  /** Subfolders of one folder, fetched when a lazy tree node expands. */
  async function getExplorerChildren(area: PdfFileArea, folder: string): Promise<PdfFolderTreeNode[]> {
    const folderParam = folder ? `&folder=${encodeURIComponent(folder)}` : ''
    const res = await $fetch<PdfResponse<PdfFolderTreeNode[]>>(pdfUrl(`/explorer/children?area=${area}${folderParam}`))
    return res.data
  }

  /** Read-only integrity snapshot of every workspace area. */
  async function getWorkspaceReport(): Promise<PdfWorkspaceReport> {
    const res = await $fetch<PdfResponse<PdfWorkspaceReport>>(pdfUrl('/workspace'))
    return res.data
  }

  /** Recreates missing area roots; nothing is deleted or moved. */
  async function repairWorkspace(): Promise<PdfWorkspaceRepair | null> {
    const result = await run('repairWorkspace', async () => {
      const res = await $fetch<PdfResponse<PdfWorkspaceRepair>>(pdfUrl('/workspace/repair'), { method: 'POST' })
      return res.data
    })
    if (result) notify.success(t('pdf.actions.repairWorkspace'), t('pdf.notices.workspaceRepaired', { count: result.created.length }))
    return result
  }

  async function createFolder(area: PdfFileArea, folder: string, name: string): Promise<PdfFolderInfo | null> {
    const result = await run('createFolder', async () => {
      const res = await $fetch<PdfResponse<PdfFolderInfo>>(pdfUrl('/directory/folder'), {
        method: 'POST',
        body: { area, folder, name }
      })
      await refreshLibrary()
      return res.data
    })
    if (result) notify.success(t('pdf.actions.createFolder'), t('pdf.notices.folderCreated', { name }))
    return result
  }

  async function renameItem(area: PdfFileArea, path: string, newName: string): Promise<boolean> {
    const result = await run('renameItem', async () => {
      await $fetch(pdfUrl('/directory/rename'), {
        method: 'PATCH',
        body: { area, path, newName }
      })
      await refreshLibrary()
      return true
    })
    if (result) notify.success(t('pdf.actions.rename'), t('pdf.notices.renamed', { name: newName }))
    return Boolean(result)
  }

  async function deleteItem(area: PdfFileArea, path: string): Promise<boolean> {
    const result = await run('deleteItem', async () => {
      await $fetch(pdfUrl('/directory/delete'), {
        method: 'POST',
        body: { area, path }
      })
      await Promise.all([refreshLibrary(), refreshTrash()])
      return true
    })
    if (result) notify.success(t('pdf.actions.delete'), t('pdf.notices.movedToTrash'))
    return Boolean(result)
  }

  function jobDetail(id: string): Promise<PdfExtractJobSummary> {
    return $fetch<PdfResponse<PdfExtractJobSummary>>(pdfUrl(`/extract/${segment(id)}`)).then(res => res.data)
  }

  return {
    library,
    jobs,
    trashItems,
    loading,
    busy,
    refresh,
    refreshLibrary,
    refreshJobs,
    refreshTrash,
    restoreTrash,
    deleteTrashPermanent,
    emptyAllTrash,
    getDirectory,
    getExplorerTrees,
    getExplorerChildren,
    getWorkspaceReport,
    repairWorkspace,
    createFolder,
    renameItem,
    deleteItem,
    upload,
    uploadInputs,
    removeInput,
    convertInput,
    exportSource,
    uploadWord,
    wordToPdf,
    removeWord,
    removeOffice,
    splitSource,
    rasterizeSource,
    removeSource,
    mergeFolder,
    removeSplitFolder,
    imagesToPdf,
    removeImagesFolder,
    removeMerged,
    removeProduct,
    startExtraction,
    cancelJob,
    jobDetail,
    errorText
  }
}
