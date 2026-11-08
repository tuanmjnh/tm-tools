import { planMigration, executeMigration } from '#server/modules/document/legacy-migration'
import { DocumentError } from '#server/modules/document/operations'

export default defineEventHandler(async (event) => {
  const method = event.method

  if (method === 'GET') {
    const query = getQuery(event)
    const dryRun = query.dryRun !== 'false'
    const plan = planMigration()
    const summary = executeMigration(plan, dryRun)
    return { success: true, data: summary }
  }

  if (method === 'POST') {
    const body = await readBody<{ dryRun?: boolean, version?: string }>(event)
    const dryRun = body?.dryRun ?? true
    const plan = planMigration(body?.version)
    const summary = executeMigration(plan, dryRun)
    return { success: true, data: summary }
  }

  throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED', { method })
})
