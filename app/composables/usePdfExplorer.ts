import type { Ref } from 'vue'
import type { PdfDirectoryListing, PdfFileArea, PdfFileInfo, PdfFolderInfo, PdfFolderTreeNode, PdfLibrary } from '#shared/types/pdf'

/** The two roots the explorer shows; tool output folders live below `output/`. */
export const PDF_EXPLORER_AREAS: PdfFileArea[] = ['input', 'output']

/** What the list holds while that area is active, so no page captions a foreign area. */
const AREA_DESCRIPTION_KEYS: Record<PdfFileArea, string> = {
  input: 'pdf.library.description',
  output: 'pdf.library.outputDesc'
}

interface AreaRule {
  files: boolean
  folders: boolean
}

/**
 * Explorer state shared by the library and every tool page: one active folder,
 * the seven area roots, lazy children and the server-decided permissions.
 */
export function usePdfExplorer(library?: Ref<PdfLibrary | null>) {
  const { t } = useI18n()
  const { getDirectory, getExplorerTrees, getExplorerChildren, getWorkspaceReport, createFolder, renameItem, deleteItem } = usePdfStudio()

  const activeArea = ref<PdfFileArea>('input')
  const currentFolder = ref('')
  const directoryListing = ref<PdfDirectoryListing | null>(null)
  const loading = ref(false)

  const explorerTrees = ref<Partial<Record<PdfFileArea, PdfFolderTreeNode[]>>>({})
  const loadedChildren = ref<Record<string, PdfFolderTreeNode[]>>({})
  const deepTrees = ref<Partial<Record<PdfFileArea, PdfFolderTreeNode[]>> | null>(null)
  const areaRules = ref<Partial<Record<PdfFileArea, AreaRule>>>({})
  /** Absolute on-disk root of each area, for "show in folder" on desktop. */
  const areaRoots = ref<Partial<Record<PdfFileArea, string>>>({})
  /** Server `outputMapping`: tool key → folder below `output/`. */
  const outputMapping = ref<Record<string, string>>({})

  const folderModalOpen = ref(false)
  const folderTarget = ref<{ parent: string, area: PdfFileArea }>({ parent: '', area: 'input' })
  const renameModalOpen = ref(false)
  const renameTarget = ref<{ path: string, name: string, isFolder: boolean, area: PdfFileArea } | null>(null)
  const trashOpen = ref(false)

  const folders = computed<PdfFolderInfo[]>(() => directoryListing.value?.folders ?? [])
  const files = computed<PdfFileInfo[]>(() => directoryListing.value?.files ?? [])
  const breadcrumbs = computed(() => directoryListing.value?.breadcrumbs ?? [])
  const parentFolder = computed(() => directoryListing.value?.parentFolder ?? null)

  /** Server registry decides what each area allows; the client never re-decides. */
  function rules(area: PdfFileArea): AreaRule {
    return areaRules.value[area] ?? { files: true, folders: true }
  }

  const foldersWritable = computed(() => rules(activeArea.value).folders)
  const fileDeletable = computed(() => rules(activeArea.value).files)
  const selectedKey = computed(() => `${activeArea.value}:${currentFolder.value}`)
  const folderTargetParent = computed(() => folderTarget.value.parent)
  const areaDescription = computed(() => t(AREA_DESCRIPTION_KEYS[activeArea.value]))

  function withArea(nodes: PdfFolderTreeNode[], area: PdfFileArea): PdfFolderTreeNode[] {
    return nodes.map((node) => {
      // A deep tree is already complete; lazy children only fill shallow nodes.
      const children = deepTrees.value ? node.children : (loadedChildren.value[`${area}:${node.relativePath}`] ?? node.children)
      return {
        ...node,
        id: `${area}:${node.relativePath}`,
        area,
        children: children?.length ? withArea(children, area) : undefined
      }
    })
  }

  const areaCounts = computed<Record<PdfFileArea, number>>(() => {
    const current = library?.value
    return {
      input: current?.input.length ?? 0,
      output: current?.output.reduce((total, folder) => total + folder.fileCount, 0) ?? 0
    }
  })

  const tree = computed<PdfFolderTreeNode[]>(() => PDF_EXPLORER_AREAS.map((area) => {
    const children = withArea((deepTrees.value ?? explorerTrees.value)[area] ?? [], area)
    return {
      id: `${area}:`,
      label: t(`pdf.areas.${area}`),
      path: '',
      relativePath: '',
      fileCount: areaCounts.value[area],
      area,
      system: true,
      readonly: !rules(area).folders,
      children: children.length ? children : undefined
    }
  }))

  /** Last request wins: a slow folder must not overwrite the one opened after it. */
  let requestSeq = 0

  async function loadDirectory(folder = '', area = activeArea.value) {
    const seq = ++requestSeq
    loading.value = true
    try {
      const listing = await getDirectory(area, folder)
      if (seq === requestSeq) directoryListing.value = listing
      return listing
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }

  async function select(folder: string, area?: PdfFileArea) {
    const next = area ?? activeArea.value
    if (next !== activeArea.value) directoryListing.value = null
    activeArea.value = next
    currentFolder.value = folder ?? ''
    await loadDirectory(currentFolder.value, next)
  }

  async function reload() {
    await loadDirectory(currentFolder.value, activeArea.value)
    await Promise.all([loadExplorer(), loadRules()])
  }

  async function loadExplorer() {
    const opened = Object.keys(loadedChildren.value)
    try {
      explorerTrees.value = await getExplorerTrees()
    } catch {
      explorerTrees.value = {}
    }
    deepTrees.value = null
    // The shallow tree only carries the first level, so re-fetch the folders the
    // user had opened; otherwise they stay expanded around an empty list.
    const next: Record<string, PdfFolderTreeNode[]> = {}
    await Promise.all(opened.map(async (key) => {
      const split = key.indexOf(':')
      const area = key.slice(0, split) as PdfFileArea
      const path = key.slice(split + 1)
      try {
        next[key] = await getExplorerChildren(area, path)
      } catch {
        // Left out of `next` so the next expand retries instead of caching a
        // failure as "this folder is empty".
      }
    }))
    loadedChildren.value = next
  }

  async function expand(folder: { path: string, area?: PdfFileArea }) {
    const area = folder.area ?? activeArea.value
    const key = `${area}:${folder.path}`
    if (loadedChildren.value[key] || deepTrees.value) return
    try {
      loadedChildren.value = { ...loadedChildren.value, [key]: await getExplorerChildren(area, folder.path) }
    } catch {
      loadedChildren.value = { ...loadedChildren.value, [key]: [] }
    }
  }

  /** A search term must match folders below the first level, so switch to the deep tree. */
  async function searchFolders(term: string) {
    if (term && !deepTrees.value) {
      try {
        deepTrees.value = await getExplorerTrees(true)
      } catch {
        deepTrees.value = null
      }
      return
    }
    if (!term) deepTrees.value = null
  }

  async function loadRules() {
    try {
      const report = await getWorkspaceReport()
      const next: Partial<Record<PdfFileArea, AreaRule>> = {}
      for (const area of PDF_EXPLORER_AREAS) {
        const descriptor = report.areas.find(entry => entry.area === area)
        if (descriptor) next[area] = { files: descriptor.writableFiles, folders: descriptor.writableFolders }
      }
      areaRules.value = next
      areaRoots.value = Object.fromEntries(
        report.areas.map(area => [area.area, area.root])
      ) as Partial<Record<PdfFileArea, string>>
      outputMapping.value = report.outputMapping
    } catch {
      areaRules.value = {}
      areaRoots.value = {}
      outputMapping.value = {}
    }
  }

  /** Every tool writes into the single `output` root. */
  function outputArea(tool: string): PdfFileArea | null {
    return outputMapping.value[tool] ? 'output' : null
  }

  /** Subfolder of `output/` a tool writes into, e.g. `split` or `merged`. */
  function outputFolder(tool: string): string | null {
    return outputMapping.value[tool] ?? null
  }

  /** Files of one folder without moving the explorer there. */
  async function listFolder(area: PdfFileArea, folder = ''): Promise<PdfFileInfo[]> {
    try {
      const listing = await getDirectory(area, folder)
      return listing?.files ?? []
    } catch {
      return []
    }
  }

  /** Absolute path of a folder inside an area, so desktop can reveal it. */
  function absolutePath(area: PdfFileArea, relative = ''): string | undefined {
    const root = areaRoots.value[area]
    if (!root) return undefined
    if (!relative) return root
    return `${root.replace(/[\\/]+$/, '')}/${relative}`
  }

  /** Absolute path of a tool's output folder (`output/<tool folder>`). */
  function outputPath(tool: string): string | undefined {
    const folder = outputFolder(tool)
    return folder ? absolutePath('output', folder) : undefined
  }

  function openCreateFolder(parentFolderPath = currentFolder.value, area = activeArea.value) {
    if (!rules(area).folders) return
    folderTarget.value = { parent: parentFolderPath, area }
    folderModalOpen.value = true
  }

  async function handleCreateFolder(name: string) {
    const target = folderTarget.value
    const created = await createFolder(target.area, target.parent, name)
    if (!created) return
    await loadExplorer()
    if (target.area === activeArea.value) await loadDirectory(currentFolder.value, target.area)
  }

  function openRename(item: { name: string, relativePath?: string, path?: string }, isFolder: boolean, area = activeArea.value) {
    if (!rules(area).folders) return
    renameTarget.value = {
      name: item.name,
      path: item.relativePath || item.path || item.name,
      isFolder,
      area
    }
    renameModalOpen.value = true
  }

  async function handleRename(newName: string) {
    const target = renameTarget.value
    if (!target) return
    renameTarget.value = null
    const renamed = await renameItem(target.area, target.path, newName)
    if (!renamed) return
    await loadExplorer()
    if (target.area === activeArea.value) await loadDirectory(currentFolder.value, target.area)
  }

  async function removeItem(path: string, area = activeArea.value) {
    const removed = await deleteItem(area, path)
    if (!removed) return false
    await loadExplorer()
    if (area === activeArea.value) await loadDirectory(currentFolder.value, area)
    return true
  }

  return {
    activeArea,
    currentFolder,
    loading,
    folders,
    files,
    breadcrumbs,
    parentFolder,
    tree,
    selectedKey,
    areaDescription,
    foldersWritable,
    fileDeletable,
    folderModalOpen,
    folderTargetParent,
    renameModalOpen,
    renameTarget,
    trashOpen,
    outputArea,
    outputFolder,
    absolutePath,
    outputPath,
    listFolder,
    select,
    reload,
    expand,
    searchFolders,
    openCreateFolder,
    handleCreateFolder,
    openRename,
    handleRename,
    removeItem
  }
}
