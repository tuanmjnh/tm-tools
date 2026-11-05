import type { Ref } from 'vue'
import type { PdfDirectoryListing, PdfFileArea, PdfFileInfo, PdfFolderInfo, PdfFolderTreeNode } from '#shared/types/pdf'

export function usePdfDirectory(areaInput: Ref<PdfFileArea> | PdfFileArea) {
  const areaRef = isRef(areaInput) ? areaInput : ref(areaInput)
  const currentFolder = ref('')
  const directoryListing = ref<PdfDirectoryListing | null>(null)
  const dirLoading = ref(false)

  // Modal states for folder CRUD
  const folderModalOpen = ref(false)
  const folderTarget = ref<{ parent: string, area: PdfFileArea }>({ parent: '', area: areaRef.value })

  const renameModalOpen = ref(false)
  const renameTarget = ref<{ path: string, name: string, isFolder: boolean, area: PdfFileArea } | null>(null)

  const trashOpen = ref(false)

  const {
    getDirectory,
    getExplorerTrees,
    getExplorerChildren,
    createFolder,
    renameItem,
    deleteItem
  } = usePdfStudio()

  /** Children fetched when a lazy tree node expands, keyed by relative path. */
  const loadedChildren = ref<Record<string, PdfFolderTreeNode[]>>({})
  /** Complete tree, fetched only while a folder search needs deep matching. */
  const deepTree = ref<PdfFolderTreeNode[] | null>(null)

  async function loadDirectory(folder = '') {
    currentFolder.value = folder
    dirLoading.value = true
    try {
      const res = await getDirectory(areaRef.value, folder)
      directoryListing.value = res
      loadedChildren.value = {}
      deepTree.value = null
    } finally {
      dirLoading.value = false
    }
  }

  async function expandFolder(relativePath: string) {
    if (deepTree.value || loadedChildren.value[relativePath]) return
    try {
      loadedChildren.value = {
        ...loadedChildren.value,
        [relativePath]: await getExplorerChildren(areaRef.value, relativePath)
      }
    } catch {
      loadedChildren.value = { ...loadedChildren.value, [relativePath]: [] }
    }
  }

  async function searchFolders(term: string) {
    if (term && !deepTree.value) {
      try {
        deepTree.value = (await getExplorerTrees(true))[areaRef.value] ?? []
      } catch {
        deepTree.value = null
      }
      return
    }
    if (!term) deepTree.value = null
  }

  function openCreateFolderModal(parentFolder = currentFolder.value, area = areaRef.value) {
    folderTarget.value = { parent: parentFolder, area }
    folderModalOpen.value = true
  }

  async function handleCreateFolder(name: string) {
    const target = folderTarget.value
    await createFolder(target.area, target.parent, name)
    if (target.area === areaRef.value) await loadDirectory(currentFolder.value)
  }

  function openRenameModal(
    item: { name: string, relativePath?: string, path?: string },
    isFolder: boolean,
    area = areaRef.value
  ) {
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
    await renameItem(target.area, target.path, newName)
    if (target.area === areaRef.value) await loadDirectory(currentFolder.value)
  }

  async function handleDelete(path: string, area = areaRef.value) {
    await deleteItem(area, path)
    if (area === areaRef.value) await loadDirectory(currentFolder.value)
  }

  const folderTargetParent = computed(() => folderTarget.value.parent)
  const folders = computed<PdfFolderInfo[]>(() => directoryListing.value?.folders ?? [])
  const files = computed<PdfFileInfo[]>(() => directoryListing.value?.files ?? [])

  function mergeChildren(nodes: PdfFolderTreeNode[], complete: boolean): PdfFolderTreeNode[] {
    return nodes.map((node) => {
      const children = complete
        ? node.children
        : (loadedChildren.value[node.relativePath] ?? node.children)
      return { ...node, children: children?.length ? mergeChildren(children, complete) : undefined }
    })
  }

  const tree = computed<PdfFolderTreeNode[]>(() => {
    if (deepTree.value) return deepTree.value
    return mergeChildren(directoryListing.value?.tree ?? [], false)
  })
  const breadcrumbs = computed(() => directoryListing.value?.breadcrumbs ?? [])
  const parentFolder = computed(() => directoryListing.value?.parentFolder ?? null)

  return {
    area: areaRef,
    currentFolder,
    directoryListing,
    dirLoading,
    folders,
    files,
    tree,
    breadcrumbs,
    parentFolder,
    folderModalOpen,
    folderTargetParent,
    renameModalOpen,
    renameTarget,
    trashOpen,
    loadDirectory,
    expandFolder,
    searchFolders,
    openCreateFolderModal,
    handleCreateFolder,
    openRenameModal,
    handleRename,
    handleDelete
  }
}
