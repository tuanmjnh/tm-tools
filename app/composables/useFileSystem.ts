import type { DialogArgs, FileOptions, FileNode } from '~/types'

function dialogApi() {
  return window.electronAPI?.dialog
}

function fileApi() {
  return window.electronAPI?.fileManager
}

export function useFileSystem() {
  const isElectron = computed(() => !!window.electronAPI?.isElectron)

  // ===== Dialog (file/folder pickers) =====
  function saveLastDir(pickedPath: string, isFolder = false) {
    let dir = pickedPath.replace(/\\/g, '/')
    if (!isFolder) {
      const lastSlash = dir.lastIndexOf('/')
      if (lastSlash > -1) {
        dir = dir.substring(0, lastSlash)
      }
    }
    if (dir) {
      localStorage.setItem('last_selected_dir', dir)
    }
  }

  async function selectFiles(args?: DialogArgs): Promise<string[] | null> {
    return dialogApi()?.openFile(args) ?? null
  }

  async function selectFolder(args?: DialogArgs): Promise<string[] | null> {
    return dialogApi()?.openFolder(args) ?? null
  }

  async function selectSaveFile(args?: DialogArgs): Promise<string | null> {
    let defaultPath = args?.defaultPath
    if (defaultPath) {
      const lastSlash = defaultPath.replace(/\\/g, '/').lastIndexOf('/')
      if (lastSlash > -1 && defaultPath.includes('.')) {
        defaultPath = defaultPath.substring(0, lastSlash)
      }
    }
    if (!defaultPath) {
      defaultPath = localStorage.getItem('last_selected_dir') || undefined
    }
    const picked = await dialogApi()?.saveFile({ ...args, defaultPath }) ?? null
    if (picked) {
      saveLastDir(picked, false)
    }
    return picked
  }

  async function pickFile(options: { title?: string, filters?: DialogArgs['filters'], multiSelections?: boolean, defaultPath?: string } = {}) {
    let defaultPath = options.defaultPath
    if (defaultPath) {
      const lastSlash = defaultPath.replace(/\\/g, '/').lastIndexOf('/')
      if (lastSlash > -1 && defaultPath.includes('.')) {
        defaultPath = defaultPath.substring(0, lastSlash)
      }
    }
    if (!defaultPath) {
      defaultPath = localStorage.getItem('last_selected_dir') || undefined
    }
    const paths = await selectFiles({ title: options.title, filters: options.filters, multiSelections: options.multiSelections, defaultPath })
    const picked = paths?.length ? paths[0] : ''
    if (picked) {
      saveLastDir(picked, false)
    }
    if (options.multiSelections) return paths ?? []
    return picked
  }

  async function pickFolder(options: { title?: string, defaultPath?: string } = {}) {
    const defaultPath = options.defaultPath || localStorage.getItem('last_selected_dir') || undefined
    const paths = await selectFolder({ title: options.title, defaultPath })
    const picked = paths?.length ? paths[0] : ''
    if (picked) {
      saveLastDir(picked, true)
    }
    return picked
  }

  // ===== File read/write =====
  async function readText(filePath: string, encoding = 'utf-8'): Promise<string> {
    return fileApi()?.read(filePath, encoding) ?? ''
  }

  async function writeText(args: { filePath: string, data: string, encoding?: string }): Promise<void> {
    await fileApi()?.write(args)
  }

  async function appendText(args: { filePath: string, data: string, encoding?: string }): Promise<void> {
    await fileApi()?.append(args)
  }

  async function fileExists(filePath: string): Promise<boolean> {
    return fileApi()?.exists(filePath) ?? false
  }

  async function deleteFile(filePath: string): Promise<void> {
    await fileApi()?.delete(filePath)
  }

  async function readJSON<T>(filePath: string): Promise<T | null> {
    return (fileApi()?.readJSON(filePath) as Promise<T | null>) ?? null
  }

  async function writeJSON<T>(filePath: string, obj: T, space = 2): Promise<void> {
    await fileApi()?.writeJSON({ filePath, obj, space })
  }

  async function createFolder(dirPath: string): Promise<void> {
    await fileApi()?.createFolder(dirPath)
  }

  async function rename(oldPath: string, newPath: string): Promise<void> {
    await fileApi()?.rename({ oldPath, newPath })
  }

  async function copyFile(src: string, dest: string): Promise<void> {
    await fileApi()?.copyFile({ src, dest })
  }

  async function copyFolder(src: string, dest: string): Promise<void> {
    await fileApi()?.copyFolder({ src, dest })
  }

  // ===== Tree / list =====
  async function getTree(dirPath: string, options?: FileOptions): Promise<FileNode | null> {
    return fileApi()?.getTree({ dirPath, options }) ?? null
  }

  async function listFiles(dirPath: string, options?: FileOptions): Promise<FileNode[]> {
    return fileApi()?.listFiles({ dirPath, options }) ?? []
  }

  async function listFolders(dirPath: string, options?: FileOptions): Promise<FileNode[]> {
    return fileApi()?.listFolders({ dirPath, options }) ?? []
  }

  async function listAll(dirPath: string, options?: FileOptions): Promise<FileNode[]> {
    return fileApi()?.listAll({ dirPath, options }) ?? []
  }

  async function listFileNames(dirPath: string, options?: FileOptions): Promise<string[]> {
    return fileApi()?.listFileNames({ dirPath, options }) ?? []
  }

  async function listFolderNames(dirPath: string, options?: FileOptions): Promise<string[]> {
    return fileApi()?.listFolderNames({ dirPath, options }) ?? []
  }

  async function listAllNames(dirPath: string, options?: FileOptions): Promise<string[]> {
    return fileApi()?.listAllNames({ dirPath, options }) ?? []
  }

  // ===== Async variants =====
  async function readTextAsync(filePath: string, encoding = 'utf-8'): Promise<string> {
    return fileApi()?.readAsync(filePath, encoding) ?? ''
  }

  async function writeTextAsync(args: { filePath: string, data: string, encoding?: string }): Promise<void> {
    await fileApi()?.writeAsync(args)
  }

  async function fileExistsAsync(filePath: string): Promise<boolean> {
    return fileApi()?.existsAsync(filePath) ?? false
  }

  async function readJSONAsync<T>(filePath: string): Promise<T | null> {
    return (fileApi()?.readJSONAsync(filePath) as Promise<T | null>) ?? null
  }

  async function writeJSONAsync<T>(filePath: string, obj: T, space = 2): Promise<void> {
    await fileApi()?.writeJSONAsync({ filePath, obj, space })
  }

  async function createFolderAsync(dirPath: string): Promise<void> {
    await fileApi()?.createFolderAsync(dirPath)
  }

  async function listFilesAsync(dirPath: string, options?: FileOptions): Promise<FileNode[]> {
    return fileApi()?.listFilesAsync({ dirPath, options }) ?? []
  }

  async function listAllAsync(dirPath: string, options?: FileOptions): Promise<FileNode[]> {
    return fileApi()?.listAllAsync({ dirPath, options }) ?? []
  }

  async function imageToDataUrl(imagePath: string): Promise<string | null> {
    return fileApi()?.imageToDataUrl(imagePath) ?? null
  }

  return {
    isElectron,
    selectFiles,
    selectFolder,
    selectSaveFile,
    pickFile,
    pickFolder,
    readText,
    writeText,
    appendText,
    fileExists,
    deleteFile,
    readJSON,
    writeJSON,
    createFolder,
    rename,
    copyFile,
    copyFolder,
    getTree,
    listFiles,
    listFolders,
    listAll,
    listFileNames,
    listFolderNames,
    listAllNames,
    readTextAsync,
    writeTextAsync,
    fileExistsAsync,
    readJSONAsync,
    writeJSONAsync,
    createFolderAsync,
    listFilesAsync,
    listAllAsync,
    imageToDataUrl
  }
}
