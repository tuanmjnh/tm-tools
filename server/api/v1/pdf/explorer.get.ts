import { getAreaFolderTree } from '#server/modules/pdf/directory'
import { runPdf } from '#server/utils/pdfApi'

/** Folder trees for every workspace area, so the library can show one root at .data/pdf. */
export default defineEventHandler(async () => {
  return runPdf(() => ({
    success: true,
    data: {
      sources: getAreaFolderTree('sources'),
      inputs: getAreaFolderTree('inputs'),
      split: getAreaFolderTree('split'),
      images: getAreaFolderTree('images'),
      merged: getAreaFolderTree('merged'),
      products: getAreaFolderTree('products'),
      office: getAreaFolderTree('office')
    }
  }))
})
