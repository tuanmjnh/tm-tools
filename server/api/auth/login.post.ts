import type { LoginRequest } from '../../../types/auth'
import { getAuthService } from '../../modules/auth/service'

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginRequest>(event)
  const ip = getHeader(event, 'x-forwarded-for') || event.node.req.socket.remoteAddress
  const userAgent = getHeader(event, 'user-agent')

  try {
    const auth = await getAuthService()
    const result = await auth.login(body, ip, userAgent)
    return { success: true, data: result }
  } catch (err: any) {
    console.error('[Login Error]', err.message)
    console.error('[Login Error Stack]', err.stack?.split('\n').slice(0, 6).join('\n'))
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: 'error.serverError', message: err.message || 'Server Error' })
  }
})
