import { updateUser } from '../../modules/users/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const body = await readBody(event)
  const user = await updateUser(query.id as string, body)
  return { success: true, data: user }
})
