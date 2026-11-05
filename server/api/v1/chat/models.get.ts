import { fetchRelayCatalog } from '../../../utils/aiRelay'
import { requireChatUser } from '../../../utils/chatAuth'

export interface AvailableChatModel {
  connectionId: string
  connectionName: string
  provider: string
  modelId: string
  displayName: string
  isPrimary?: boolean
}

/**
 * Chat model catalogue. The hub relay owns which connections this app may
 * use and which models are enabled, so the picker never fabricates an entry:
 * a connection is listed only when it can actually answer a chat call.
 */
export default defineEventHandler(async (event) => {
  requireChatUser(event)

  const connections = await fetchRelayCatalog(event)
  const data: AvailableChatModel[] = []

  for (const connection of connections) {
    if (!connection.hasKey) continue
    for (const model of connection.models) {
      data.push({
        connectionId: connection.connectionId,
        connectionName: connection.name,
        provider: connection.provider,
        modelId: model.modelId,
        displayName: model.displayName || model.modelId,
        isPrimary: connection.model === model.modelId
      })
    }
  }

  return { success: true, data }
})
