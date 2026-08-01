import { deleteUser } from '../../modules/users/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const ids = (query.id as string).split(',')
  for (const id of ids) {
    if (id) {
      await deleteUser(id)
    }
  }
  return { success: true }
})
