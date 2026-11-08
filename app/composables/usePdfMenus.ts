import type { DropdownMenuItem } from '@nuxt/ui'
import { openPdfPreview, pdfFileUrl, type PdfFileArea } from '~/utils/pdfStudio'
import { isDesktopRuntime, openLocalPath, revealLocalPath } from '~/utils/desktop'

/** Workspace order used by the overview page and every context menu. */
export const PDF_WORKSPACES = [
  { key: 'library', to: '/pdf/library', icon: 'i-lucide-folder-open' },
  { key: 'split', to: '/pdf/split', icon: 'i-lucide-scissors' },
  { key: 'images', to: '/pdf/images', icon: 'i-lucide-images' },
  { key: 'export', to: '/pdf/export', icon: 'i-lucide-share-2' },
  { key: 'import', to: '/pdf/import', icon: 'i-lucide-file-input' },
  { key: 'extract', to: '/pdf/extract', icon: 'i-lucide-scan-text' }
] as const

export interface PdfFileMenuOptions {
  area: PdfFileArea
  name: string
  /** Area-relative identifier (`folder/file.pdf`) used for API calls. */
  relativePath?: string
  path?: string
  deletable?: boolean
  preview?: boolean
  download?: boolean
  /** Page-specific actions, shown above preview/download. */
  extra?: DropdownMenuItem[]
  onDelete?: () => void
  onRename?: () => void
}

/**
 * Builds the dropdown/context menus of the PDF workspaces. The same lists feed
 * the row "…" dropdown and the right-click menu, so both stay in sync.
 */
export function usePdfMenus() {
  const { t } = useI18n()
  const notify = useNotify()

  function downloadFile(area: PdfFileArea, name: string) {
    if (!import.meta.client) return
    const link = document.createElement('a')
    link.href = pdfFileUrl(area, name)
    link.download = name
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function copyText(value: string) {
    if (!import.meta.client) return
    const label = t('pdf.actions.copied')
    try {
      await navigator.clipboard.writeText(value)
      notify.success(label, value)
    } catch {
      notify.error(label, value)
    }
  }

  function fileItems(options: PdfFileMenuOptions): DropdownMenuItem[][] {
    const primary: DropdownMenuItem[] = [...(options.extra ?? [])]
    const id = options.relativePath || options.name

    if (options.preview !== false) {
      primary.push({
        label: t('pdf.actions.previewWindow'),
        icon: 'i-lucide-external-link',
        onSelect: () => openPdfPreview(options.area, id, options.path)
      })
    }
    if (options.download !== false) {
      primary.push({
        label: t('pdf.actions.download'),
        icon: 'i-lucide-download',
        onSelect: () => downloadFile(options.area, id)
      })
    }
    if (options.onRename) {
      primary.push({
        label: t('pdf.actions.rename'),
        icon: 'i-lucide-pencil',
        onSelect: options.onRename
      })
    }

    const groups: DropdownMenuItem[][] = primary.length ? [primary] : []

    const disk: DropdownMenuItem[] = []
    if (options.path && isDesktopRuntime()) {
      disk.push({
        label: t('pdf.actions.openFolder'),
        icon: 'i-lucide-folder-search',
        onSelect: () => revealLocalPath(options.path)
      })
      disk.push({
        label: t('pdf.actions.openFile'),
        icon: 'i-lucide-file-play',
        onSelect: () => openLocalPath(options.path)
      })
    }
    if (disk.length) groups.push(disk)

    const clipboard: DropdownMenuItem[] = [{
      label: t('pdf.actions.copyName'),
      icon: 'i-lucide-clipboard',
      onSelect: () => void copyText(options.name)
    }]
    const filePath = options.path
    if (filePath) {
      clipboard.push({
        label: t('pdf.actions.copyPath'),
        icon: 'i-lucide-clipboard-copy',
        onSelect: () => void copyText(filePath)
      })
    }
    groups.push(clipboard)

    if (options.deletable !== false && options.onDelete) {
      groups.push([{
        label: t('global.delete'),
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: options.onDelete
      }])
    }

    return groups
  }

  /** Folder row actions: open, reveal, copy path. */
  function folderItems(path?: string): DropdownMenuItem[] {
    const items: DropdownMenuItem[] = []
    if (path) {
      items.push({
        label: t('pdf.actions.openFolder'),
        icon: 'i-lucide-folder-open',
        onSelect: () => openLocalPath(path)
      })
      items.push({
        label: t('pdf.actions.revealFolder'),
        icon: 'i-lucide-folder-search',
        onSelect: () => revealLocalPath(path)
      })
      items.push({
        label: t('pdf.actions.copyPath'),
        icon: 'i-lucide-clipboard-copy',
        onSelect: () => void copyText(path)
      })
    }
    return items
  }

  /** Navigation entries for the page background menu. */
  function workspaceItems(current?: string): DropdownMenuItem[] {
    return PDF_WORKSPACES
      .filter(workspace => workspace.key !== current)
      .map(workspace => ({
        label: t(`pdf.workspaces.${workspace.key}.title`),
        icon: workspace.icon,
        onSelect: () => navigateTo(workspace.to)
      }))
  }

  function refreshItem(run: () => unknown): DropdownMenuItem {
    return {
      label: t('pdf.actions.refresh'),
      icon: 'i-lucide-refresh-cw',
      onSelect: () => void run()
    }
  }

  return { fileItems, folderItems, workspaceItems, refreshItem, downloadFile, copyText }
}
