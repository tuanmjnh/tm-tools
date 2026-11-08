export type DocumentLibraryRoot = 'input' | 'output'

export interface DocumentLibraryItem {
  name: string
  relativePath: string
  root: DocumentLibraryRoot
  isFolder: boolean
  size: number
  fileCount?: number
  mimeType?: string
  modifiedAt: string
}

export function useDocumentLibrary() {
  const root = ref<DocumentLibraryRoot>('input')
  const currentFolder = ref('')
  const items = ref<DocumentLibraryItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const breadcrumbs = computed(() => {
    const parts = currentFolder.value ? currentFolder.value.split('/') : []
    const trail = [{ name: root.value === 'input' ? 'Input' : 'Output', path: '' }]
    let accum = ''
    for (const part of parts) {
      accum = accum ? `${accum}/${part}` : part
      trail.push({ name: part, path: accum })
    }
    return trail
  })

  async function load(newFolder?: string) {
    if (newFolder !== undefined) currentFolder.value = newFolder
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ success: boolean, data: { items: DocumentLibraryItem[] } }>('/api/v1/documents/library', {
        params: {
          root: root.value,
          folder: currentFolder.value
        }
      })
      items.value = res.data?.items || []
    } catch (e: any) {
      error.value = e?.message || 'Failed to load library'
      items.value = []
    } finally {
      loading.value = false
    }
  }

  async function createFolder(name: string) {
    await $fetch('/api/v1/documents/library', {
      method: 'POST',
      query: { root: root.value },
      body: {
        action: 'createFolder',
        parentFolder: currentFolder.value,
        name
      }
    })
    await load()
  }

  async function deleteItem(path: string) {
    await $fetch('/api/v1/documents/library', {
      method: 'POST',
      query: { root: root.value },
      body: {
        action: 'delete',
        path
      }
    })
    await load()
  }

  async function renameItem(path: string, newName: string) {
    await $fetch('/api/v1/documents/library', {
      method: 'POST',
      query: { root: root.value },
      body: {
        action: 'rename',
        path,
        newName
      }
    })
    await load()
  }

  function navigateToFolder(path: string) {
    load(path)
  }

  function setRoot(newRoot: DocumentLibraryRoot) {
    root.value = newRoot
    currentFolder.value = ''
    load('')
  }

  return {
    root,
    currentFolder,
    items,
    loading,
    error,
    breadcrumbs,
    load,
    setRoot,
    navigateToFolder,
    createFolder,
    deleteItem,
    renameItem
  }
}
