import { readLibrary } from '#server/modules/pdf/library'

export default defineEventHandler(async () => {
  return { success: true, data: readLibrary() }
})
