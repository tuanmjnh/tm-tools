import { createUser } from '../../modules/users/service'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = await createUser(body)
  return { success: true, data: user }
})
