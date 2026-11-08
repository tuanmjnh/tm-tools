import { getAreaFolderTree } from '#server/modules/pdf/directory'
import { runPdf } from '#server/utils/pdfApi'

/**
 * First level of both workspace roots, so the library can show one tree at
 * .data/pdf without walking everything. `?depth=full` returns the complete
 * trees, which the explorer asks for once a search term needs deep matching.
 */
export default defineEventHandler(async (event) => {
  const deep = getQuery(event).depth === 'full'
  const depth = deep ? Number.POSITIVE_INFINITY : 1

  return runPdf(() => ({
    success: true,
    data: {
      input: getAreaFolderTree('input', depth),
      output: getAreaFolderTree('output', depth)
    }
  }))
})
