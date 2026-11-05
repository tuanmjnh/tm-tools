import { listJobs } from '#server/modules/pdf/extract/jobs'

export default defineEventHandler(async () => {
  return { success: true, data: listJobs() }
})
