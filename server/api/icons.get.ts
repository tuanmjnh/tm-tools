import lucideData from '@iconify-json/lucide/icons.json'
import simpleIconsData from '@iconify-json/simple-icons/icons.json'

interface IconSet {
  icons: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const auth = event.context.auth
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'error.unauthorized', message: 'Unauthorized' })

  const query = getQuery(event)
  const collection = (query.collection as string) || 'lucide'
  const search = ((query.search as string) || '').toLowerCase()
  const cursor = (query.cursor as string) || ''
  const limit = parseInt(query.limit as string) || 100

  const iconSet = collection === 'simple-icons' ? simpleIconsData : lucideData

  let allIcons = Object.keys((iconSet as IconSet).icons).map(name => `i-${collection}:${name}`)

  if (search) {
    allIcons = allIcons.filter(name => name.toLowerCase().includes(search))
  }

  let startIndex = 0
  if (cursor) {
    const foundIndex = allIcons.indexOf(cursor)
    if (foundIndex !== -1) startIndex = foundIndex + 1
  }

  const icons = allIcons.slice(startIndex, startIndex + limit)
  const nextCursor = icons.length > 0 ? icons[icons.length - 1] : null

  return { icons, nextCursor, hasMore: startIndex + limit < allIcons.length }
})
