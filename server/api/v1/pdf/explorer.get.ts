import { getAreaFolderTree } from '#server/modules/pdf/directory'
import { runPdf } from '#server/utils/pdfApi'

/**
 * First level of every workspace area, so the library can show one root at
 * .data/pdf without walking the whole tree. `?depth=full` returns the complete
 * trees, which the explorer asks for once a search term needs deep matching.
 */
export default defineEventHandler(async (event) => {
  const deep = getQuery(event).depth === 'full'
  const depth = deep ? Number.POSITIVE_INFINITY : 1

  return runPdf(() => ({
    success: true,
    data: {
      sources: getAreaFolderTree('sources', depth),
      inputs: getAreaFolderTree('inputs', depth),
      split: getAreaFolderTree('split', depth),
      images: getAreaFolderTree('images', depth),
      merged: getAreaFolderTree('merged', depth),
      products: getAreaFolderTree('products', depth),
      office: getAreaFolderTree('office', depth)
    }
  }))
})
