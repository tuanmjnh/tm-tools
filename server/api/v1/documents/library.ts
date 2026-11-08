import {
  listLibraryDirectory,
  createLibraryFolder,
  deleteLibraryItem,
  renameLibraryItem,
  type DocumentLibraryRoot
} from '#server/modules/document/library'
import { DocumentError } from '#server/modules/document/operations'

export default defineEventHandler(async (event) => {
  const method = event.method
  const query = getQuery(event)
  const rootParam = (query.root as string) || 'input'

  if (rootParam !== 'input' && rootParam !== 'output') {
    throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED', { root: rootParam })
  }
  const root = rootParam as DocumentLibraryRoot

  if (method === 'GET') {
    const folder = (query.folder as string) || ''
    const data = listLibraryDirectory(root, folder)
    return { success: true, data }
  }

  if (method === 'POST') {
    const body = await readBody<{ action?: string, parentFolder?: string, path?: string, name?: string, newName?: string }>(event)
    const action = body?.action || 'createFolder'

    if (action === 'createFolder') {
      const parentFolder = body?.parentFolder || ''
      const name = body?.name || ''
      const item = createLibraryFolder(root, parentFolder, name)
      return { success: true, data: item }
    }

    if (action === 'delete') {
      const itemPath = body?.path || ''
      const res = deleteLibraryItem(root, itemPath)
      return { success: true, data: res }
    }

    if (action === 'rename') {
      const itemPath = body?.path || ''
      const newName = body?.newName || ''
      const item = renameLibraryItem(root, itemPath, newName)
      return { success: true, data: item }
    }

    throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED', { action })
  }

  throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED', { method })
})
