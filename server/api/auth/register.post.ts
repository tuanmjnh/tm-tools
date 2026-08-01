import type { RegisterRequest } from '../../../types/auth'
import { getAuthService } from '../../modules/auth/service'

export default defineEventHandler(async (event) => {
  const body = await readBody<RegisterRequest>(event)
  const auth = await getAuthService()
  const result = await auth.register(body)
  return { success: true, data: result }
})
