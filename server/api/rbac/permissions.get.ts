import { getAvailableModules } from '../../modules/rbac/service'

export default defineEventHandler(async () => {
  const modules = getAvailableModules()
  return { success: true, data: modules }
})
