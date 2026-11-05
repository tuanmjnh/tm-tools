import { readAudit } from '#server/modules/pdf/audit'
import { runPdf } from '#server/utils/pdfApi'

/** Newest last; `?limit=` trims the tail so the UI never pages the whole log. */
export default defineEventHandler(async (event) => {
  return runPdf(() => {
    const raw = Number(getQuery(event).limit)
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 500) : undefined
    return { success: true, data: readAudit(limit) }
  })
})
