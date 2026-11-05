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
    createFolder,
    renameItem,
    deleteItem
  } = usePdfStudio()

  async function loadDirectory(folder = '') {
    currentFolder.value = folder
    dirLoading.value = true
    try {
      const res = await getDirectory(areaRef.value, folder)
      directoryListing.value = res
    } finally {
      dirLoading.value = false
    }
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
  const tree = computed<PdfFolderTreeNode[]>(() => directoryListing.value?.tree ?? [])
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
    openCreateFolderModal,
    handleCreateFolder,
    openRenameModal,
    handleRename,
    handleDelete
  }
}
