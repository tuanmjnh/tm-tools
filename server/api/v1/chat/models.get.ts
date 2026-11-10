import { fetchRelayCatalog } from '../../../utils/aiRelay'
import { requireChatUser } from '../../../utils/chatAuth'
import { chatModelsFromCatalog } from '../../../utils/relayModels'

/**
 * Chat model catalogue. The hub relay owns which connections this app may
 * use and which models are enabled, so the picker never fabricates an entry:
 * a connection is listed only when it can actually answer a chat call, and
 * non-text models (audio, images, embeddings) are dropped like the PDF
 * extractor does.
 */
export default defineEventHandler(async (event) => {
  requireChatUser(event)

  const connections = await fetchRelayCatalog(event)
  return { success: true, data: chatModelsFromCatalog(connections) }
})
