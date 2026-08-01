import { getUsersPaginated } from '../../modules/users/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cursor = query.cursor as string | undefined
  const limit = query.limit ? parseInt(query.limit as string, 10) : 10

  const { users, nextCursor } = await getUsersPaginated(cursor, limit)
  return { success: true, data: users, nextCursor }
})
